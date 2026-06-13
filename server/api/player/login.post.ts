import { defineEventHandler, readBody, setResponseStatus } from "h3";

import {
  loginOrCreatePlayer,
  playerPayload,
  requireString,
  toPublicApiError,
} from "../../utils/rocket-api";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, unknown>>(event);
    const fullName = requireString(body?.full_name, "full_name");
    const phone = requireString(body?.phone, "phone");
    const player = await loginOrCreatePlayer(fullName, phone);
    return playerPayload(player);
  } catch (error) {
    const publicError = toPublicApiError(error, "login_failed");
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
