import { createError, defineEventHandler, getQuery, setResponseStatus } from "h3";

import { getGuessPlayerCurrent, getGuessPlayerResult } from "../../../utils/guess-player-api";
import { requireString, toPublicApiError } from "../../../utils/rocket-api";

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const rawPath = event.context.params?.path;
    const parts = Array.isArray(rawPath) ? rawPath : String(rawPath ?? "").split("/");
    const sessionId = requireString(parts[0], "session_id");
    const action = requireString(parts[1], "action");
    const playerId = requireString(query.player_id, "player_id");

    if (action === "current") return await getGuessPlayerCurrent(sessionId, playerId);
    if (action === "result") return await getGuessPlayerResult(sessionId, playerId);

    throw createError({ statusCode: 404, statusMessage: "guess_player_route_not_found" });
  } catch (error) {
    const publicError = toPublicApiError(error, "guess_player_session_failed");
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
