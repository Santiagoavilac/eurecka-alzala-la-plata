import { defineEventHandler, readBody } from "h3";

import { startGuessPlayerSession } from "../../utils/guess-player-api";
import { requireString } from "../../utils/rocket-api";

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, unknown>>(event);
  const playerId = requireString(body?.player_id, "player_id");
  return startGuessPlayerSession(playerId);
});
