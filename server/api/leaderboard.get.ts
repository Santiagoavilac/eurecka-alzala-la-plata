import { defineEventHandler, getQuery, setResponseStatus } from "h3";

import { leaderboard, toPublicApiError } from "../utils/rocket-api";

export default defineEventHandler(async (event) => {
  try {
    const limit = Math.min(50, Math.max(10, Number(getQuery(event).limit ?? 10) || 10));
    return await leaderboard(limit);
  } catch (error) {
    const publicError = toPublicApiError(error, "leaderboard_failed");
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
