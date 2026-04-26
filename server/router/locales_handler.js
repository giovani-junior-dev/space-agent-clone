import path from "node:path";
import { fileURLToPath } from "node:url";

import { sendFile, sendNotFound } from "./responses.js";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_LOCALES_DIR = path.resolve(CURRENT_DIR, "..", "..", "locales");

const LOCALE_PATH_PATTERN = /^\/locales\/([A-Za-z]{2}(?:-[A-Za-z]{2})?)\/([A-Za-z][A-Za-z0-9_-]*)\.json$/u;

function resolveLocaleFilePath(rootDir, pathname) {
  const match = String(pathname || "").match(LOCALE_PATH_PATTERN);
  if (!match) {
    return null;
  }

  const [, locale, namespace] = match;
  const filePath = path.resolve(rootDir, locale, `${namespace}.json`);
  const relative = path.relative(rootDir, filePath);

  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }

  return filePath;
}

function handleLocaleRequest(res, pathname, options = {}) {
  const localesDir = options.localesDir || DEFAULT_LOCALES_DIR;
  const filePath = resolveLocaleFilePath(localesDir, pathname);

  if (!filePath) {
    sendNotFound(res);
    return true;
  }

  sendFile(res, filePath);
  return true;
}

function isLocaleRequest(pathname) {
  return String(pathname || "").startsWith("/locales/");
}

export { DEFAULT_LOCALES_DIR, handleLocaleRequest, isLocaleRequest };
