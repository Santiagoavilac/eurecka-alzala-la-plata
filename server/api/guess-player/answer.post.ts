import { defineEventHandler, readBody } from "h3";

import { submitGuessPlayerAnswer } from "../../utils/guess-player-api";

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, unknown>>(event);
  return submitGuessPlayerAnswer(body);
});
