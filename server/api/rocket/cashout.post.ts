import { defineEventHandler, readBody } from "h3";

import { cashOutAttempt, requireString } from "../../utils/rocket-api";

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, unknown>>(event);
  const attemptId = requireString(body?.attempt_id, "attempt_id");
  const playerId = requireString(body?.player_id, "player_id");
  return cashOutAttempt(attemptId, playerId);
});
