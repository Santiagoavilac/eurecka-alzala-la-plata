import { defineEventHandler, getQuery } from "h3";

import { leaderboard } from "../utils/rocket-api";

export default defineEventHandler((event) => {
  const limit = Math.min(50, Math.max(10, Number(getQuery(event).limit ?? 10) || 10));
  return leaderboard(limit);
});
