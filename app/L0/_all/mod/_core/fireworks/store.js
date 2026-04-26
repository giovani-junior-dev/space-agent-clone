import {
  FIREWORKS_API_KEYS_URL,
  FIREWORKS_DEFAULT_MODEL,
  FIREWORKS_ENDPOINT,
  FIREWORKS_FIREPASS_DOCS_URL,
  FIREWORKS_MODELS,
  findFireworksModel
} from "/mod/_core/fireworks/models.js";
import { isFirepassModel } from "/mod/_core/fireworks/request.js";

const STORAGE_KEY = "fireworks.lastSelectedModel";

function readPersistedModelId() {
  try {
    const stored = String(globalThis.localStorage?.getItem(STORAGE_KEY) || "").trim();
    if (!stored) {
      return FIREWORKS_DEFAULT_MODEL;
    }
    return findFireworksModel(stored)?.id || FIREWORKS_DEFAULT_MODEL;
  } catch {
    return FIREWORKS_DEFAULT_MODEL;
  }
}

function persistModelId(modelId) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, String(modelId || ""));
  } catch {
    // browser storage may be locked or unavailable; stay silent
  }
}

function resolveAdminAgentStore() {
  return globalThis.Alpine?.store?.("adminAgent") || null;
}

function resolveOnscreenAgentStore() {
  return globalThis.Alpine?.store?.("onscreenAgent") || null;
}

function bumpStatusOnStore(targetStore, message) {
  if (!targetStore || typeof message !== "string") {
    return;
  }
  try {
    targetStore.status = message;
  } catch {
    // status is a plain field; ignore unexpected proxies
  }
}

const model = {
  apiKey: "",
  models: FIREWORKS_MODELS,
  selectedModelId: readPersistedModelId(),
  endpoint: FIREWORKS_ENDPOINT,
  firepassDocsUrl: FIREWORKS_FIREPASS_DOCS_URL,
  apiKeysUrl: FIREWORKS_API_KEYS_URL,
  status: "",
  statusTone: "",

  get selectedModel() {
    return findFireworksModel(this.selectedModelId) || this.models[0] || null;
  },

  get hasApiKey() {
    return Boolean(String(this.apiKey || "").trim());
  },

  get firepassModelId() {
    const found = this.models.find((entry) => entry.firepass === true);
    return found ? found.id : "";
  },

  isFirepassSelection(modelId = this.selectedModelId) {
    return isFirepassModel(modelId);
  },

  selectModel(modelId) {
    const found = findFireworksModel(modelId);
    if (!found) {
      return;
    }
    this.selectedModelId = found.id;
    persistModelId(found.id);
  },

  setApiKey(value) {
    this.apiKey = String(value || "");
  },

  clearStatusSoon(delayMs = 4000) {
    if (!Number.isFinite(delayMs) || delayMs <= 0) {
      return;
    }
    const ticket = ++this._statusTicket;
    setTimeout(() => {
      if (ticket !== this._statusTicket) {
        return;
      }
      this.status = "";
      this.statusTone = "";
    }, delayMs);
  },

  _statusTicket: 0,

  async _applyToAgentStore(target, label) {
    if (!target) {
      this.status = `${label} store is not available in this page.`;
      this.statusTone = "is-warning";
      this.clearStatusSoon();
      return false;
    }

    const trimmedKey = String(this.apiKey || "").trim();
    const model = findFireworksModel(this.selectedModelId);

    if (!model) {
      this.status = "Pick a model before applying.";
      this.statusTone = "is-warning";
      this.clearStatusSoon();
      return false;
    }

    if (!trimmedKey) {
      this.status = "Enter an API key before applying.";
      this.statusTone = "is-warning";
      this.clearStatusSoon();
      return false;
    }

    try {
      const previous = target.settings || {};
      target.settings = {
        ...previous,
        provider: "api",
        apiEndpoint: FIREWORKS_ENDPOINT,
        apiKey: trimmedKey,
        model: model.id,
        storedApiKeyLocked: false,
        storedApiKeyValue: trimmedKey
      };

      if (typeof target.persistConfig === "function") {
        await target.persistConfig();
      }

      bumpStatusOnStore(target, `Fireworks ${model.label} applied.`);
      this.status = `Applied ${model.label} to ${label}.`;
      this.statusTone = "is-success";
      this.clearStatusSoon();
      return true;
    } catch (error) {
      console.error("[fireworks] failed to apply settings", error);
      this.status = `Could not apply to ${label}: ${error?.message || error}`;
      this.statusTone = "is-error";
      this.clearStatusSoon(8000);
      return false;
    }
  },

  async applyToAdminAgent() {
    return this._applyToAgentStore(resolveAdminAgentStore(), "Admin agent");
  },

  async applyToOnscreenAgent() {
    return this._applyToAgentStore(resolveOnscreenAgentStore(), "Onscreen agent");
  }
};

space.fw.createStore("fireworks", model);
