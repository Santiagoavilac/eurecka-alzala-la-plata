import { defineEventHandler, readBody, setResponseStatus } from "h3";

import { startGuessPlayerSession } from "../../utils/guess-player-api";
import { requireString, toPublicApiError } from "../../utils/rocket-api";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, unknown>>(event);
    const playerId = requireString(body?.player_id, "player_id");
    return await startGuessPlayerSession(playerId);
  } catch (error) {
    const publicError = toPublicApiError(error, "guess_player_start_failed");
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
