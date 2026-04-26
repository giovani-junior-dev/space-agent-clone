import { tError } from "../lib/i18n.js";

function createHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function readPayload(context) {
  return context.body && typeof context.body === "object" && !Buffer.isBuffer(context.body)
    ? context.body
    : {};
}

export function post(context) {
  const payload = readPayload(context);

  if (typeof payload.password !== "string") {
    throw createHttpError(tError("errors:auth.passwordMustBeString"), 400);
  }

  if (!context.auth || typeof context.auth.generatePasswordVerifier !== "function") {
    throw createHttpError(tError("errors:auth.passwordGenerationUnavailable"), 500);
  }

  return {
    headers: {
      "Cache-Control": "no-store"
    },
    status: 200,
    body: context.auth.generatePasswordVerifier(payload.password)
  };
}
