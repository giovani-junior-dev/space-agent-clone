import { tError } from "../lib/i18n.js";

function createHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export async function get(context) {
  if (!context.user?.isAuthenticated) {
    throw createHttpError(tError("errors:auth.authenticationIsRequired"), 401);
  }

  const sessionKey =
    context.auth && typeof context.auth.getUserCryptoSessionStorageKey === "function"
      ? context.auth.getUserCryptoSessionStorageKey(context.user)
      : "";

  if (!String(sessionKey || "").trim()) {
    throw createHttpError(tError("errors:auth.sessionUserCryptoUnavailable"), 403);
  }

  return {
    status: 200,
    headers: {
      "Cache-Control": "no-store"
    },
    body: {
      sessionKey
    }
  };
}
