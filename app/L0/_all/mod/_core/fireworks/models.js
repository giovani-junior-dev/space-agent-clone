// Curated Fireworks AI chat catalog.
//
// Curation criteria:
// - text/chat-completions only (no embeddings, no image, no audio)
// - production-grade serverless models, OpenAI Chat Completions compatible
// - tool calling + JSON response_format support
// - one entry per logical model family; prefer the latest published revision
// - the Firepass router is highlighted because it provides flat-rate, agent-friendly access

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
  },
  {
    id: "accounts/fireworks/models/kimi-k2-instruct-0905",
    label: "Kimi K2 Instruct",
    description: "Long-context coding and reasoning.",
    contextWindow: 256000,
    capabilities: ["chat", "tools", "json"]
  },
  {
    id: "accounts/fireworks/models/deepseek-v3p1",
    label: "DeepSeek V3.1",
    description: "Strong general-purpose reasoning model.",
    contextWindow: 131072,
    capabilities: ["chat", "tools", "json"]
  },
  {
    id: "accounts/fireworks/models/llama-v3p3-70b-instruct",
    label: "Llama 3.3 70B Instruct",
    description: "Open-weight, broad-task baseline.",
    contextWindow: 131072,
    capabilities: ["chat", "tools", "json"]
  },
  {
    id: "accounts/fireworks/models/qwen3-coder-480b-a35b-instruct",
    label: "Qwen 3 Coder 480B",
    description: "Coding specialist MoE, strong tool use.",
    contextWindow: 262144,
    capabilities: ["chat", "tools", "json"]
  },
  {
    id: "accounts/fireworks/models/qwen3-235b-a22b-instruct-2507",
    label: "Qwen 3 235B Instruct",
    description: "Generalist MoE with strong multilingual coverage.",
    contextWindow: 262144,
    capabilities: ["chat", "tools", "json"]
  },
  {
    id: "accounts/fireworks/models/gpt-oss-120b",
    label: "GPT-OSS 120B",
    description: "OpenAI open-weight model served on Fireworks.",
    contextWindow: 131072,
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
