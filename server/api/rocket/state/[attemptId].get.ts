import { defineEventHandler, getQuery, getRouterParam } from "h3";

import {
  attemptStatePayload,
  getAttempt,
  maybeFinishAttempt,
  requireString,
} from "../../../utils/rocket-api";

export default defineEventHandler(async (event) => {
  const attemptId = requireString(getRouterParam(event, "attemptId"), "attempt_id");
  const playerId = requireString(getQuery(event).player_id, "player_id");
  const attempt = await getAttempt(attemptId, playerId);
  return attemptStatePayload(await maybeFinishAttempt(attempt));
});
