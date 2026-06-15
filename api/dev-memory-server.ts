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
import {
  GUESS_PLAYER_QUESTION_COUNT,
  GUESS_PLAYER_TIME_LIMIT_SECONDS,
  getFootballerById,
  isCorrectFootballerAnswer,
  selectGuessPlayerQuestions,
} from "./game/guess-player";

const COOKIE_NAME = "eureka_session";
const MAX_ATTEMPTS = 5;
const MAX_PLAYING_MS = 120_000;
const CASHOUT_BACKDATE_LIMIT_MS = 1500;
const GUESS_PLAYER_TIME_LIMIT_MS = GUESS_PLAYER_TIME_LIMIT_SECONDS * 1000;

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

type GuessSession = {
  id: string;
  player_id: string;
  status: "active" | "completed" | "expired";
  score: number;
  total_questions: number;
  started_at: string;
  completed_at: string | null;
  created_at: string;
};

type GuessQuestion = {
  id: string;
  session_id: string;
  footballer_id: string;
  question_order: number;
  club_hint: string;
  country_hint: string;
  position_hint: string;
  started_at: string | null;
  answered_at: string | null;
  user_answer: string | null;
  is_correct: boolean | null;
  is_locked: boolean;
  created_at: string;
};

const players = new Map<string, Player>();
const sessions = new Map<string, Session>();
const attempts = new Map<string, Attempt>();
const guessSessions = new Map<string, GuessSession>();
const guessQuestions = new Map<string, GuessQuestion[]>();

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

function requestPlayerId(req: Request) {
  const bodyPlayerId =
    req.body && typeof req.body === "object"
      ? (req.body as Record<string, unknown>).player_id
      : undefined;
  const queryPlayerId = req.query.player_id;
  const value = bodyPlayerId ?? queryPlayerId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requirePlayer(req: Request, _res: Response, next: NextFunction) {
  const playerId = requestPlayerId(req);
  if (playerId) {
    const player = players.get(playerId);
    if (!player || player.status !== "active") {
      next(Object.assign(new Error("player_not_active"), { status: 403 }));
      return;
    }

    (req as Request & { player: Player }).player = player;
    next();
    return;
  }

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
      started_at: attempt.started_at,
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

function cashoutTimeMs(attempt: Attempt, requestedAt?: string) {
  const nowMs = Date.now();
  const requestedMs = requestedAt ? Date.parse(requestedAt) : Number.NaN;
  if (!Number.isFinite(requestedMs)) return nowMs;
  const clampedMs = Math.min(nowMs, Math.max(requestedMs, nowMs - CASHOUT_BACKDATE_LIMIT_MS));
  return Math.max(clampedMs, new Date(attempt.started_at).getTime());
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

function guessQuestionPayload(question: GuessQuestion) {
  const startedAt = question.started_at ?? new Date().toISOString();
  const elapsedMs = Date.now() - new Date(startedAt).getTime();
  return {
    question_id: question.id,
    question_order: question.question_order,
    total_questions: GUESS_PLAYER_QUESTION_COUNT,
    club: question.club_hint,
    country: question.country_hint,
    position: question.position_hint,
    started_at: startedAt,
    server_time: new Date().toISOString(),
    time_limit_seconds: GUESS_PLAYER_TIME_LIMIT_SECONDS,
    time_remaining_seconds: Math.max(0, Math.ceil((GUESS_PLAYER_TIME_LIMIT_MS - elapsedMs) / 1000)),
  };
}

function completeGuessSession(session: GuessSession) {
  const questions = guessQuestions.get(session.id) ?? [];
  session.status = "completed";
  session.score = questions.filter((question) => question.is_correct).length;
  session.completed_at = new Date().toISOString();
  return session;
}

function currentGuessQuestion(session: GuessSession) {
  const questions = guessQuestions.get(session.id) ?? [];
  while (true) {
    const current = questions.find((question) => !question.is_locked);
    if (!current) return { session: completeGuessSession(session), question: null };

    if (!current.started_at) current.started_at = new Date().toISOString();

    const elapsedMs = Date.now() - new Date(current.started_at).getTime();
    if (elapsedMs <= GUESS_PLAYER_TIME_LIMIT_MS) return { session, question: current };

    current.answered_at = new Date().toISOString();
    current.user_answer = null;
    current.is_correct = false;
    current.is_locked = true;
  }
}

function guessResultPayload(session: GuessSession) {
  const questions = guessQuestions.get(session.id) ?? [];
  return {
    session_id: session.id,
    status: session.status,
    score: session.score,
    correct_answers: session.score,
    total_questions: session.total_questions,
    started_at: session.started_at,
    completed_at: session.completed_at,
    questions: questions.map((question) => {
      const footballer = getFootballerById(question.footballer_id);
      return {
        question_id: question.id,
        question_order: question.question_order,
        club: question.club_hint,
        country: question.country_hint,
        position: question.position_hint,
        user_answer: question.user_answer,
        is_correct: question.is_correct,
        correct_answer: footballer?.name ?? "Jugador",
      };
    }),
  };
}

export function createDevMemoryApp() {
  const app = express();
  const cookieSecret = process.env.COOKIE_SECRET || "eureka-local-dev-secret";
  const frontendOrigins = (
    process.env.FRONTEND_URL || "http://127.0.0.1:3000,http://localhost:3000,http://localhost:8080"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        if (!origin || frontendOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("cors_origin_not_allowed"));
      },
    }),
  );
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

  app.post("/api/guess-player/start", requirePlayer, (req, res) => {
    const player = (req as Request & { player: Player }).player;
    let session = [...guessSessions.values()].find(
      (item) => item.player_id === player.id && item.status === "active",
    );

    if (!session) {
      session = {
        id: uuid(),
        player_id: player.id,
        status: "active",
        score: 0,
        total_questions: GUESS_PLAYER_QUESTION_COUNT,
        started_at: new Date().toISOString(),
        completed_at: null,
        created_at: new Date().toISOString(),
      };
      guessSessions.set(session.id, session);

      guessQuestions.set(
        session.id,
        selectGuessPlayerQuestions(player.id, session.id).map((footballer, index) => ({
          id: uuid(),
          session_id: session!.id,
          footballer_id: footballer.id,
          question_order: index + 1,
          club_hint: footballer.club,
          country_hint: footballer.country,
          position_hint: footballer.position,
          started_at: index === 0 ? session!.started_at : null,
          answered_at: null,
          user_answer: null,
          is_correct: null,
          is_locked: false,
          created_at: new Date().toISOString(),
        })),
      );
    }

    const current = currentGuessQuestion(session);
    res.json({
      session_id: current.session.id,
      status: current.session.status,
      score: current.session.score,
      total_questions: current.session.total_questions,
      current_question: current.question ? guessQuestionPayload(current.question) : null,
    });
  });

  app.get(
    ["/api/guess-player/current", "/api/guess-player/session/:sessionId/current"],
    requirePlayer,
    (req, res, next) => {
      const player = (req as Request & { player: Player }).player;
      const sessionId = String(req.params.sessionId ?? req.query.session_id ?? "");
      const session = guessSessions.get(sessionId);
      if (!session || session.player_id !== player.id) {
        next(Object.assign(new Error("session_not_found"), { status: 404 }));
        return;
      }

      const current = currentGuessQuestion(session);
      res.json({
        session_id: current.session.id,
        status: current.session.status,
        score: current.session.score,
        total_questions: current.session.total_questions,
        current_question: current.question ? guessQuestionPayload(current.question) : null,
      });
    },
  );

  app.post("/api/guess-player/answer", requirePlayer, (req, res, next) => {
    try {
      const player = (req as Request & { player: Player }).player;
      const sessionId = String(req.body?.session_id ?? "");
      const questionId = String(req.body?.question_id ?? "");
      const answer = String(req.body?.answer ?? "").trim();
      if (!sessionId) throw Object.assign(new Error("session_id_required"), { status: 400 });
      if (!questionId) throw Object.assign(new Error("question_id_required"), { status: 400 });
      if (!answer) throw Object.assign(new Error("answer_required"), { status: 400 });

      const session = guessSessions.get(sessionId);
      if (!session || session.player_id !== player.id) {
        throw Object.assign(new Error("session_not_found"), { status: 404 });
      }
      if (session.status !== "active") {
        throw Object.assign(new Error("session_not_active"), { status: 409 });
      }

      const questions = guessQuestions.get(sessionId) ?? [];
      const activeQuestion = questions.find((question) => !question.is_locked);
      if (!activeQuestion) {
        throw Object.assign(new Error("session_already_completed"), { status: 409 });
      }
      if (activeQuestion.id !== questionId) {
        throw Object.assign(new Error("question_not_active"), { status: 409 });
      }
      if (!activeQuestion.started_at) {
        throw Object.assign(new Error("question_not_started"), { status: 409 });
      }

      const footballer = getFootballerById(activeQuestion.footballer_id);
      if (!footballer) throw Object.assign(new Error("footballer_not_found"), { status: 500 });

      const elapsedMs = Date.now() - new Date(activeQuestion.started_at).getTime();
      const expired = elapsedMs > GUESS_PLAYER_TIME_LIMIT_MS;
      const isCorrect = !expired && isCorrectFootballerAnswer(footballer, answer);
      activeQuestion.answered_at = new Date().toISOString();
      activeQuestion.user_answer = answer;
      activeQuestion.is_correct = isCorrect;
      activeQuestion.is_locked = true;

      session.score = questions.filter((question) => question.is_correct).length;
      const nextQuestion = questions.find((question) => !question.is_locked) ?? null;
      if (nextQuestion) {
        nextQuestion.started_at = new Date().toISOString();
      } else {
        completeGuessSession(session);
      }

      res.json({
        session_id: session.id,
        status: session.status,
        is_correct: isCorrect,
        expired,
        correct_answer: footballer.name,
        score: session.score,
        total_questions: session.total_questions,
        current_question: nextQuestion ? guessQuestionPayload(nextQuestion) : null,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get(
    ["/api/guess-player/result", "/api/guess-player/session/:sessionId/result"],
    requirePlayer,
    (req, res, next) => {
      const player = (req as Request & { player: Player }).player;
      const sessionId = String(req.params.sessionId ?? req.query.session_id ?? "");
      const session = guessSessions.get(sessionId);
      if (!session || session.player_id !== player.id) {
        next(Object.assign(new Error("session_not_found"), { status: 404 }));
        return;
      }

      if (session.status === "active") currentGuessQuestion(session);
      res.json(guessResultPayload(session));
    },
  );

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

  function handleRocketState(req: Request, res: Response, next: NextFunction, attemptId: string) {
    const player = (req as Request & { player: Player }).player;
    const attempt = attemptId ? attempts.get(attemptId) : null;
    if (!attempt || attempt.player_id !== player.id) {
      next(Object.assign(new Error("attempt_not_found"), { status: 404 }));
      return;
    }
    res.json(statePayload(currentAttemptState(attempt)));
  }

  app.get("/api/rocket/state", requirePlayer, (req, res, next) => {
    const attemptId = Array.isArray(req.query.attempt_id)
      ? req.query.attempt_id[0]
      : req.query.attempt_id;
    handleRocketState(req, res, next, String(attemptId ?? ""));
  });

  app.get("/api/rocket/state/:attemptId", requirePlayer, (req, res, next) => {
    const attemptId = Array.isArray(req.params.attemptId)
      ? req.params.attemptId[0]
      : req.params.attemptId;
    handleRocketState(req, res, next, attemptId ?? "");
  });

  app.post("/api/rocket/cashout", requirePlayer, (req, res, next) => {
    try {
      const player = (req as Request & { player: Player }).player;
      const attemptId = String(req.body?.attempt_id ?? "");
      const requestedAt =
        typeof req.body?.cashout_requested_at === "string" ? req.body.cashout_requested_at : "";
      const attempt = attempts.get(attemptId);
      if (!attempt || attempt.player_id !== player.id) {
        throw Object.assign(new Error("attempt_not_found"), { status: 404 });
      }

      if (
        attempt.status === "playing" ||
        attempt.status === "crashed" ||
        attempt.status === "expired"
      ) {
        const effectiveMs = cashoutTimeMs(attempt, requestedAt);
        const elapsedMs = effectiveMs - new Date(attempt.started_at).getTime();
        const currentMultiplier = calculateMultiplier(elapsedMs);
        const endedAt = new Date(effectiveMs).toISOString();

        if (elapsedMs > MAX_PLAYING_MS) {
          attempt.status = "expired";
          attempt.score = 0;
          attempt.ended_at = endedAt;
        } else if (currentMultiplier >= attempt.crash_point) {
          attempt.status = "crashed";
          attempt.score = 0;
          attempt.ended_at = attempt.ended_at ?? endedAt;
        } else {
          attempt.status = "cashed_out";
          attempt.cashed_out_at = currentMultiplier;
          attempt.score = scoreForMultiplier(currentMultiplier);
          attempt.ended_at = endedAt;
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
    console.log(`EUREKA Juegos dev memory API listening on ${port}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startDevMemoryServer();
}
