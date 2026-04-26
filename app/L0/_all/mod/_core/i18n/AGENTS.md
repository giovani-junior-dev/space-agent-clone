# `_core/i18n`

Frontend i18n runtime. Wraps i18next with Alpine bindings.

- Entry: `i18n.js` (ESM module). Loaded by `_core/framework/js/initFw.js` BEFORE `Alpine.start()` so that `$t` and `x-t` are available during the first render.
- Locale resolution: `localStorage.spaceLocale` -> `?lang=` query -> `navigator.language` (only `pt*` maps to `pt-BR`) -> fallback `en`.
- Resources are fetched from `/locales/:lang/:ns.json` (served by the backend `locales_handler.js`).
- API:
  - `t(key, opts)` — same as i18next.
  - `getLocale()` — current locale.
  - `setLocale(locale)` — switch + persist + dispatch `space:locale-changed`.
  - `onLocaleChanged(handler)` — subscribe.
- Alpine bindings:
  - `$t('namespace:key', { name: 'foo' })` — magic helper.
  - `x-t="key"` — directive that sets `textContent`. Re-evaluates on `space:locale-changed`.

DO NOT migrate strings here (Phase 0 is infra only). Phases 1-4 will populate the namespaces.
