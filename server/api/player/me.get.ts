import { defineEventHandler, getQuery } from "h3";

import { getPlayer, playerPayload, requireString } from "../../utils/rocket-api";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const playerId = requireString(query.player_id, "player_id");
  const player = await getPlayer(playerId);
  return playerPayload(player);
});
