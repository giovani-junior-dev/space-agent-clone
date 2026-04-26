import { listPanels, resolveLocalizedPanelField } from "/mod/_core/panels/panel-index.js";
import { getLocale } from "/mod/_core/i18n/i18n.js";

function logDashboardPanelsError(context, error) {
  console.error(`[panels-dashboard] ${context}`, error);
}

function buildFallbackHref(routePath) {
  return `#/${String(routePath || "").replace(/^\/?#+\/?/u, "")}`;
}

function localizePanelEntry(panel, locale) {
  return {
    ...panel,
    name: resolveLocalizedPanelField(panel, "name", locale) || panel.name,
    description: resolveLocalizedPanelField(panel, "description", locale) || panel.description
  };
}

globalThis.panelsDashboardLauncher = function panelsDashboardLauncher() {
  return {
    rawEntries: [],
    loadErrorText: "",
    loading: false,

    async init() {
      await this.loadPanels();
    },

    get hasEntries() {
      return this.rawEntries.length > 0;
    },

    // Reactive: re-evaluate whenever locale changes (Alpine.store('spaceLocale').version
    // is read inside the getter so Alpine subscribes this binding to locale flips).
    get entries() {
      try {
        // eslint-disable-next-line no-unused-expressions
        globalThis.Alpine?.store?.("spaceLocale")?.version;
      } catch {
        /* noop */
      }
      const locale = getLocale();
      return this.rawEntries.map((panel) => localizePanelEntry(panel, locale));
    },

    hrefFor(routePath) {
      return globalThis.space.router?.createHref?.(routePath) || buildFallbackHref(routePath);
    },

    async loadPanels() {
      this.loading = true;
      this.loadErrorText = "";

      try {
        this.rawEntries = await listPanels();
      } catch (error) {
        logDashboardPanelsError("loadPanels failed", error);
        this.loadErrorText = String(error?.message || "Unable to load panels.");
      } finally {
        this.loading = false;
      }
    },

    async openPanel(routePath) {
      if (!routePath) {
        return;
      }

      if (globalThis.space.router?.goTo) {
        await globalThis.space.router.goTo(routePath, {
          scrollMode: "top"
        });
        return;
      }

      globalThis.location.hash = buildFallbackHref(routePath);
    }
  };
};
