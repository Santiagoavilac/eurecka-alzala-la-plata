import { defineEventHandler } from "h3";
import { db, supabaseRuntimeDiagnostic } from "../../utils/rocket-api";

export default defineEventHandler(async () => {
  const diag = supabaseRuntimeDiagnostic();
  if (!diag.supabase_url_set || !diag.service_role_key_set) {
    return { ok: false, reason: "supabase_env_missing", diagnostic: diag };
  }
  try {
    const client = db();
    const [players, sessions] = await Promise.all([
      client.from("players").select("id", { count: "exact", head: true }),
      client.from("guess_player_sessions").select("id", { count: "exact", head: true }),
    ]);
    return {
      ok: !players.error && !sessions.error,
      diagnostic: diag,
      players_count: players.count ?? 0,
      players_error: players.error?.message ?? null,
      sessions_count: sessions.count ?? 0,
      sessions_error: sessions.error?.message ?? null,
    };
  } catch (err) {
    return { ok: false, reason: "db_connect_failed", message: String(err), diagnostic: diag };
  }
});
