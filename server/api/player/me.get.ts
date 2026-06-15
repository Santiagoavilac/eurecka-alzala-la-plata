import { defineEventHandler, getQuery, setResponseStatus } from "h3";

import { getPlayer, playerPayload, requireString, toPublicApiError } from "../../utils/rocket-api";

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const playerId = requireString(query.player_id, "player_id");
    const player = await getPlayer(playerId);
    return playerPayload(player);
  } catch (error) {
    const publicError = toPublicApiError(error, "player_me_failed");
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
