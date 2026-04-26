import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import i18next from "i18next";

import { getRequestContext } from "../router/request_context.js";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_LOCALES_DIR = path.resolve(CURRENT_DIR, "..", "..", "locales");

const SUPPORTED_LOCALES = ["en", "pt-BR"];
const FALLBACK_LOCALE = "en";
const DEFAULT_NAMESPACE = "common";
const NAMESPACES = ["common", "errors", "admin", "fileExplorer", "dashboard"];

let initializationPromise = null;
let resolvedLocalesDir = DEFAULT_LOCALES_DIR;

function normalizeLocale(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return null;
  }

  const lower = value.toLowerCase();

  // Direct match (case-insensitive against supported list).
  for (const supported of SUPPORTED_LOCALES) {
    if (supported.toLowerCase() === lower) {
      return supported;
    }
  }

  // Match base language ("pt" -> "pt-BR", "en-US" -> "en").
  const base = lower.split(/[-_]/u)[0];

  for (const supported of SUPPORTED_LOCALES) {
    if (supported.toLowerCase().split("-")[0] === base) {
      return supported;
    }
  }

  return null;
}

function parseAcceptLanguageHeader(headerValue) {
  const value = String(headerValue || "");
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => {
      const [tag, ...params] = entry.trim().split(";");
      let quality = 1;
      for (const param of params) {
        const match = param.trim().match(/^q\s*=\s*(.+)$/iu);
        if (match) {
          const parsed = Number.parseFloat(match[1]);
          if (Number.isFinite(parsed)) {
            quality = parsed;
          }
        }
      }
      return { tag: tag.trim(), quality };
    })
    .filter((entry) => entry.tag)
    .sort((left, right) => right.quality - left.quality)
    .map((entry) => entry.tag);
}

async function loadNamespaceResources(localesDir) {
  const resources = {};

  for (const locale of SUPPORTED_LOCALES) {
    resources[locale] = {};

    for (const namespace of NAMESPACES) {
      const filePath = path.join(localesDir, locale, `${namespace}.json`);
      try {
        const raw = await fs.readFile(filePath, "utf8");
        resources[locale][namespace] = raw.trim() ? JSON.parse(raw) : {};
      } catch (error) {
        if (error && error.code === "ENOENT") {
          resources[locale][namespace] = {};
          continue;
        }
        throw new Error(
          `Failed to load locale resource ${locale}/${namespace}.json: ${error.message}`
        );
      }
    }
  }

  return resources;
}

async function initializeI18n(options = {}) {
  if (initializationPromise) {
    return initializationPromise;
  }

  resolvedLocalesDir = options.localesDir
    ? path.resolve(options.localesDir)
    : DEFAULT_LOCALES_DIR;

  initializationPromise = (async () => {
    const resources = await loadNamespaceResources(resolvedLocalesDir);

    await i18next.init({
      resources,
      lng: FALLBACK_LOCALE,
      fallbackLng: FALLBACK_LOCALE,
      supportedLngs: SUPPORTED_LOCALES,
      ns: NAMESPACES,
      defaultNS: DEFAULT_NAMESPACE,
      interpolation: {
        escapeValue: false
      },
      returnNull: false,
      returnEmptyString: false,
      initImmediate: false
    });

    return i18next;
  })();

  return initializationPromise;
}

function loadNamespaceResourcesSync(localesDir) {
  const resources = {};

  for (const locale of SUPPORTED_LOCALES) {
    resources[locale] = {};

    for (const namespace of NAMESPACES) {
      const filePath = path.join(localesDir, locale, `${namespace}.json`);
      try {
        const raw = fsSync.readFileSync(filePath, "utf8");
        resources[locale][namespace] = raw.trim() ? JSON.parse(raw) : {};
      } catch (error) {
        if (error && error.code === "ENOENT") {
          resources[locale][namespace] = {};
          continue;
        }
        throw new Error(
          `Failed to load locale resource ${locale}/${namespace}.json: ${error.message}`
        );
      }
    }
  }

  return resources;
}

// Synchronous fallback initializer used by code paths that hit `t()` before the
// async `initializeI18n()` ran (tests, scripts, early boot). Safe to call
// repeatedly — i18next.init returns a noop after the first run.
function initializeI18nSync(options = {}) {
  if (i18next.isInitialized) {
    return i18next;
  }

  resolvedLocalesDir = options.localesDir
    ? path.resolve(options.localesDir)
    : DEFAULT_LOCALES_DIR;

  const resources = loadNamespaceResourcesSync(resolvedLocalesDir);

  i18next.init({
    resources,
    lng: FALLBACK_LOCALE,
    fallbackLng: FALLBACK_LOCALE,
    supportedLngs: SUPPORTED_LOCALES,
    ns: NAMESPACES,
    defaultNS: DEFAULT_NAMESPACE,
    interpolation: {
      escapeValue: false
    },
    returnNull: false,
    returnEmptyString: false,
    initImmediate: false
  });

  return i18next;
}

async function reloadResources() {
  const resources = await loadNamespaceResources(resolvedLocalesDir);

  for (const locale of SUPPORTED_LOCALES) {
    for (const namespace of NAMESPACES) {
      i18next.addResourceBundle(
        locale,
        namespace,
        resources[locale][namespace] || {},
        true,
        true
      );
    }
  }
}

const LOCALE_COOKIE_KEY = "space_locale";

function parseCookieHeader(headerValue) {
  const value = String(headerValue || "");
  if (!value) {
    return {};
  }

  const out = {};
  for (const piece of value.split(";")) {
    const eq = piece.indexOf("=");
    if (eq < 0) {
      continue;
    }
    const name = piece.slice(0, eq).trim();
    if (!name) {
      continue;
    }
    let raw = piece.slice(eq + 1).trim();
    if (raw.length >= 2 && raw[0] === "\"" && raw[raw.length - 1] === "\"") {
      raw = raw.slice(1, -1);
    }
    try {
      out[name] = decodeURIComponent(raw);
    } catch {
      out[name] = raw;
    }
  }
  return out;
}

function getLocale(req) {
  // 1. ?lang= query parameter (explicit override, e.g. for sharing links).
  const url = req?.url
    ? (() => {
        try {
          return new URL(req.url, "http://localhost");
        } catch {
          return null;
        }
      })()
    : null;
  const queryLang = url?.searchParams?.get("lang");
  const fromQuery = normalizeLocale(queryLang);
  if (fromQuery) {
    return fromQuery;
  }

  // 2. space_locale cookie set by the frontend selector.
  const cookieHeader = req?.headers?.cookie;
  if (cookieHeader) {
    const cookies = parseCookieHeader(cookieHeader);
    const fromCookie = normalizeLocale(cookies[LOCALE_COOKIE_KEY]);
    if (fromCookie) {
      return fromCookie;
    }
  }

  // 3. Accept-Language header
  const acceptLanguage = req?.headers?.["accept-language"];
  for (const tag of parseAcceptLanguageHeader(acceptLanguage)) {
    const matched = normalizeLocale(tag);
    if (matched) {
      return matched;
    }
  }

  // 4. SPACE_LOCALE env
  const envLocale = normalizeLocale(process.env.SPACE_LOCALE);
  if (envLocale) {
    return envLocale;
  }

  // 5. Fallback
  return FALLBACK_LOCALE;
}

function t(key, options = {}) {
  if (!i18next.isInitialized) {
    try {
      initializeI18nSync();
    } catch {
      return String(key);
    }
  }

  const { lng, ...rest } = options || {};
  const targetLng = normalizeLocale(lng) || FALLBACK_LOCALE;
  return i18next.t(key, { ...rest, lng: targetLng });
}

// Resolve the active locale for the in-flight request without requiring callers
// to pass `req` down through every layer. Falls back to the default locale when
// no request context is active (e.g. boot-time code or background jobs).
function getRequestLocale() {
  try {
    const context = getRequestContext();
    if (context && context.req) {
      return getLocale(context.req);
    }
  } catch {
    // ignore - storage not initialized
  }
  return FALLBACK_LOCALE;
}

// Convenience helper for backend error messages: looks up the request-scoped
// locale automatically, so call sites stay short:
//   throw createHttpError(tError("errors:file.copyFailed"), 500);
function tError(key, vars = {}) {
  return t(key, { ...vars, lng: getRequestLocale() });
}

export {
  FALLBACK_LOCALE,
  NAMESPACES,
  SUPPORTED_LOCALES,
  getLocale,
  getRequestLocale,
  initializeI18n,
  initializeI18nSync,
  normalizeLocale,
  reloadResources,
  t,
  tError
};
