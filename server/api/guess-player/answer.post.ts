import { defineEventHandler, readBody, setResponseStatus } from "h3";

import { submitGuessPlayerAnswer } from "../../utils/guess-player-api";
import { toPublicApiError } from "../../utils/rocket-api";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, unknown>>(event);
    return await submitGuessPlayerAnswer(body);
  } catch (error) {
    const publicError = toPublicApiError(error, "guess_player_answer_failed");
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
