import cookieParser from "cookie-parser";
import cors from "cors";
import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";

import {
  calculateMultiplier,
  crashPointFromSeed,
  generateServerSeed,
  generateSessionToken,
  hashServerSeed,
  hashSessionToken,
  maskPhone,
  normalizePhone,
  resolvePlayerIdentity,
} from "./game/game";

const PLAYER_COOKIE = "eureka_session";
const ADMIN_COOKIE = "eureka_admin";
const SESSION_DAYS = 7;
const MAX_ATTEMPTS = 3;
const MAX_PLAYING_MS = 120_000;

type Db = SupabaseClient;

type RuntimeConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
  frontendOrigins: string[];
  adminPin: string;
  cookieSecret: string;
  port: number;
  nodeEnv: string;
};

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

type AttemptStatus = "playing" | "cashed_out" | "crashed" | "expired" | "invalidated";

type RocketAttempt = {
  id: string;
  player_id: string;
  attempt_number: number;
  status: AttemptStatus;
  server_seed_hash: string;
  server_seed: string;
  crash_point: number | string;
  started_at: string;
  ended_at: string | null;
  cashed_out_at: number | string | null;
  score: number;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

type PlayerJoin = {
  full_name?: string;
  phone?: string;
  document_id?: string;
};

type LeaderboardQueryRow = {
  player_id: string;
  score: number;
  cashed_out_at: number | string | null;
  ended_at: string | null;
  created_at: string;
  players?: PlayerJoin | PlayerJoin[] | null;
};

type AdminAttemptQueryRow = RocketAttempt & {
  players?: PlayerJoin | PlayerJoin[] | null;
};

type AuditLogQueryRow = {
  id: string;
  player_id: string | null;
  action: string;
  metadata: unknown;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  players?: PlayerJoin | PlayerJoin[] | null;
};

type PlayerSession = {
  id: string;
  player_id: string;
  session_token_hash: string;
  expires_at: string;
  revoked_at: string | null;
};

type AuthContext = {
  player: Player;
  session: PlayerSession;
};

type AuthedRequest = Request & { auth?: AuthContext; admin?: true };

class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`Missing required env var ${name}`);
  return value.trim();
}

function loadConfig(): RuntimeConfig {
  const frontendUrl = requireEnv("FRONTEND_URL");
  const port = Number(requireEnv("PORT"));
  if (!Number.isFinite(port) || port <= 0) throw new Error("PORT must be a positive number");

  return {
    supabaseUrl: requireEnv("SUPABASE_URL").trim(),
    serviceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY").trim(),
    frontendOrigins: frontendUrl
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    adminPin: requireEnv("ADMIN_PIN"),
    cookieSecret: requireEnv("COOKIE_SECRET"),
    port,
    nodeEnv: process.env.NODE_ENV ?? "development",
  };
}

function createSupabase(config: RuntimeConfig): Db {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function isProduction(config: RuntimeConfig): boolean {
  return config.nodeEnv === "production";
}

function cookieOptions(config: RuntimeConfig, expiresAt?: Date) {
  return {
    httpOnly: true,
    secure: isProduction(config),
    sameSite: "lax" as const,
    signed: true,
    path: "/",
    expires: expiresAt,
  };
}

function clientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function userAgent(req: Request): string {
  return req.get("user-agent") ?? "";
}

function parsePage(req: Request) {
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 25) || 25));
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

function parseSort(req: Request, defaultKey = "created_at", defaultDir: "asc" | "desc" = "desc") {
  const key = typeof req.query.sort === "string" && req.query.sort ? req.query.sort : defaultKey;
  const dir = req.query.dir === "asc" ? "asc" : defaultDir;
  return { key, dir };
}

function signedCookie(req: Request, name: string): string | null {
  const value = req.signedCookies?.[name];
  return typeof value === "string" ? value : null;
}

function adminCookieValue(config: RuntimeConfig): string {
  return hashSessionToken(`admin:${config.adminPin}:${config.cookieSecret}`);
}

function rateLimit({ windowMs, max }: { windowMs: number; max: number }) {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, _res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = clientIp(req);
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (current.count >= max) {
      next(new ApiError(429, "rate_limit_exceeded"));
      return;
    }

    current.count += 1;
    next();
  };
}

async function logAudit(
  db: Db,
  req: Request,
  action: string,
  metadata?: Record<string, unknown>,
  playerId?: string | null,
) {
  await db.from("audit_logs").insert({
    player_id: playerId ?? null,
    action,
    metadata: metadata ?? null,
    ip_address: clientIp(req),
    user_agent: userAgent(req),
  });
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

async function getPlayerStats(db: Db, playerId: string) {
  const attemptsResult = await db
    .from("rocket_attempts")
    .select("score, cashed_out_at", { count: "exact" })
    .eq("player_id", playerId);

  if (attemptsResult.error) throw attemptsResult.error;

  const attempts = (attemptsResult.data ?? []) as Pick<RocketAttempt, "score" | "cashed_out_at">[];
  const best = attempts.reduce(
    (acc, attempt) => {
      const score = Number(attempt.score ?? 0);
      const multiplier = attempt.cashed_out_at == null ? 0 : Number(attempt.cashed_out_at);
      return score > acc.best_score ? { best_score: score, best_multiplier: multiplier } : acc;
    },
    { best_score: 0, best_multiplier: 0 },
  );

  const attemptsUsed = attemptsResult.count ?? attempts.length;
  return {
    attempts_used: attemptsUsed,
    attempts_left: Math.max(0, MAX_ATTEMPTS - attemptsUsed),
    ...best,
  };
}

async function playerPayload(db: Db, player: Player) {
  const stats = await getPlayerStats(db, player.id);
  return {
    player: publicPlayer(player),
    ...stats,
  };
}

async function requirePlayer(
  config: RuntimeConfig,
  db: Db,
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const token = signedCookie(req, PLAYER_COOKIE);
    if (!token) throw new ApiError(401, "missing_session");

    const tokenHash = hashSessionToken(token);
    const sessionResult = await db
      .from("player_sessions")
      .select("*")
      .eq("session_token_hash", tokenHash)
      .maybeSingle();

    if (sessionResult.error) throw sessionResult.error;
    const session = sessionResult.data as PlayerSession | null;
    if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) {
      res.clearCookie(PLAYER_COOKIE, cookieOptions(config));
      throw new ApiError(401, "invalid_session");
    }

    const playerResult = await db
      .from("players")
      .select("*")
      .eq("id", session.player_id)
      .maybeSingle();
    if (playerResult.error) throw playerResult.error;

    const player = playerResult.data as Player | null;
    if (!player || player.status !== "active") throw new ApiError(403, "player_not_active");

    req.auth = { player, session };
    next();
  } catch (error) {
    next(error);
  }
}

function requireAdmin(config: RuntimeConfig) {
  return (req: AuthedRequest, _res: Response, next: NextFunction) => {
    const token = signedCookie(req, ADMIN_COOKIE);
    if (token !== adminCookieValue(config)) {
      next(new ApiError(401, "admin_session_required"));
      return;
    }
    req.admin = true;
    next();
  };
}

function parseRequiredString(body: unknown, key: string): string {
  if (!body || typeof body !== "object") throw new ApiError(400, "invalid_body");
  const value = (body as Record<string, unknown>)[key];
  if (typeof value !== "string" || !value.trim()) throw new ApiError(400, `${key}_required`);
  return value.trim();
}

function parseOptionalString(body: unknown, key: string): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function assertNoClientGameResult(body: unknown, req: Request, db: Db, playerId: string) {
  if (!body || typeof body !== "object") return;
  const payload = body as Record<string, unknown>;
  const suspiciousKeys = ["multiplier", "score", "crashPoint", "crash_point"].filter(
    (key) => key in payload,
  );
  if (suspiciousKeys.length > 0) {
    void logAudit(db, req, "suspicious_client_game_result", { keys: suspiciousKeys }, playerId);
    throw new ApiError(400, "client_game_result_not_allowed", { keys: suspiciousKeys });
  }
}

async function findPlayingAttempt(db: Db, playerId: string): Promise<RocketAttempt | null> {
  const result = await db
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

async function maybeFinishPlayingAttempt(db: Db, attempt: RocketAttempt): Promise<RocketAttempt> {
  if (attempt.status !== "playing") return attempt;

  const elapsedMs = Date.now() - new Date(attempt.started_at).getTime();
  const current = calculateMultiplier(elapsedMs);
  const crashPoint = Number(attempt.crash_point);

  if (elapsedMs > MAX_PLAYING_MS) {
    const result = await db
      .from("rocket_attempts")
      .update({ status: "expired", ended_at: new Date().toISOString(), score: 0 })
      .eq("id", attempt.id)
      .select("*")
      .single();
    if (result.error) throw result.error;
    return result.data as RocketAttempt;
  }

  if (current >= crashPoint) {
    const result = await db
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

function playingAttemptPayload(attempt: RocketAttempt, attemptsLeftAfterStart: number) {
  return {
    attempt_id: attempt.id,
    attempt_number: attempt.attempt_number,
    server_time: new Date().toISOString(),
    started_at: attempt.started_at,
    server_seed_hash: attempt.server_seed_hash,
    attempts_left_after_start: attemptsLeftAfterStart,
  };
}

function attemptStatePayload(attempt: RocketAttempt) {
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

async function getAttemptForPlayer(
  db: Db,
  attemptId: string,
  playerId: string,
): Promise<RocketAttempt | null> {
  const result = await db
    .from("rocket_attempts")
    .select("*")
    .eq("id", attemptId)
    .eq("player_id", playerId)
    .maybeSingle();

  if (result.error) throw result.error;
  return result.data as RocketAttempt | null;
}

async function leaderboardRows(db: Db, limit: number) {
  const result = await db
    .from("rocket_attempts")
    .select("player_id, score, cashed_out_at, ended_at, created_at, players(full_name, phone)")
    .eq("status", "cashed_out")
    .gt("score", 0)
    .order("score", { ascending: false })
    .limit(Math.max(limit * 5, limit));

  if (result.error) throw result.error;

  const bestByPlayer = new Map<string, LeaderboardQueryRow>();
  for (const row of (result.data ?? []) as LeaderboardQueryRow[]) {
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

function shouldRetryLegacyCashoutRpc(error: unknown) {
  const item = error as { code?: string; message?: string; details?: string; hint?: string };
  const text = [item?.code, item?.message, item?.details, item?.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    item?.code === "PGRST202" ||
    item?.code === "42883" ||
    (text.includes("cash_out_rocket_attempt") && text.includes("p_cashout_requested_at"))
  );
}

function datatablePayload<T>({
  rows,
  total,
  page,
  pageSize,
  filters,
  sort,
}: {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  filters: Record<string, unknown>;
  sort: Record<string, unknown>;
}) {
  return { rows, total, page, pageSize, filters, sort };
}

export function createApp(config = loadConfig(), db = createSupabase(config)) {
  const app = express();
  const loginLimiter = rateLimit({ windowMs: 60_000, max: 12 });
  const startLimiter = rateLimit({ windowMs: 30_000, max: 8 });
  const cashoutLimiter = rateLimit({ windowMs: 10_000, max: 20 });

  app.set("trust proxy", 1);
  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        if (!origin || config.frontendOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new ApiError(403, "cors_origin_not_allowed"));
      },
    }),
  );
  app.use(express.json({ limit: "32kb" }));
  app.use(cookieParser(config.cookieSecret));

  const playerAuth = (req: AuthedRequest, res: Response, next: NextFunction) =>
    requirePlayer(config, db, req, res, next);
  const adminAuth = requireAdmin(config);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/player/login", loginLimiter, async (req, res, next) => {
    try {
      const fullName = parseRequiredString(req.body, "full_name");
      const phone = parseRequiredString(req.body, "phone");
      const identity = resolvePlayerIdentity({
        phone,
        documentId: parseOptionalString(req.body, "document_id"),
      });
      const { phoneNormalized, documentId, documentNormalized } = identity;

      if (phoneNormalized.length < 6) throw new ApiError(400, "phone_invalid");

      const existing = await db
        .from("players")
        .select("*")
        .eq("phone_normalized", phoneNormalized)
        .eq("document_normalized", documentNormalized)
        .maybeSingle();
      if (existing.error) throw existing.error;

      let player = existing.data as Player | null;
      if (!player) {
        const created = await db
          .from("players")
          .insert({
            full_name: fullName,
            phone,
            document_id: documentId,
            phone_normalized: phoneNormalized,
            document_normalized: documentNormalized,
            last_login_at: new Date().toISOString(),
          })
          .select("*")
          .single();
        if (created.error) throw created.error;
        player = created.data as Player;
      } else {
        if (player.status !== "active") throw new ApiError(403, "player_not_active");
        const updated = await db
          .from("players")
          .update({
            full_name: fullName,
            phone,
            document_id: documentId,
            last_login_at: new Date().toISOString(),
          })
          .eq("id", player.id)
          .select("*")
          .single();
        if (updated.error) throw updated.error;
        player = updated.data as Player;
      }

      const token = generateSessionToken();
      const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
      const session = await db.from("player_sessions").insert({
        player_id: player.id,
        session_token_hash: hashSessionToken(token),
        expires_at: expiresAt.toISOString(),
        ip_address: clientIp(req),
        user_agent: userAgent(req),
      });
      if (session.error) throw session.error;

      await logAudit(db, req, "player_login", undefined, player.id);
      res.cookie(PLAYER_COOKIE, token, cookieOptions(config, expiresAt));
      res.json(await playerPayload(db, player));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/player/me", playerAuth, async (req: AuthedRequest, res, next) => {
    try {
      res.json(await playerPayload(db, req.auth!.player));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/rocket/start", playerAuth, startLimiter, async (req: AuthedRequest, res, next) => {
    try {
      const player = req.auth!.player;
      const playing = await findPlayingAttempt(db, player.id);
      if (playing) {
        const current = await maybeFinishPlayingAttempt(db, playing);
        if (current.status === "playing") {
          res.json(
            playingAttemptPayload(current, Math.max(0, MAX_ATTEMPTS - current.attempt_number)),
          );
          return;
        }
      }

      const stats = await getPlayerStats(db, player.id);
      if (stats.attempts_used >= MAX_ATTEMPTS) throw new ApiError(409, "attempt_limit_reached");

      const attemptNumber = stats.attempts_used + 1;
      const serverSeed = generateServerSeed();
      const seedMaterial = `${serverSeed}:${player.id}:${attemptNumber}`;
      const startedAt = new Date().toISOString();
      const insert = await db
        .from("rocket_attempts")
        .insert({
          player_id: player.id,
          attempt_number: attemptNumber,
          status: "playing",
          server_seed_hash: hashServerSeed(serverSeed),
          server_seed: serverSeed,
          crash_point: crashPointFromSeed(seedMaterial),
          started_at: startedAt,
          ip_address: clientIp(req),
          user_agent: userAgent(req),
        })
        .select("*")
        .single();

      if (insert.error) {
        const concurrentPlaying = await findPlayingAttempt(db, player.id);
        if (concurrentPlaying) {
          res.json(
            playingAttemptPayload(
              concurrentPlaying,
              Math.max(0, MAX_ATTEMPTS - concurrentPlaying.attempt_number),
            ),
          );
          return;
        }
        throw insert.error;
      }

      const attempt = insert.data as RocketAttempt;
      await logAudit(
        db,
        req,
        "rocket_start",
        { attempt_id: attempt.id, attempt_number: attemptNumber },
        player.id,
      );
      res.json(playingAttemptPayload(attempt, Math.max(0, MAX_ATTEMPTS - attemptNumber)));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/rocket/state/:attemptId", playerAuth, async (req: AuthedRequest, res, next) => {
    try {
      const attemptId = Array.isArray(req.params.attemptId)
        ? req.params.attemptId[0]
        : req.params.attemptId;
      if (!attemptId) throw new ApiError(400, "attempt_id_required");

      const attempt = await getAttemptForPlayer(db, attemptId, req.auth!.player.id);
      if (!attempt) throw new ApiError(404, "attempt_not_found");

      const current = await maybeFinishPlayingAttempt(db, attempt);
      res.json(attemptStatePayload(current));
    } catch (error) {
      next(error);
    }
  });

  app.post(
    "/api/rocket/cashout",
    playerAuth,
    cashoutLimiter,
    async (req: AuthedRequest, res, next) => {
      try {
        const player = req.auth!.player;
        assertNoClientGameResult(req.body, req, db, player.id);
        const attemptId = parseRequiredString(req.body, "attempt_id");
        const cashoutRequestedAt = parseOptionalString(req.body, "cashout_requested_at");
        if (cashoutRequestedAt && Number.isNaN(Date.parse(cashoutRequestedAt))) {
          throw new ApiError(400, "cashout_requested_at_invalid");
        }

        let result = await db.rpc("cash_out_rocket_attempt", {
          p_attempt_id: attemptId,
          p_player_id: player.id,
          p_cashout_requested_at: cashoutRequestedAt ?? null,
        });

        if (result.error && shouldRetryLegacyCashoutRpc(result.error)) {
          result = await db.rpc("cash_out_rocket_attempt", {
            p_attempt_id: attemptId,
            p_player_id: player.id,
          });
        }

        if (result.error) {
          if (result.error.message.includes("attempt_not_found"))
            throw new ApiError(404, "attempt_not_found");
          throw result.error;
        }

        const row = Array.isArray(result.data) ? result.data[0] : result.data;
        await logAudit(
          db,
          req,
          "rocket_cashout",
          { attempt_id: attemptId, status: row?.status },
          player.id,
        );
        res.json({
          attempt_id: row.attempt_id,
          status: row.status,
          current_multiplier:
            row.current_multiplier == null ? null : Number(row.current_multiplier),
          cashed_out_at: row.cashed_out_at == null ? null : Number(row.cashed_out_at),
          score: row.score,
          crash_point: row.crash_point == null ? null : Number(row.crash_point),
          server_seed: row.server_seed,
          ended_at: row.ended_at,
          ...(await getPlayerStats(db, player.id)),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get("/api/leaderboard", async (req, res, next) => {
    try {
      const limit = Math.min(50, Math.max(10, Number(req.query.limit ?? 10) || 10));
      res.json(await leaderboardRows(db, limit));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/login", loginLimiter, async (req, res, next) => {
    try {
      const pin = parseRequiredString(req.body, "pin");
      if (pin !== config.adminPin) throw new ApiError(401, "invalid_admin_pin");
      res.cookie(ADMIN_COOKIE, adminCookieValue(config), cookieOptions(config));
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/players", adminAuth, async (req, res, next) => {
    try {
      const { page, pageSize, offset } = parsePage(req);
      const sort = parseSort(req, "created_at", "desc");
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      let query = db.from("players").select("*", { count: "exact" });

      if (q) {
        query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,document_id.ilike.%${q}%`);
      }

      const result = await query
        .order(sort.key, { ascending: sort.dir === "asc" })
        .range(offset, offset + pageSize - 1);
      if (result.error) throw result.error;

      const players = (result.data ?? []) as Player[];
      const rows = await Promise.all(
        players.map(async (player) => ({
          ...publicPlayer(player),
          ...(await getPlayerStats(db, player.id)),
        })),
      );

      res.json(
        datatablePayload({
          rows,
          total: result.count ?? rows.length,
          page,
          pageSize,
          filters: { q },
          sort,
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/attempts", adminAuth, async (req, res, next) => {
    try {
      const { page, pageSize, offset } = parsePage(req);
      const sort = parseSort(req, "created_at", "desc");
      const result = await db
        .from("rocket_attempts")
        .select("*, players(full_name, phone, document_id)", { count: "exact" })
        .order(sort.key, { ascending: sort.dir === "asc" })
        .range(offset, offset + pageSize - 1);
      if (result.error) throw result.error;

      const rows = ((result.data ?? []) as AdminAttemptQueryRow[]).map((row) => ({
        id: row.id,
        player_id: row.player_id,
        player: Array.isArray(row.players) ? row.players[0] : row.players,
        attempt_number: row.attempt_number,
        status: row.status,
        cashout_multiplier: row.cashed_out_at == null ? null : Number(row.cashed_out_at),
        score: row.score,
        crash_point: row.status === "playing" ? null : Number(row.crash_point),
        started_at: row.started_at,
        ended_at: row.ended_at,
        created_at: row.created_at,
      }));

      res.json(
        datatablePayload({
          rows,
          total: result.count ?? rows.length,
          page,
          pageSize,
          filters: {},
          sort,
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/leaderboard", adminAuth, async (req, res, next) => {
    try {
      const { page, pageSize } = parsePage(req);
      const rows = await leaderboardRows(db, pageSize);
      res.json(
        datatablePayload({
          rows,
          total: rows.length,
          page,
          pageSize,
          filters: {},
          sort: { key: "best_score", dir: "desc" },
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/audit-logs", adminAuth, async (req, res, next) => {
    try {
      const { page, pageSize, offset } = parsePage(req);
      const sort = parseSort(req, "created_at", "desc");
      const result = await db
        .from("audit_logs")
        .select("*, players(full_name, phone)", { count: "exact" })
        .order(sort.key, { ascending: sort.dir === "asc" })
        .range(offset, offset + pageSize - 1);
      if (result.error) throw result.error;

      const rows = ((result.data ?? []) as AuditLogQueryRow[]).map((row) => ({
        id: row.id,
        player_id: row.player_id,
        player: Array.isArray(row.players) ? row.players[0] : row.players,
        action: row.action,
        metadata: row.metadata,
        ip_address: row.ip_address,
        user_agent: row.user_agent,
        created_at: row.created_at,
      }));

      res.json(
        datatablePayload({
          rows,
          total: result.count ?? rows.length,
          page,
          pageSize,
          filters: {},
          sort,
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/invalidate-attempt", adminAuth, async (req, res, next) => {
    try {
      const attemptId = parseRequiredString(req.body, "attempt_id");
      const reason =
        req.body &&
        typeof req.body === "object" &&
        typeof (req.body as Record<string, unknown>).reason === "string"
          ? ((req.body as Record<string, string>).reason || "admin_invalidation").trim()
          : "admin_invalidation";

      const result = await db
        .from("rocket_attempts")
        .update({
          status: "invalidated",
          score: 0,
          ended_at: new Date().toISOString(),
        })
        .eq("id", attemptId)
        .select("*")
        .single();
      if (result.error) throw result.error;

      const attempt = result.data as RocketAttempt;
      await logAudit(
        db,
        req,
        "admin_invalidate_attempt",
        { attempt_id: attemptId, reason },
        attempt.player_id,
      );
      res.json({ ok: true, attempt_id: attempt.id, status: attempt.status });
    } catch (error) {
      next(error);
    }
  });

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : "internal_error";
    if (status >= 500) console.error(error);
    res.status(status).json({
      error: message,
      ...(error instanceof ApiError && error.details ? { details: error.details } : {}),
    });
  };

  app.use(errorHandler);
  return app;
}

export function startServer() {
  const config = loadConfig();
  const app = createApp(config);
  app.listen(config.port, () => {
    console.log(`Eureka Rocket API listening on ${config.port}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
