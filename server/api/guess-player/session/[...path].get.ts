import { createError, defineEventHandler, getQuery } from "h3";

import { getGuessPlayerCurrent, getGuessPlayerResult } from "../../../utils/guess-player-api";
import { requireString } from "../../../utils/rocket-api";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const rawPath = event.context.params?.path;
  const parts = Array.isArray(rawPath) ? rawPath : String(rawPath ?? "").split("/");
  const sessionId = requireString(parts[0], "session_id");
  const action = requireString(parts[1], "action");
  const playerId = requireString(query.player_id, "player_id");

  if (action === "current") return getGuessPlayerCurrent(sessionId, playerId);
  if (action === "result") return getGuessPlayerResult(sessionId, playerId);

  throw createError({ statusCode: 404, statusMessage: "guess_player_route_not_found" });
});
