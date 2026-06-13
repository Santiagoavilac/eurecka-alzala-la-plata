import { defineEventHandler, readBody } from "h3";

import { requireString, startAttempt } from "../../utils/rocket-api";

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, unknown>>(event);
  const playerId = requireString(body?.player_id, "player_id");
  return startAttempt(playerId);
});
