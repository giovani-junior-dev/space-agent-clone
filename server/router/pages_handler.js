import fs from "node:fs/promises";
import path from "node:path";

import { getLocale, t } from "../lib/i18n.js";
import { areGuestUsersAllowed, isSingleUserApp } from "../lib/utils/runtime_params.js";
import { runTrackedMutation } from "../runtime/request_mutations.js";
import { createNoStoreHeaders, sendFile, sendJson, sendNotFound, sendRedirect } from "./responses.js";

const LEGACY_ROUTE_REDIRECTS = new Map([
  ["/index.html", "/"],
  ["/login.html", "/login"],
  ["/enter.html", "/enter"],
  ["/admin.html", "/admin"]
]);

const LOGOUT_ROUTE = "/logout";
const PAGE_RESOURCE_PREFIX = "/pages/res/";
const ROOT_PAGE_RESOURCE_ALIASES = new Map([
  ["/favicon.ico", "/res/favicon.ico"],
  ["/favicon-16x16.png", "/res/favicon-16x16.png"],
  ["/favicon-32x32.png", "/res/favicon-32x32.png"],
  ["/apple-touch-icon.png", "/res/apple-touch-icon.png"],
  ["/android-chrome-192x192.png", "/res/android-chrome-192x192.png"],
  ["/android-chrome-512x512.png", "/res/android-chrome-512x512.png"],
  ["/site.webmanifest", "/res/site.webmanifest"],
  ["/robots.txt", "/robots.txt"],
  ["/llms.txt", "/llms.txt"],
  ["/llms-full.txt", "/llms-full.txt"],
  ["/sitemap.xml", "/sitemap.xml"]
]);
const FRONTEND_CONFIG_META_NAME = "space-config";
const ENTER_GUARD_PLACEHOLDER = "<!-- SPACE_SINGLE_USER_ENTER_GUARD -->";
const ENTER_GUARD_SCRIPT_TAG = '    <script src="/pages/res/enter-guard.js"></script>';
const PROJECT_VERSION_PLACEHOLDER = "<!-- SPACE_PROJECT_VERSION -->";
const SHARE_SPACE_ROUTE_PATTERN = /^\/share\/space\/([A-Za-z0-9]{8})$/u;

function createSessionCleanupHeaders(requestContext, auth) {
  if (
    requestContext?.user?.shouldClearSessionCookie &&
    auth &&
    typeof auth.createClearedSessionCookieHeader === "function"
  ) {
    return {
      "Set-Cookie": auth.createClearedSessionCookieHeader()
    };
  }

  return {};
}

function createClearedSessionHeaders(auth) {
  if (auth && typeof auth.createClearedSessionCookieHeader === "function") {
    return {
      "Set-Cookie": auth.createClearedSessionCookieHeader()
    };
  }

  return {};
}

function escapeHtmlAttribute(value) {
  return String(value ?? "")
    .replace(/&/gu, "&amp;")
    .replace(/"/gu, "&quot;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;");
}

function buildFrontendConfigMetaTags(runtimeParams) {
  const entries =
    runtimeParams && typeof runtimeParams.listFrontendExposed === "function"
      ? runtimeParams.listFrontendExposed()
      : [];

  if (entries.length === 0) {
    return "";
  }

  return entries
    .map(
      (entry) =>
        `    <meta name="${FRONTEND_CONFIG_META_NAME}" data-space-param="${escapeHtmlAttribute(entry.name)}" data-space-type="${escapeHtmlAttribute(entry.type)}" content="${escapeHtmlAttribute(entry.content)}" />`
    )
    .join("\n");
}

function injectFrontendConfigMetaTags(sourceText, runtimeParams) {
  const metaTags = buildFrontendConfigMetaTags(runtimeParams);

  if (!metaTags) {
    return sourceText;
  }

  if (/<\/head>/iu.test(sourceText)) {
    return sourceText.replace(/<\/head>/iu, `${metaTags}\n  </head>`);
  }

  return `${metaTags}\n${sourceText}`;
}

function hasEnterLauncherAccess(requestContext, runtimeParams) {
  return Boolean(requestContext?.user?.isAuthenticated) || isSingleUserApp(runtimeParams);
}

function injectEnterGuard(sourceText, options = {}) {
  const pageName = String(options.pageName || "");

  if (!sourceText.includes(ENTER_GUARD_PLACEHOLDER)) {
    return sourceText;
  }

  if (
    !["index.html", "admin.html"].includes(pageName) ||
    !hasEnterLauncherAccess(options.requestContext, options.runtimeParams)
  ) {
    return sourceText.replace(ENTER_GUARD_PLACEHOLDER, "");
  }

  return sourceText.replace(ENTER_GUARD_PLACEHOLDER, ENTER_GUARD_SCRIPT_TAG);
}

// Server-side i18n template substitution. Supports:
//   {{t:namespace:key.path}}        - raw HTML body text
//   {{t:namespace:key.path|attr}}   - HTML attribute (escapes &, ", <, >)
//   {{t:namespace:key.path|js}}     - JS string literal value (JSON-stringified
//                                     without surrounding quotes), safe to drop
//                                     between existing "..." quotes in scripts
// Used by pre-auth pages (login) where the frontend i18n runtime is not
// available before sign-in. Locale is resolved from cookie, query, or
// Accept-Language via `getLocale(req)`.
const I18N_PLACEHOLDER_PATTERN = /\{\{t:([a-zA-Z][a-zA-Z0-9]*):([^}|]+?)(?:\|(attr|js))?\}\}/g;

function injectI18nPlaceholders(sourceText, req) {
  const locale = getLocale(req);

  let body = sourceText;

  // Set <html lang="..."> to the active locale on every page so assistive
  // tooling and the browser pick the right language hooks. Idempotent.
  body = body.replace(/<html\b([^>]*?)\blang="[^"]*"([^>]*)>/iu, `<html$1lang="${locale}"$2>`);

  if (!body.includes("{{t:")) {
    return body;
  }

  return body.replace(I18N_PLACEHOLDER_PATTERN, (match, namespace, key, modifier) => {
    const value = t(`${namespace}:${key}`, { lng: locale });
    if (typeof value !== "string") {
      return match;
    }
    if (modifier === "attr") {
      return escapeHtmlAttribute(value);
    }
    if (modifier === "js") {
      // JSON.stringify produces a quoted string. Strip the surrounding quotes
      // so the call site can keep its existing "..." wrappers and remain a
      // syntactically valid JS literal.
      const json = JSON.stringify(value);
      return json.slice(1, json.length - 1);
    }
    return value;
  });
}

function injectProjectVersion(sourceText, projectVersion) {
  if (!sourceText.includes(PROJECT_VERSION_PLACEHOLDER)) {
    return sourceText;
  }

  return sourceText.replaceAll(
    PROJECT_VERSION_PLACEHOLDER,
    escapeHtmlAttribute(projectVersion || "unknown")
  );
}

async function sendPageHtml(res, filePath, options = {}) {
  let sourceText;

  try {
    sourceText = await fs.readFile(filePath, "utf8");
  } catch {
    sendNotFound(res, options.headers);
    return;
  }

  const body = injectI18nPlaceholders(
    injectFrontendConfigMetaTags(
      injectProjectVersion(
        injectEnterGuard(sourceText, {
          pageName: options.pageName,
          requestContext: options.requestContext,
          runtimeParams: options.runtimeParams
        }),
        options.projectVersion
      ),
      options.runtimeParams
    ),
    options.req
  );

  res.writeHead(200, createNoStoreHeaders({
    ...(options.headers || {}),
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "text/html; charset=utf-8"
  }));
  res.end(body);
}

async function handleLogoutRequest(res, options = {}) {
  const { auth, requestContext } = options;

  try {
    if (
      requestContext?.user?.isAuthenticated &&
      auth &&
      typeof auth.revokeSession === "function"
    ) {
      await runTrackedMutation(options, async () =>
        auth.revokeSession(requestContext.user.sessionToken, requestContext.user.username)
      );
    }
  } catch {
    sendJson(res, 500, {
      error: "Internal server error"
    });
    return;
  }

  sendRedirect(res, "/login", createClearedSessionHeaders(auth));
}

function resolvePathWithinRoot(rootDir, requestPath) {
  const filePath = path.resolve(rootDir, `.${requestPath}`);
  const relativePath = path.relative(rootDir, filePath);

  if (
    relativePath === "" ||
    relativePath === "." ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) {
    return null;
  }

  return filePath;
}

function resolveSharePageRequest(pagesDir, pathname) {
  const normalizedPath = path.posix.normalize(pathname || "/");

  if (normalizedPath !== "/" && normalizedPath.endsWith("/")) {
    const trimmedPath = normalizedPath.slice(0, -1);

    if (SHARE_SPACE_ROUTE_PATTERN.test(trimmedPath)) {
      return {
        kind: "redirect",
        location: trimmedPath
      };
    }
  }

  if (!SHARE_SPACE_ROUTE_PATTERN.test(normalizedPath)) {
    return null;
  }

  return {
    filePath: resolvePathWithinRoot(pagesDir, "/share_space.html"),
    kind: "file",
    pageName: "share_space.html"
  };
}

function resolvePageRequest(pagesDir, pathname) {
  const normalizedPath = path.posix.normalize(pathname || "/");

  if (LEGACY_ROUTE_REDIRECTS.has(normalizedPath)) {
    return {
      kind: "redirect",
      location: LEGACY_ROUTE_REDIRECTS.get(normalizedPath)
    };
  }

  if (normalizedPath !== "/" && normalizedPath.endsWith("/")) {
    return {
      kind: "redirect",
      location: normalizedPath.slice(0, -1)
    };
  }

  const pageName =
    normalizedPath === "/"
      ? "index.html"
      : normalizedPath.match(/^\/([a-z0-9_-]+)$/i)?.[1]
        ? `${normalizedPath.slice(1)}.html`
        : "";

  if (!pageName) {
    return null;
  }

  return {
    filePath: resolvePathWithinRoot(pagesDir, `/${pageName}`),
    kind: "file",
    pageName
  };
}

function resolvePageResourceRequest(pagesDir, pathname) {
  const normalizedPath = path.posix.normalize(pathname || "/");

  if (!normalizedPath.startsWith(PAGE_RESOURCE_PREFIX)) {
    return null;
  }

  return {
    filePath: resolvePathWithinRoot(pagesDir, normalizedPath.slice("/pages".length)),
    kind: "resource"
  };
}

function resolveRootPageResourceRequest(pagesDir, pathname) {
  const normalizedPath = path.posix.normalize(pathname || "/");
  const aliasedPath = ROOT_PAGE_RESOURCE_ALIASES.get(normalizedPath);

  if (!aliasedPath) {
    return null;
  }

  return {
    filePath: resolvePathWithinRoot(pagesDir, aliasedPath),
    kind: "resource"
  };
}

async function handlePageRequest(res, requestUrl, options = {}) {
  const { auth, pagesDir, requestContext, runtimeParams } = options;

  if (requestUrl.pathname === LOGOUT_ROUTE) {
    await handleLogoutRequest(res, options);
    return;
  }

  const pageResourceRequest = resolvePageResourceRequest(pagesDir, requestUrl.pathname);
  const rootPageResourceRequest = resolveRootPageResourceRequest(pagesDir, requestUrl.pathname);
  const resourceRequest = pageResourceRequest || rootPageResourceRequest;

  if (resourceRequest) {
    if (!resourceRequest.filePath) {
      sendNotFound(res, createSessionCleanupHeaders(requestContext, auth));
      return;
    }

    sendFile(res, resourceRequest.filePath, {
      headers: createNoStoreHeaders(createSessionCleanupHeaders(requestContext, auth))
    });
    return;
  }

  const sharePageRequest = resolveSharePageRequest(pagesDir, requestUrl.pathname);

  if (sharePageRequest) {
    if (sharePageRequest.kind === "redirect") {
      sendRedirect(res, sharePageRequest.location, createSessionCleanupHeaders(requestContext, auth));
      return;
    }

    if (!areGuestUsersAllowed(runtimeParams)) {
      sendNotFound(res, createSessionCleanupHeaders(requestContext, auth));
      return;
    }

    if (!sharePageRequest.filePath) {
      sendNotFound(res, createSessionCleanupHeaders(requestContext, auth));
      return;
    }

    await sendPageHtml(res, sharePageRequest.filePath, {
      headers: createSessionCleanupHeaders(requestContext, auth),
      pageName: sharePageRequest.pageName,
      projectVersion: options.projectVersion,
      req: options.req,
      requestContext,
      runtimeParams
    });
    return;
  }

  const pageRequest = resolvePageRequest(pagesDir, requestUrl.pathname);

  if (!pageRequest) {
    sendNotFound(res);
    return;
  }

  if (pageRequest.kind === "redirect") {
    sendRedirect(res, pageRequest.location, createSessionCleanupHeaders(requestContext, auth));
    return;
  }

  const isLoginPage = pageRequest.pageName === "login.html";
  const isEnterPage = pageRequest.pageName === "enter.html";
  const canAccessEnterPage = hasEnterLauncherAccess(requestContext, runtimeParams);

  if (isEnterPage && !canAccessEnterPage) {
    sendRedirect(res, "/login", createSessionCleanupHeaders(requestContext, auth));
    return;
  }

  if (isLoginPage && requestContext?.user?.isAuthenticated) {
    sendRedirect(res, "/", createSessionCleanupHeaders(requestContext, auth));
    return;
  }

  if (!isLoginPage && !isEnterPage && !requestContext?.user?.isAuthenticated) {
    sendRedirect(res, "/login", createSessionCleanupHeaders(requestContext, auth));
    return;
  }

  if (!pageRequest.filePath) {
    sendNotFound(res);
    return;
  }

  await sendPageHtml(res, pageRequest.filePath, {
    headers: createSessionCleanupHeaders(requestContext, auth),
    pageName: pageRequest.pageName,
    projectVersion: options.projectVersion,
    req: options.req,
    requestContext,
    runtimeParams
  });
}

export { handlePageRequest };
