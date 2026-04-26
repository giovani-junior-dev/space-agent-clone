import i18next from "/mod/_core/framework/js/vendor/i18next.js";

const SUPPORTED_LOCALES = ["en", "pt-BR"];
const FALLBACK_LOCALE = "en";
const DEFAULT_NAMESPACE = "common";
const NAMESPACES = ["common", "errors", "admin", "fileExplorer", "dashboard"];
const STORAGE_KEY = "spaceLocale";
const LOCALE_CHANGED_EVENT = "space:locale-changed";

let initializationPromise = null;

function normalizeLocale(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return null;
  }

  const lower = value.toLowerCase();

  for (const supported of SUPPORTED_LOCALES) {
    if (supported.toLowerCase() === lower) {
      return supported;
    }
  }

  const base = lower.split(/[-_]/u)[0];

  for (const supported of SUPPORTED_LOCALES) {
    if (supported.toLowerCase().split("-")[0] === base) {
      return supported;
    }
  }

  return null;
}

function readStoredLocale() {
  try {
    return normalizeLocale(window.localStorage?.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function writeStoredLocale(locale) {
  try {
    window.localStorage?.setItem(STORAGE_KEY, locale);
  } catch {
    /* noop */
  }
}

function readQueryLocale() {
  try {
    const params = new URLSearchParams(window.location?.search || "");
    return normalizeLocale(params.get("lang"));
  } catch {
    return null;
  }
}

function readNavigatorLocale() {
  const candidates = [];
  if (Array.isArray(navigator?.languages)) {
    candidates.push(...navigator.languages);
  }
  if (navigator?.language) {
    candidates.push(navigator.language);
  }

  for (const candidate of candidates) {
    const normalized = normalizeLocale(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function detectInitialLocale() {
  return (
    readStoredLocale() ||
    readQueryLocale() ||
    readNavigatorLocale() ||
    FALLBACK_LOCALE
  );
}

async function fetchNamespace(locale, namespace) {
  const url = `/locales/${encodeURIComponent(locale)}/${encodeURIComponent(namespace)}.json`;
  try {
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: { Accept: "application/json" }
    });
    if (!response.ok) {
      return {};
    }
    const text = await response.text();
    return text.trim() ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

async function loadResourcesForLocale(locale) {
  const entries = await Promise.all(
    NAMESPACES.map(async (namespace) => [namespace, await fetchNamespace(locale, namespace)])
  );

  const bundle = {};
  for (const [namespace, payload] of entries) {
    bundle[namespace] = payload || {};
  }
  return bundle;
}

async function ensureLocaleLoaded(locale) {
  if (i18next.hasResourceBundle?.(locale, DEFAULT_NAMESPACE)) {
    return;
  }

  const bundle = await loadResourcesForLocale(locale);
  for (const namespace of NAMESPACES) {
    i18next.addResourceBundle(locale, namespace, bundle[namespace] || {}, true, true);
  }
}

function dispatchLocaleChanged(locale) {
  try {
    window.dispatchEvent(new CustomEvent(LOCALE_CHANGED_EVENT, { detail: { locale } }));
  } catch {
    /* noop */
  }
}

async function initI18n() {
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    const initialLocale = detectInitialLocale();
    const initialBundle = await loadResourcesForLocale(initialLocale);
    const fallbackBundle =
      initialLocale === FALLBACK_LOCALE ? null : await loadResourcesForLocale(FALLBACK_LOCALE);

    const resources = {
      [initialLocale]: initialBundle
    };
    if (fallbackBundle) {
      resources[FALLBACK_LOCALE] = fallbackBundle;
    }

    await i18next.init({
      lng: initialLocale,
      fallbackLng: FALLBACK_LOCALE,
      supportedLngs: SUPPORTED_LOCALES,
      ns: NAMESPACES,
      defaultNS: DEFAULT_NAMESPACE,
      resources,
      interpolation: { escapeValue: false },
      returnNull: false,
      returnEmptyString: false,
      initImmediate: false
    });

    return i18next;
  })();

  return initializationPromise;
}

function t(key, options = {}) {
  if (!i18next.isInitialized) {
    return String(key);
  }
  return i18next.t(key, options);
}

function getLocale() {
  return i18next.language || FALLBACK_LOCALE;
}

async function setLocale(rawLocale) {
  const target = normalizeLocale(rawLocale);
  if (!target) {
    return getLocale();
  }

  await ensureLocaleLoaded(target);
  await i18next.changeLanguage(target);
  writeStoredLocale(target);
  dispatchLocaleChanged(target);
  return target;
}

function onLocaleChanged(handler) {
  if (typeof handler !== "function") {
    return () => {};
  }

  const wrapped = (event) => handler(event?.detail?.locale || getLocale(), event);
  window.addEventListener(LOCALE_CHANGED_EVENT, wrapped);
  return () => window.removeEventListener(LOCALE_CHANGED_EVENT, wrapped);
}

function registerAlpineBindings(Alpine) {
  if (!Alpine || typeof Alpine.magic !== "function") {
    return;
  }

  // $t magic — usable as $t('common.hello') or $t('admin:users.title', { count: 3 })
  Alpine.magic("t", () => (key, options = {}) => t(key, options));

  // x-t directive — sets textContent, re-renders on locale change
  if (typeof Alpine.directive === "function") {
    Alpine.directive("t", (el, { expression }, { evaluateLater, effect, cleanup }) => {
      const evaluate = evaluateLater(expression);
      const render = () => {
        evaluate((value) => {
          if (value === undefined || value === null) {
            return;
          }

          if (typeof value === "string") {
            el.textContent = t(value);
            return;
          }

          if (typeof value === "object" && typeof value.key === "string") {
            const { key, ...options } = value;
            el.textContent = t(key, options);
          }
        });
      };

      effect(render);

      const localeListener = () => render();
      window.addEventListener(LOCALE_CHANGED_EVENT, localeListener);
      cleanup(() => window.removeEventListener(LOCALE_CHANGED_EVENT, localeListener));
    });
  }

  // Force a global re-render on locale change so that {{ $t(...) }} interpolations refresh.
  window.addEventListener(LOCALE_CHANGED_EVENT, () => {
    try {
      if (Array.isArray(Alpine?._stores)) {
        return;
      }
      // Walk the document and re-evaluate Alpine trees.
      document.querySelectorAll("[x-data]").forEach((el) => {
        if (el._x_dataStack) {
          Alpine.nextTick(() => Alpine.initTree(el));
        }
      });
    } catch {
      /* noop */
    }
  });
}

export {
  FALLBACK_LOCALE,
  LOCALE_CHANGED_EVENT,
  NAMESPACES,
  SUPPORTED_LOCALES,
  getLocale,
  initI18n,
  normalizeLocale,
  onLocaleChanged,
  registerAlpineBindings,
  setLocale,
  t
};
