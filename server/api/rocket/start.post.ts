import { defineEventHandler, readBody, setResponseStatus } from "h3";

import { requireString, startAttempt, toPublicApiError } from "../../utils/rocket-api";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, unknown>>(event);
    const playerId = requireString(body?.player_id, "player_id");
    return await startAttempt(playerId);
  } catch (error) {
    const publicError = toPublicApiError(error, "rocket_start_failed");
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
