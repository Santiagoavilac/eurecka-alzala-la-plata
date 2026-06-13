import { createClient } from "@supabase/supabase-js";
import { createError } from "h3";

import {
  calculateMultiplier,
  crashPointFromSeed,
  generateServerSeed,
  hashServerSeed,
  maskPhone,
  resolvePlayerIdentity,
} from "../../api/game/game";

const MAX_ATTEMPTS = 3;
const MAX_PLAYING_MS = 120_000;

type AttemptStatus = "playing" | "cashed_out" | "crashed" | "expired" | "invalidated";

type Player = {
  id: string;
  full_name: string;
  phone: string;
  document_id: string;
  phone_normalized: string;
  document_normalized: string;
  created_at: string;
  last_login_at: string | null;
  status: "active" | "blocked";
};

type RocketAttempt = {
  id: string;
  player_id: string;
  attempt_number: number;
  status: AttemptStatus;
  server_seed_hash: string;
  server_seed: string | null;
  crash_point: number | string;
  started_at: string;
  ended_at: string | null;
  cashed_out_at: number | string | null;
  score: number;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

type CashOutRocketAttemptRow = {
  attempt_id: string;
  status: AttemptStatus;
  current_multiplier: number | string | null;
  cashed_out_at: number | string | null;
  score: number;
  crash_point: number | string | null;
  server_seed: string | null;
  ended_at: string | null;
};

type LeaderboardRow = {
  player_id: string;
  score: number;
  cashed_out_at: number | string | null;
  ended_at: string | null;
  created_at: string;
  players?:
    | { full_name?: string; phone?: string }
    | { full_name?: string; phone?: string }[]
    | null;
};

type Database = {
  public: {
    Tables: {
      players: {
        Row: Player;
        Insert: {
          id?: string;
          full_name: string;
          phone: string;
          document_id: string;
          phone_normalized: string;
          document_normalized: string;
          created_at?: string;
          last_login_at?: string | null;
          status?: "active" | "blocked";
        };
        Update: Partial<Omit<Player, "id" | "created_at">>;
        Relationships: [];
      };
      rocket_attempts: {
        Row: RocketAttempt;
        Insert: {
          id?: string;
          player_id: string;
          attempt_number: number;
          status?: AttemptStatus;
          server_seed_hash: string;
          server_seed?: string | null;
          crash_point: number;
          started_at: string;
          ended_at?: string | null;
          cashed_out_at?: number | null;
          score?: number;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: Partial<Omit<RocketAttempt, "id" | "created_at">>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      cash_out_rocket_attempt: {
        Args: {
          p_attempt_id: string;
          p_player_id: string;
        };
        Returns: CashOutRocketAttemptRow[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

let supabase: ReturnType<typeof createClient<Database>> | null = null;

type PublicApiError = {
  statusCode: number;
  code: string;
  operation?: SupabaseOperation;
  target?: SupabaseTarget;
  supabase_code?: string;
};

type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

type SupabaseOperation = "select" | "insert" | "update" | "rpc";
type SupabaseTarget = "players" | "rocket_attempts" | "cash_out_rocket_attempt";

function publicApiError(
  code: string,
  statusCode = 500,
  details: Omit<PublicApiError, "code" | "statusCode"> = {},
) {
  return createError({
    statusCode,
    statusMessage: code,
    data: { error: code, ...details },
  });
}

function supabaseErrorText(error: unknown) {
  const item = error as SupabaseErrorLike;
  return [item?.code, item?.message, item?.details, item?.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function classifySupabaseError(
  error: unknown,
  operation: SupabaseOperation,
  tableOrFunction?: SupabaseTarget,
): PublicApiError {
  const text = supabaseErrorText(error);
  const code = (error as SupabaseErrorLike)?.code;
  const base = {
    statusCode: 500,
    operation,
    target: tableOrFunction,
    supabase_code: code,
  };

  if (
    code === "PGRST301" ||
    text.includes("invalid api key") ||
    text.includes("invalid jwt") ||
    text.includes("jwt malformed") ||
    text.includes("jwserror") ||
    text.includes("signature")
  ) {
    return { ...base, code: "supabase_invalid_key" };
  }

  if (
    code === "42501" ||
    text.includes("permission denied") ||
    text.includes("insufficient privilege") ||
    text.includes("row-level security")
  ) {
    return { ...base, code: "supabase_permission_denied" };
  }

  if (
    tableOrFunction === "players" &&
    (code === "42P01" ||
      code === "PGRST205" ||
      text.includes("public.players") ||
      text.includes("'players'") ||
      text.includes('"players"'))
  ) {
    return { ...base, code: "players_table_missing" };
  }

  if (
    tableOrFunction === "rocket_attempts" &&
    (code === "42P01" ||
      code === "PGRST205" ||
      text.includes("public.rocket_attempts") ||
      text.includes("'rocket_attempts'") ||
      text.includes('"rocket_attempts"'))
  ) {
    return { ...base, code: "rocket_attempts_table_missing" };
  }

  if (
    tableOrFunction === "cash_out_rocket_attempt" &&
    (code === "42883" ||
      code === "PGRST202" ||
      text.includes("cash_out_rocket_attempt") ||
      text.includes("function"))
  ) {
    return { ...base, code: "cash_out_rpc_missing" };
  }

  if (code?.startsWith("PGRST2") || text.includes("schema cache")) {
    return { ...base, code: "supabase_schema_cache_failed" };
  }

  if (operation === "select" && tableOrFunction === "players") {
    return { ...base, code: "players_select_failed" };
  }
  if (operation === "select" && tableOrFunction === "rocket_attempts") {
    return { ...base, code: "rocket_attempts_select_failed" };
  }
  if (operation === "insert") return { ...base, code: "supabase_insert_failed" };
  if (operation === "update") return { ...base, code: "supabase_update_failed" };
  if (operation === "rpc") return { ...base, code: "supabase_rpc_failed" };
  return { ...base, code: "supabase_select_failed" };
}

export function throwSupabaseApiError(
  error: unknown,
  operation: SupabaseOperation,
  tableOrFunction?: SupabaseTarget,
): never {
  const publicError = classifySupabaseError(error, operation, tableOrFunction);
  throw publicApiError(publicError.code, publicError.statusCode, {
    operation: publicError.operation,
    target: publicError.target,
    supabase_code: publicError.supabase_code,
  });
}

export function toPublicApiError(error: unknown, fallbackCode = "api_error"): PublicApiError {
  const item = error as {
    statusCode?: number;
    statusMessage?: string;
    data?: {
      error?: string;
      operation?: SupabaseOperation;
      target?: SupabaseTarget;
      supabase_code?: string;
    };
  };
  const code = item?.data?.error ?? item?.statusMessage ?? fallbackCode;
  return {
    statusCode: item?.statusCode ?? 500,
    code,
    operation: item?.data?.operation,
    target: item?.data?.target,
    supabase_code: item?.data?.supabase_code,
  };
}

export function db() {
  if (supabase) return supabase;

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw publicApiError("missing_env");
  }

  supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return supabase;
}

export function requireString(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw createError({ statusCode: 400, statusMessage: `${name}_required` });
  }
  return value.trim();
}

function publicPlayer(player: Player) {
  return {
    id: player.id,
    full_name: player.full_name,
    phone: player.phone,
    document_id: player.document_id,
    status: player.status,
    created_at: player.created_at,
  };
}

export async function getPlayerStats(playerId: string) {
  const result = await db()
    .from("rocket_attempts")
    .select("score, cashed_out_at", { count: "exact" })
    .eq("player_id", playerId);

  if (result.error) throwSupabaseApiError(result.error, "select", "rocket_attempts");

  const attempts = (result.data ?? []) as Pick<RocketAttempt, "score" | "cashed_out_at">[];
  const best = attempts.reduce(
    (acc, attempt) => {
      const score = Number(attempt.score ?? 0);
      const multiplier = attempt.cashed_out_at == null ? 0 : Number(attempt.cashed_out_at);
      return score > acc.best_score ? { best_score: score, best_multiplier: multiplier } : acc;
    },
    { best_score: 0, best_multiplier: 0 },
  );

  const attemptsUsed = result.count ?? attempts.length;
  return {
    attempts_used: attemptsUsed,
    attempts_left: Math.max(0, MAX_ATTEMPTS - attemptsUsed),
    ...best,
  };
}

export async function playerPayload(player: Player) {
  return {
    player: publicPlayer(player),
    ...(await getPlayerStats(player.id)),
  };
}

export async function getPlayer(playerId: string) {
  const result = await db().from("players").select("*").eq("id", playerId).maybeSingle();
  if (result.error) throwSupabaseApiError(result.error, "select", "players");
  const player = result.data as Player | null;
  if (!player || player.status !== "active") {
    throw createError({ statusCode: 404, statusMessage: "player_not_found" });
  }
  return player;
}

export async function loginOrCreatePlayer(fullName: string, phone: string) {
  const identity = resolvePlayerIdentity({ phone });
  if (identity.phoneNormalized.length < 6) {
    throw createError({ statusCode: 400, statusMessage: "phone_invalid" });
  }

  const existing = await db()
    .from("players")
    .select("*")
    .eq("phone_normalized", identity.phoneNormalized)
    .eq("document_normalized", identity.documentNormalized)
    .maybeSingle();
  if (existing.error) throwSupabaseApiError(existing.error, "select", "players");

  if (!existing.data) {
    const created = await db()
      .from("players")
      .insert({
        full_name: fullName,
        phone,
        document_id: identity.documentId,
        phone_normalized: identity.phoneNormalized,
        document_normalized: identity.documentNormalized,
        last_login_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (created.error) throwSupabaseApiError(created.error, "insert", "players");
    return created.data as Player;
  }

  const player = existing.data as Player;
  if (player.status !== "active") {
    throw createError({ statusCode: 403, statusMessage: "player_not_active" });
  }

  const updated = await db()
    .from("players")
    .update({
      full_name: fullName,
      phone,
      document_id: identity.documentId,
      last_login_at: new Date().toISOString(),
    })
    .eq("id", player.id)
    .select("*")
    .single();
  if (updated.error) throwSupabaseApiError(updated.error, "update", "players");
  return updated.data as Player;
}

async function findPlayingAttempt(playerId: string) {
  const result = await db()
    .from("rocket_attempts")
    .select("*")
    .eq("player_id", playerId)
    .eq("status", "playing")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) throw result.error;
  return result.data as RocketAttempt | null;
}

export async function maybeFinishAttempt(attempt: RocketAttempt) {
  if (attempt.status !== "playing") return attempt;

  const elapsedMs = Date.now() - new Date(attempt.started_at).getTime();
  const current = calculateMultiplier(elapsedMs);
  const crashPoint = Number(attempt.crash_point);

  if (elapsedMs > MAX_PLAYING_MS) {
    const result = await db()
      .from("rocket_attempts")
      .update({ status: "expired", ended_at: new Date().toISOString(), score: 0 })
      .eq("id", attempt.id)
      .select("*")
      .single();
    if (result.error) throw result.error;
    return result.data as RocketAttempt;
  }

  if (current >= crashPoint) {
    const result = await db()
      .from("rocket_attempts")
      .update({ status: "crashed", ended_at: new Date().toISOString(), score: 0 })
      .eq("id", attempt.id)
      .select("*")
      .single();
    if (result.error) throw result.error;
    return result.data as RocketAttempt;
  }

  return attempt;
}

export async function startAttempt(playerId: string) {
  const player = await getPlayer(playerId);
  const playing = await findPlayingAttempt(player.id);
  if (playing) {
    const current = await maybeFinishAttempt(playing);
    if (current.status === "playing") {
      return playingAttemptPayload(current, Math.max(0, MAX_ATTEMPTS - current.attempt_number));
    }
  }

  const stats = await getPlayerStats(player.id);
  if (stats.attempts_used >= MAX_ATTEMPTS) {
    throw createError({ statusCode: 409, statusMessage: "attempt_limit_reached" });
  }

  const attemptNumber = stats.attempts_used + 1;
  const serverSeed = generateServerSeed();
  const startedAt = new Date().toISOString();
  const created = await db()
    .from("rocket_attempts")
    .insert({
      player_id: player.id,
      attempt_number: attemptNumber,
      status: "playing",
      server_seed_hash: hashServerSeed(serverSeed),
      server_seed: serverSeed,
      crash_point: crashPointFromSeed(`${serverSeed}:${player.id}:${attemptNumber}`),
      started_at: startedAt,
    })
    .select("*")
    .single();

  if (created.error) {
    const concurrent = await findPlayingAttempt(player.id);
    if (concurrent) {
      return playingAttemptPayload(
        concurrent,
        Math.max(0, MAX_ATTEMPTS - concurrent.attempt_number),
      );
    }
    throw created.error;
  }

  return playingAttemptPayload(
    created.data as RocketAttempt,
    Math.max(0, MAX_ATTEMPTS - attemptNumber),
  );
}

export async function getAttempt(attemptId: string, playerId: string) {
  const result = await db()
    .from("rocket_attempts")
    .select("*")
    .eq("id", attemptId)
    .eq("player_id", playerId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw createError({ statusCode: 404, statusMessage: "attempt_not_found" });
  return result.data as RocketAttempt;
}

export function playingAttemptPayload(attempt: RocketAttempt, attemptsLeftAfterStart: number) {
  return {
    attempt_id: attempt.id,
    attempt_number: attempt.attempt_number,
    server_time: new Date().toISOString(),
    started_at: attempt.started_at,
    server_seed_hash: attempt.server_seed_hash,
    attempts_left_after_start: attemptsLeftAfterStart,
  };
}

export function attemptStatePayload(attempt: RocketAttempt) {
  if (attempt.status === "playing") {
    return {
      attempt_id: attempt.id,
      status: "playing",
      current_multiplier: calculateMultiplier(Date.now() - new Date(attempt.started_at).getTime()),
      server_time: new Date().toISOString(),
    };
  }

  return {
    attempt_id: attempt.id,
    status: attempt.status,
    cashed_out_at: attempt.cashed_out_at == null ? null : Number(attempt.cashed_out_at),
    score: attempt.score,
    crash_point: Number(attempt.crash_point),
    server_seed: attempt.server_seed,
    ended_at: attempt.ended_at,
  };
}

export async function cashOutAttempt(attemptId: string, playerId: string) {
  const result = await db().rpc("cash_out_rocket_attempt", {
    p_attempt_id: attemptId,
    p_player_id: playerId,
  });

  if (result.error) {
    if (result.error.message.includes("attempt_not_found")) {
      throw createError({ statusCode: 404, statusMessage: "attempt_not_found" });
    }
    throwSupabaseApiError(result.error, "rpc", "cash_out_rocket_attempt");
  }

  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  return {
    attempt_id: row.attempt_id,
    status: row.status,
    current_multiplier: row.current_multiplier == null ? null : Number(row.current_multiplier),
    cashed_out_at: row.cashed_out_at == null ? null : Number(row.cashed_out_at),
    score: row.score,
    crash_point: row.crash_point == null ? null : Number(row.crash_point),
    server_seed: row.server_seed,
    ended_at: row.ended_at,
    ...(await getPlayerStats(playerId)),
  };
}

export async function leaderboard(limit: number) {
  const result = await db()
    .from("rocket_attempts")
    .select("player_id, score, cashed_out_at, ended_at, created_at, players(full_name, phone)")
    .eq("status", "cashed_out")
    .gt("score", 0)
    .order("score", { ascending: false })
    .limit(Math.max(limit * 5, limit));

  if (result.error) throw result.error;

  const bestByPlayer = new Map<string, LeaderboardRow>();
  for (const row of (result.data ?? []) as LeaderboardRow[]) {
    if (!bestByPlayer.has(row.player_id)) bestByPlayer.set(row.player_id, row);
  }

  return [...bestByPlayer.values()].slice(0, limit).map((row, index) => {
    const player = Array.isArray(row.players) ? row.players[0] : row.players;
    return {
      rank: index + 1,
      full_name: player?.full_name ?? "Jugador",
      masked_phone: maskPhone(player?.phone ?? ""),
      best_multiplier: Number(row.cashed_out_at ?? 0),
      best_score: Number(row.score ?? 0),
      created_at: row.ended_at ?? row.created_at,
    };
  });
}
