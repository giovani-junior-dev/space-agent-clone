import {
  AGENT_PERSONALITY_PATH,
  loadAgentPersonality,
  saveAgentPersonality
} from "/mod/_core/agent/storage.js";
import { t as i18nT } from "/mod/_core/i18n/i18n.js";

function logAgentPageError(context, error) {
  console.error(`[agent-page] ${context}`, error);
}

const model = {
  lastSavedPersonalityText: "",
  loading: false,
  personalityText: "",
  saving: false,
  statusText: "",
  statusTone: "",

  async init() {
    this.loading = true;
    this.setStatus("");

    try {
      const personalityText = await loadAgentPersonality();
      this.personalityText = personalityText;
      this.lastSavedPersonalityText = personalityText;
      this.setStatus(
        personalityText
          ? i18nT("agent:page.status.loadedFrom", { path: AGENT_PERSONALITY_PATH })
          : i18nT("agent:page.status.noneSavedYet")
      );
    } catch (error) {
      logAgentPageError("loadAgentPersonality failed", error);
      this.setStatus(String(error?.message || i18nT("agent:page.status.loadFailed")), "error");
    } finally {
      this.loading = false;
    }
  },

  get isDirty() {
    return this.personalityText !== this.lastSavedPersonalityText;
  },

  async reloadPersonality() {
    if (this.loading || this.saving) {
      return;
    }

    this.loading = true;
    this.setStatus(i18nT("agent:page.status.reloadingInstructions"));

    try {
      const nextText = await loadAgentPersonality();
      this.personalityText = nextText;
      this.lastSavedPersonalityText = nextText;
      this.setStatus(
        nextText
          ? i18nT("agent:page.status.reloadedFrom", { path: AGENT_PERSONALITY_PATH })
          : i18nT("agent:page.status.currentlyEmpty")
      );
    } catch (error) {
      logAgentPageError("reloadPersonality failed", error);
      this.setStatus(String(error?.message || i18nT("agent:page.status.reloadFailed")), "error");
    } finally {
      this.loading = false;
    }
  },

  async savePersonality() {
    if (this.loading || this.saving) {
      return;
    }

    this.saving = true;
    this.setStatus(i18nT("agent:page.status.savingTo", { path: AGENT_PERSONALITY_PATH }));

    try {
      await saveAgentPersonality(this.personalityText);
      this.lastSavedPersonalityText = this.personalityText;
      this.setStatus(i18nT("agent:page.status.savedTo", { path: AGENT_PERSONALITY_PATH }), "success");
    } catch (error) {
      logAgentPageError("savePersonality failed", error);
      this.setStatus(String(error?.message || i18nT("agent:page.status.saveFailed")), "error");
    } finally {
      this.saving = false;
    }
  },

  setStatus(text = "", tone = "") {
    this.statusText = String(text || "");
    this.statusTone = String(tone || "");
  }
};

globalThis.space.fw.createStore("agentPage", model);
