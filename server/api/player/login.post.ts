import { defineEventHandler, readBody } from "h3";

import { loginOrCreatePlayer, playerPayload, requireString } from "../../utils/rocket-api";

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, unknown>>(event);
  const fullName = requireString(body?.full_name, "full_name");
  const phone = requireString(body?.phone, "phone");
  const player = await loginOrCreatePlayer(fullName, phone);
  return playerPayload(player);
});
