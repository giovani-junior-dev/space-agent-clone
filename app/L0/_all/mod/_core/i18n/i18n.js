import i18next from "/mod/_core/framework/js/vendor/i18next.js";

const SUPPORTED_LOCALES = ["en", "pt-BR"];
const FALLBACK_LOCALE = "en";
const DEFAULT_NAMESPACE = "common";
const NAMESPACES = [
  "common",
  "errors",
  "admin",
  "fileExplorer",
  "dashboard",
  "menu",
  "user",
  "spaces",
  "onscreenAgent",
  "timeTravel",
  "auth",
  "agent",
  "memory",
  "documentation",
  "providers",
  "webBrowsing"
];
const STORAGE_KEY = "spaceLocale";
const COOKIE_KEY = "space_locale";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year
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

  try {
    if (typeof document !== "undefined" && typeof document.cookie === "string") {
      const value = encodeURIComponent(locale);
      const secure = window.location?.protocol === "https:" ? "; Secure" : "";
      document.cookie =
        `${COOKIE_KEY}=${value}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
    }
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

    // Persist initial locale to cookie so backend honors the active choice on
    // subsequent requests, even when navigator.language disagrees.
    writeStoredLocale(initialLocale);

    // Expose a tiny runtime API so UI surfaces (e.g. the language selector)
    // can read/change the locale without importing this module directly.
    try {
      const space = (globalThis.space = globalThis.space || {});
      space.i18n = {
        t,
        getLocale,
        setLocale,
        onLocaleChanged,
        supportedLocales: [...SUPPORTED_LOCALES]
      };
    } catch {
      /* noop */
    }

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

  // Reactive store so any expression that calls $t(...) implicitly subscribes
  // to locale changes via the .version counter access below. This is what
  // lets `:title="$t(...)"`, `:aria-label="$t(...)"` etc. re-evaluate live
  // without needing to walk the DOM.
  if (typeof Alpine.store === "function") {
    Alpine.store("spaceLocale", { current: getLocale(), version: 0 });
    window.addEventListener(LOCALE_CHANGED_EVENT, (event) => {
      try {
        const store = Alpine.store("spaceLocale");
        if (store) {
          store.current = event?.detail?.locale || getLocale();
          store.version = (store.version || 0) + 1;
        }
      } catch {
        /* noop */
      }
    });
  }

  // $t magic — usable as $t('common.hello') or $t('admin:users.title', { count: 3 })
  // Reads `spaceLocale.version` so Alpine re-runs every expression that uses
  // $t whenever the locale changes.
  Alpine.magic("t", () => (key, options = {}) => {
    try {
      // eslint-disable-next-line no-unused-expressions
      Alpine.store?.("spaceLocale")?.version;
    } catch {
      /* noop */
    }
    return t(key, options);
  });

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

  // Reactive store (spaceLocale.version) above is what drives reactive
  // re-evaluation of $t(...) bindings. We intentionally do NOT call
  // Alpine.initTree on locale change because that re-mounts router outlets
  // and re-triggers importComponent, which can fail with [object Event]
  // when a <script>/<link> onerror fires.
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
