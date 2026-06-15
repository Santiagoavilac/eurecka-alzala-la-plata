import { createError, defineEventHandler, readBody, setResponseStatus } from "h3";

import { cashOutAttempt, requireString, toPublicApiError } from "../../utils/rocket-api";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, unknown>>(event);
    const attemptId = requireString(body?.attempt_id, "attempt_id");
    const playerId = requireString(body?.player_id, "player_id");
    const cashoutRequestedAt =
      typeof body?.cashout_requested_at === "string" ? body.cashout_requested_at : undefined;
    if (cashoutRequestedAt && Number.isNaN(Date.parse(cashoutRequestedAt))) {
      throw createError({ statusCode: 400, statusMessage: "cashout_requested_at_invalid" });
    }
    return await cashOutAttempt(attemptId, playerId, cashoutRequestedAt);
  } catch (error) {
    const publicError = toPublicApiError(error, "rocket_cashout_failed");
    setResponseStatus(event, publicError.statusCode);
    return {
      error: publicError.code,
      operation: publicError.operation,
      target: publicError.target,
      supabase_code: publicError.supabase_code,
      diagnostic: publicError.diagnostic,
    };
  }
});
