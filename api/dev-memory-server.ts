import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { pathToFileURL } from "node:url";

import {
  calculateMultiplier,
  crashPointFromSeed,
  generateServerSeed,
  generateSessionToken,
  hashServerSeed,
  hashSessionToken,
  maskPhone,
  resolvePlayerIdentity,
  scoreForMultiplier,
} from "./game/game";

const COOKIE_NAME = "eureka_session";
const MAX_ATTEMPTS = 3;
const MAX_PLAYING_MS = 120_000;

type Player = {
  id: string;
  full_name: string;
  phone: string;
  document_id: string;
  phone_normalized: string;
  document_normalized: string;
  created_at: string;
  status: "active" | "blocked";
};

type Session = {
  token_hash: string;
  player_id: string;
  expires_at: string;
};

type AttemptStatus = "playing" | "cashed_out" | "crashed" | "expired" | "invalidated";

type Attempt = {
  id: string;
  player_id: string;
  attempt_number: number;
  status: AttemptStatus;
  server_seed_hash: string;
  server_seed: string;
  crash_point: number;
  started_at: string;
  ended_at: string | null;
  cashed_out_at: number | null;
  score: number;
  created_at: string;
};

const players = new Map<string, Player>();
const sessions = new Map<string, Session>();
const attempts = new Map<string, Attempt>();

function uuid() {
  return crypto.randomUUID();
}

function cookieOptions(expires?: Date) {
  return {
    httpOnly: true,
    secure: false,
    sameSite: "lax" as const,
    signed: true,
    path: "/",
    expires,
  };
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

function statsFor(playerId: string) {
  const playerAttempts = [...attempts.values()].filter((attempt) => attempt.player_id === playerId);
  const best = playerAttempts.reduce(
    (acc, attempt) => {
      if (attempt.score > acc.best_score) {
        return {
          best_score: attempt.score,
          best_multiplier: attempt.cashed_out_at ?? 0,
        };
      }
      return acc;
    },
    { best_score: 0, best_multiplier: 0 },
  );

  return {
    attempts_used: playerAttempts.length,
    attempts_left: Math.max(0, MAX_ATTEMPTS - playerAttempts.length),
    ...best,
  };
}

function playerPayload(player: Player) {
  return {
    player: publicPlayer(player),
    ...statsFor(player.id),
  };
}

function signedCookie(req: Request) {
  const value = req.signedCookies?.[COOKIE_NAME];
  return typeof value === "string" ? value : null;
}

function requirePlayer(req: Request, _res: Response, next: NextFunction) {
  const token = signedCookie(req);
  if (!token) {
    next(Object.assign(new Error("missing_session"), { status: 401 }));
    return;
  }

  const session = sessions.get(hashSessionToken(token));
  if (!session || new Date(session.expires_at).getTime() <= Date.now()) {
    next(Object.assign(new Error("invalid_session"), { status: 401 }));
    return;
  }

  const player = players.get(session.player_id);
  if (!player || player.status !== "active") {
    next(Object.assign(new Error("player_not_active"), { status: 403 }));
    return;
  }

  (req as Request & { player: Player }).player = player;
  next();
}

function currentAttemptState(attempt: Attempt): Attempt {
  if (attempt.status !== "playing") return attempt;

  const elapsedMs = Date.now() - new Date(attempt.started_at).getTime();
  const current = calculateMultiplier(elapsedMs);
  if (elapsedMs > MAX_PLAYING_MS) {
    attempt.status = "expired";
    attempt.score = 0;
    attempt.ended_at = new Date().toISOString();
    return attempt;
  }

  if (current >= attempt.crash_point) {
    attempt.status = "crashed";
    attempt.score = 0;
    attempt.ended_at = new Date().toISOString();
  }

  return attempt;
}

function statePayload(attempt: Attempt) {
  if (attempt.status === "playing") {
    return {
      attempt_id: attempt.id,
      status: attempt.status,
      current_multiplier: calculateMultiplier(Date.now() - new Date(attempt.started_at).getTime()),
      server_time: new Date().toISOString(),
    };
  }

  return {
    attempt_id: attempt.id,
    status: attempt.status,
    cashed_out_at: attempt.cashed_out_at,
    score: attempt.score,
    crash_point: attempt.crash_point,
    server_seed: attempt.server_seed,
    ended_at: attempt.ended_at,
  };
}

function leaderboard(limit = 10) {
  const bestByPlayer = new Map<string, Attempt>();
  for (const attempt of attempts.values()) {
    if (attempt.status !== "cashed_out" || attempt.score <= 0) continue;
    const current = bestByPlayer.get(attempt.player_id);
    if (!current || attempt.score > current.score) bestByPlayer.set(attempt.player_id, attempt);
  }

  return [...bestByPlayer.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((attempt, index) => {
      const player = players.get(attempt.player_id);
      return {
        rank: index + 1,
        full_name: player?.full_name ?? "Jugador",
        masked_phone: maskPhone(player?.phone ?? ""),
        best_multiplier: attempt.cashed_out_at ?? 0,
        best_score: attempt.score,
        created_at: attempt.ended_at ?? attempt.created_at,
      };
    });
}

export function createDevMemoryApp() {
  const app = express();
  const cookieSecret = process.env.COOKIE_SECRET || "eureka-local-dev-secret";
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:8080";

  app.use(cors({ credentials: true, origin: frontendUrl }));
  app.use(express.json({ limit: "32kb" }));
  app.use(cookieParser(cookieSecret));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, mode: "dev-memory" });
  });

  app.post("/api/player/login", (req, res, next) => {
    try {
      const fullName = String(req.body?.full_name ?? "").trim();
      const phone = String(req.body?.phone ?? "").trim();
      if (!fullName) throw Object.assign(new Error("full_name_required"), { status: 400 });

      const identity = resolvePlayerIdentity({ phone, documentId: req.body?.document_id });
      if (identity.phoneNormalized.length < 6) {
        throw Object.assign(new Error("phone_invalid"), { status: 400 });
      }

      const key = `${identity.phoneNormalized}:${identity.documentNormalized}`;
      let player = [...players.values()].find(
        (item) => `${item.phone_normalized}:${item.document_normalized}` === key,
      );

      if (!player) {
        player = {
          id: uuid(),
          full_name: fullName,
          phone,
          document_id: identity.documentId,
          phone_normalized: identity.phoneNormalized,
          document_normalized: identity.documentNormalized,
          created_at: new Date().toISOString(),
          status: "active",
        };
        players.set(player.id, player);
      } else {
        player.full_name = fullName;
        player.phone = phone;
      }

      const token = generateSessionToken();
      const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      sessions.set(hashSessionToken(token), {
        token_hash: hashSessionToken(token),
        player_id: player.id,
        expires_at: expires.toISOString(),
      });

      res.cookie(COOKIE_NAME, token, cookieOptions(expires));
      res.json(playerPayload(player));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/player/me", requirePlayer, (req, res) => {
    res.json(playerPayload((req as Request & { player: Player }).player));
  });

  app.post("/api/rocket/start", requirePlayer, (req, res, next) => {
    try {
      const player = (req as Request & { player: Player }).player;
      const playing = [...attempts.values()].find(
        (attempt) => attempt.player_id === player.id && attempt.status === "playing",
      );

      if (playing) {
        const current = currentAttemptState(playing);
        if (current.status === "playing") {
          res.json({
            attempt_id: current.id,
            attempt_number: current.attempt_number,
            server_time: new Date().toISOString(),
            started_at: current.started_at,
            server_seed_hash: current.server_seed_hash,
            attempts_left_after_start: Math.max(0, MAX_ATTEMPTS - current.attempt_number),
          });
          return;
        }
      }

      const stats = statsFor(player.id);
      if (stats.attempts_used >= MAX_ATTEMPTS) {
        throw Object.assign(new Error("attempt_limit_reached"), { status: 409 });
      }

      const attemptNumber = stats.attempts_used + 1;
      const serverSeed = generateServerSeed();
      const attempt: Attempt = {
        id: uuid(),
        player_id: player.id,
        attempt_number: attemptNumber,
        status: "playing",
        server_seed_hash: hashServerSeed(serverSeed),
        server_seed: serverSeed,
        crash_point: crashPointFromSeed(`${serverSeed}:${player.id}:${attemptNumber}`),
        started_at: new Date().toISOString(),
        ended_at: null,
        cashed_out_at: null,
        score: 0,
        created_at: new Date().toISOString(),
      };
      attempts.set(attempt.id, attempt);

      res.json({
        attempt_id: attempt.id,
        attempt_number: attempt.attempt_number,
        server_time: new Date().toISOString(),
        started_at: attempt.started_at,
        server_seed_hash: attempt.server_seed_hash,
        attempts_left_after_start: Math.max(0, MAX_ATTEMPTS - attempt.attempt_number),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/rocket/state/:attemptId", requirePlayer, (req, res, next) => {
    const player = (req as Request & { player: Player }).player;
    const attemptId = Array.isArray(req.params.attemptId)
      ? req.params.attemptId[0]
      : req.params.attemptId;
    const attempt = attemptId ? attempts.get(attemptId) : null;
    if (!attempt || attempt.player_id !== player.id) {
      next(Object.assign(new Error("attempt_not_found"), { status: 404 }));
      return;
    }
    res.json(statePayload(currentAttemptState(attempt)));
  });

  app.post("/api/rocket/cashout", requirePlayer, (req, res, next) => {
    try {
      const player = (req as Request & { player: Player }).player;
      const attemptId = String(req.body?.attempt_id ?? "");
      const attempt = attempts.get(attemptId);
      if (!attempt || attempt.player_id !== player.id) {
        throw Object.assign(new Error("attempt_not_found"), { status: 404 });
      }

      currentAttemptState(attempt);
      if (attempt.status === "playing") {
        const currentMultiplier = calculateMultiplier(
          Date.now() - new Date(attempt.started_at).getTime(),
        );
        if (currentMultiplier >= attempt.crash_point) {
          attempt.status = "crashed";
          attempt.score = 0;
          attempt.ended_at = new Date().toISOString();
        } else {
          attempt.status = "cashed_out";
          attempt.cashed_out_at = currentMultiplier;
          attempt.score = scoreForMultiplier(currentMultiplier);
          attempt.ended_at = new Date().toISOString();
        }
      }

      res.json({
        ...statePayload(attempt),
        ...statsFor(player.id),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/leaderboard", (req, res) => {
    res.json(leaderboard(Math.min(50, Math.max(10, Number(req.query.limit ?? 10) || 10))));
  });

  app.use(
    (error: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
      res.status(error.status ?? 500).json({ error: error.message || "internal_error" });
    },
  );

  return app;
}

export function startDevMemoryServer() {
  const port = Number(process.env.PORT || 4000);
  createDevMemoryApp().listen(port, () => {
    console.log(`Eureka Rocket dev memory API listening on ${port}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startDevMemoryServer();
}
