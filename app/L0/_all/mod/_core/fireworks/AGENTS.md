# AGENTS

## Purpose

`_core/fireworks/` owns a curated Fireworks AI provider surface.

It is a small, self-contained module that lets a user paste a Fireworks API key, pick a model from a hand-picked catalog (including the flat-rate Firepass router), and apply that selection to either the admin agent or the onscreen agent in one click. It does not own chat UI; it only owns provider configuration and shared request helpers.

Documentation is top priority for this module. After any change under this subtree, update this file and any affected parent or consumer docs in the same session.

## Ownership

This module owns:

- `request.js`: shared Fireworks endpoint detection plus Firepass-router model id detection
- `models.js`: curated chat model catalog plus stable endpoint and external link constants
- `store.js`: Alpine store registered as `fireworks`, exposing model selection, API key state, status messages, and the apply-to-agent actions
- `config-sidebar.html`: sidebar UI mounted by the routed page (and reusable from other surfaces) showing the API key field, model picker, Firepass badge, and apply buttons
- `view.html`: routed dashboard page at `#/fireworks` that mounts the sidebar
- `fireworks.css`: page-local layout and theming
- `ext/panels/fireworks.yaml`: dashboard panel-manifest entry that advertises the routed page through the shared dashboard panels index

## Local Contracts

- the upstream chat completions endpoint is exactly `https://api.fireworks.ai/inference/v1/chat/completions`; it must remain the single source of truth for both the apply actions and any future request hooks
- the Firepass router model id is `accounts/fireworks/routers/kimi-k2p5-turbo`; `isFirepassModel(...)` must keep matching the `accounts/fireworks/routers/` prefix so future router models are auto-recognized
- the catalog is intentionally curated, not auto-fetched: each entry pins a stable production model id, a short label, a one-line description, the documented context window, and the chat capabilities (`chat`, `tools`, `json`)
- adding a new model means appending one entry to `FIREWORKS_MODELS` in `models.js`; do not introduce a runtime fetch from the Fireworks list-models endpoint here without an explicit follow-up request
- the apply actions write through the existing admin and onscreen agent stores: they set `provider: "api"`, `apiEndpoint`, `model`, and a plaintext `apiKey` on the live `settings` object, then call the store's `persistConfig()`. Encryption at rest happens inside that store's storage layer through `space.utils.userCrypto`; this module must keep passing plaintext to that contract instead of double-encrypting
- this module does not register a request hook for Fireworks because the endpoint requires only the standard `Authorization: Bearer ...` header that the runtime already sets. If Fireworks ever needs provider-specific headers or body rewrites, add a hook under `ext/js/_core/admin/views/agent/api.js/prepareAdminAgentApiRequest/end/` and a sibling onscreen hook, mirroring the `_core/open_router/` shape
- all user-visible strings are routed through the `providers:fireworks.*` i18n namespace and must ship in both `locales/en/providers.json` and `locales/pt-BR/providers.json`

## Discovery

- the routed page is discovered through `ext/panels/fireworks.yaml`, which uses the same dashboard panel manifest contract as `_core/huggingface/ext/panels/huggingface.yaml`; no other registry edit is required

## Development Guidance

- keep the catalog short and meaningful; six to eight curated entries beat a long auto-generated list
- if you add a request hook, keep request shaping inside this module so the admin and onscreen runtimes do not gain Fireworks-specific branches
- prefer extending the apply flow over wiring Fireworks into the admin agent settings dialog directly; the dialog stays provider-neutral
