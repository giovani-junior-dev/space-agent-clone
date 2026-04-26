// Curated Fireworks AI chat catalog.
//
// Project decision: this app exclusively uses Kimi K2.5 Turbo via the
// Firepass router. Flat $7/week, no per-token cost, agent-friendly.
// To restore the broader catalog, see git history of this file.

export const FIREWORKS_ENDPOINT = "https://api.fireworks.ai/inference/v1/chat/completions";
export const FIREWORKS_API_KEYS_URL = "https://app.fireworks.ai/settings/users/api-keys";
export const FIREWORKS_FIREPASS_DOCS_URL = "https://docs.fireworks.ai/firepass";

export const FIREWORKS_MODELS = [
  {
    id: "accounts/fireworks/routers/kimi-k2p5-turbo",
    label: "Kimi K2.5 Turbo (Firepass)",
    description: "Flat $7/week router, no per-token cost. Best for agentic coding.",
    firepass: true,
    contextWindow: 256000,
    capabilities: ["chat", "tools", "json"]
  }
];

export const FIREWORKS_DEFAULT_MODEL = "accounts/fireworks/routers/kimi-k2p5-turbo";

export function findFireworksModel(modelId = "") {
  const normalized = String(modelId || "").trim();
  if (!normalized) {
    return null;
  }
  return FIREWORKS_MODELS.find((entry) => entry.id === normalized) || null;
}
