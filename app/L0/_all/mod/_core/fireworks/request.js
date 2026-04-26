const FIREWORKS_HOST = "api.fireworks.ai";
const FIREWORKS_ENDPOINT = "https://api.fireworks.ai/inference/v1/chat/completions";
const FIREPASS_ROUTER_PREFIX = "accounts/fireworks/routers/";

export function isFireworksEndpoint(endpoint = "") {
  const normalizedEndpoint = String(endpoint || "").trim();

  if (!normalizedEndpoint) {
    return false;
  }

  try {
    const url = new URL(normalizedEndpoint, globalThis.location?.origin || "http://localhost");
    return url.hostname === FIREWORKS_HOST || url.hostname.endsWith(`.${FIREWORKS_HOST}`);
  } catch {
    return normalizedEndpoint.includes(FIREWORKS_HOST);
  }
}

export function getFireworksEndpoint() {
  return FIREWORKS_ENDPOINT;
}

export function isFirepassModel(modelId = "") {
  return String(modelId || "").trim().startsWith(FIREPASS_ROUTER_PREFIX);
}
