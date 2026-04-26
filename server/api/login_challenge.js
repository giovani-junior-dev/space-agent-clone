import { isGuestUsername } from "../lib/auth/user_manage.js";
import { tError } from "../lib/i18n.js";
import { areGuestUsersAllowed, isLoginAllowed, isSingleUserApp } from "../lib/utils/runtime_params.js";

export const allowAnonymous = true;

function createHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export async function post(context) {
  if (isSingleUserApp(context.runtimeParams)) {
    throw createHttpError(tError("errors:auth.passwordLoginDisabledSingleUser"), 403);
  }

  const payload =
    context.body && typeof context.body === "object" && !Buffer.isBuffer(context.body)
      ? context.body
      : {};

  if (!isLoginAllowed(context.runtimeParams)) {
    const username = String(payload.username || "");

    if (!(areGuestUsersAllowed(context.runtimeParams) && isGuestUsername(username))) {
      throw createHttpError(tError("errors:auth.loginDisabled"), 403);
    }
  }

  try {
    return await context.auth.createLoginChallenge({
      clientNonce: payload.clientNonce,
      req: context.req,
      username: payload.username
    });
  } catch (error) {
    throw createHttpError(error.message || tError("errors:auth.loginChallengeFailed"), Number(error.statusCode) || 401);
  }
}
