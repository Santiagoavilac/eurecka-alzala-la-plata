import { createError, defineEventHandler, readBody } from "h3";

import { cashOutAttempt, requireString } from "../../utils/rocket-api";

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, unknown>>(event);
  const attemptId = requireString(body?.attempt_id, "attempt_id");
  const playerId = requireString(body?.player_id, "player_id");
  const cashoutRequestedAt =
    typeof body?.cashout_requested_at === "string" ? body.cashout_requested_at : undefined;
  if (cashoutRequestedAt && Number.isNaN(Date.parse(cashoutRequestedAt))) {
    throw createError({ statusCode: 400, statusMessage: "cashout_requested_at_invalid" });
  }
  return cashOutAttempt(attemptId, playerId, cashoutRequestedAt);
});
