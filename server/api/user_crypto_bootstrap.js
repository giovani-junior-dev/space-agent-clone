import {
  buildClientUserCryptoRecord,
  createUserCryptoServerShare,
  getUserCryptoState,
  provisionUserCrypto,
  readUserCryptoServerShare,
  USER_CRYPTO_STATUS_READY
} from "../lib/auth/user_crypto.js";
import { tError } from "../lib/i18n.js";
import { runTrackedMutation } from "../runtime/request_mutations.js";

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

function buildUserCryptoPayload(context, username) {
  const userCryptoState = getUserCryptoState(context.projectRoot, username, context.runtimeParams);

  return {
    keyId: userCryptoState.keyId,
    record: buildClientUserCryptoRecord(userCryptoState.record),
    serverShare:
      userCryptoState.status === USER_CRYPTO_STATUS_READY
        ? readUserCryptoServerShare(context.projectRoot, username, {
            record: userCryptoState.record,
            runtimeParams: context.runtimeParams
          })
        : "",
    state: userCryptoState.status
  };
}

export async function post(context) {
  const username = String(context.user?.username || "").trim();

  if (!username) {
    throw createHttpError(tError("errors:auth.authenticationIsRequired"), 401);
  }

  const payload = readPayload(context);
  const currentPayload = buildUserCryptoPayload(context, username);

  if (currentPayload.state !== "missing") {
    return currentPayload;
  }

  const record =
    payload.record && typeof payload.record === "object" && !Array.isArray(payload.record)
      ? payload.record
      : null;

  if (!record) {
    return {
      ...currentPayload,
      provisioningShare: createUserCryptoServerShare()
    };
  }

  const provisioningShare = String(payload.provisioningShare || "").trim();

  if (!provisioningShare) {
    throw createHttpError(tError("errors:auth.userCryptoProvisioningRequired"), 400);
  }

  await runTrackedMutation(context, async () =>
    provisionUserCrypto(context.projectRoot, username, {
      record,
      runtimeParams: context.runtimeParams,
      serverShare: provisioningShare
    })
  );

  return buildUserCryptoPayload(context, username);
}
