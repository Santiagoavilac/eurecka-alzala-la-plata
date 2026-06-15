import { defineEventHandler, getQuery, setResponseStatus } from "h3";

import { getGuessPlayerCurrent } from "../../utils/guess-player-api";
import { requireString, toPublicApiError } from "../../utils/rocket-api";

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const sessionId = requireString(query.session_id, "session_id");
    const playerId = requireString(query.player_id, "player_id");
    return await getGuessPlayerCurrent(sessionId, playerId);
  } catch (error) {
    const publicError = toPublicApiError(error, "guess_player_current_failed");
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
