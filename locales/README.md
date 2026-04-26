# Locales

Translation resources for Space Agent. Loaded by the backend (`server/lib/i18n.js`) and the browser runtime (`app/L0/_all/mod/_core/i18n/i18n.js`) via i18next.

## Layout

```
locales/
  en/
    common.json
    errors.json
    admin.json
    fileExplorer.json
    dashboard.json
  pt-BR/
    (same files)
```

Each top-level filename is an i18next **namespace**. The default namespace is `common`.

Supported languages (Phase 0):

- `en` — fallback / source of truth
- `pt-BR` — Brazilian Portuguese

## Key conventions

- camelCase for keys.
- Dot path: `namespace.section.key` (the namespace is implicit when calling `t("section.key", { ns: "..." })`; or use the prefix form `t("namespace:section.key")`).
- Keys MUST be identical across languages. Translators only change values.
- Reuse before introducing new keys. Search the existing JSONs first.

## Interpolation

Use `{{var}}` placeholders:

```json
{
  "greeting": "Hello, {{name}}!"
}
```

```js
t("greeting", { name: "Geovane" });
```

## Pluralization

i18next v23+ uses the suffixes `_one`, `_other`, etc. Always provide both for English; `pt-BR` follows the same plural categories.

```json
{
  "itemCount_one": "{{count}} item",
  "itemCount_other": "{{count}} items"
}
```

```js
t("itemCount", { count: 1 }); // "1 item"
t("itemCount", { count: 5 }); // "5 items"
```

## Missing keys

If a key is missing the runtime returns the key itself (e.g. `common.hello`). The backend logs missing lookups in development; the frontend silently falls back to the EN value, then to the key.

## Adding a new namespace

1. Create `locales/en/<namespace>.json` with `{}`.
2. Create `locales/pt-BR/<namespace>.json` with `{}`.
3. Register the namespace in `server/lib/i18n.js` (`NAMESPACES`) and `app/L0/_all/mod/_core/i18n/i18n.js` (`NAMESPACES`).

## Locale resolution order

**Backend** (`getLocale(req)`):
1. `?lang=` query parameter
2. `Accept-Language` header
3. `SPACE_LOCALE` env var
4. fallback `en`

**Frontend**:
1. `localStorage.spaceLocale`
2. `?lang=` query parameter
3. `navigator.language` if it starts with `pt`
4. fallback `en`

## Switching language at runtime (frontend)

```js
import { setLocale } from "/mod/_core/i18n/i18n.js";
await setLocale("pt-BR");
```

This dispatches a `space:locale-changed` event on `window`; Alpine components using `$t` and `x-t` re-render automatically.
