import { defineEventHandler, getQuery } from "h3";

import {
  attemptStatePayload,
  getAttempt,
  maybeFinishAttempt,
  requireString,
} from "../../utils/rocket-api";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const attemptId = requireString(query.attempt_id, "attempt_id");
  const playerId = requireString(query.player_id, "player_id");
  const attempt = await getAttempt(attemptId, playerId);
  return attemptStatePayload(await maybeFinishAttempt(attempt));
});
