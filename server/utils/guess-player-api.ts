import { createError } from "h3";

import {
  GUESS_PLAYER_QUESTION_COUNT,
  GUESS_PLAYER_TIME_LIMIT_SECONDS,
  getFootballerById,
  isCorrectFootballerAnswer,
  selectGuessPlayerQuestions,
} from "../../api/game/guess-player";
import { db, getPlayer, requireString } from "./rocket-api";

const GUESS_PLAYER_TIME_LIMIT_MS = GUESS_PLAYER_TIME_LIMIT_SECONDS * 1000;

type SupabaseResult = {
  data?: unknown;
  error?: unknown;
};

type SupabaseQuery = PromiseLike<SupabaseResult> &
  SupabaseResult & {
    select: (...args: unknown[]) => SupabaseQuery;
    eq: (...args: unknown[]) => SupabaseQuery;
    order: (...args: unknown[]) => SupabaseQuery;
    limit: (...args: unknown[]) => SupabaseQuery;
    maybeSingle: () => SupabaseQuery;
    single: () => SupabaseQuery;
    insert: (value: unknown) => SupabaseQuery;
    update: (value: unknown) => SupabaseQuery;
  };

type GuessPlayerDb = {
  from: (table: string) => SupabaseQuery;
};

type GuessPlayerSession = {
  id: string;
  player_id: string;
  game_type: "guess_player";
  status: "active" | "completed" | "expired";
  score: number;
  total_questions: number;
  started_at: string;
  completed_at: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

type GuessPlayerQuestion = {
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

function client() {
  return db() as unknown as GuessPlayerDb;
}

function questionPayload(question: GuessPlayerQuestion) {
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

async function sessionForPlayer(sessionId: string, playerId: string) {
  const result = await client()
    .from("guess_player_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("player_id", playerId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data as GuessPlayerSession | null;
}

async function questionsForSession(sessionId: string) {
  const result = await client()
    .from("guess_player_session_questions")
    .select("*")
    .eq("session_id", sessionId)
    .order("question_order", { ascending: true });
  if (result.error) throw result.error;
  return (result.data ?? []) as GuessPlayerQuestion[];
}

async function completeSession(sessionId: string) {
  const questions = await questionsForSession(sessionId);
  const score = questions.filter((question) => question.is_correct).length;
  const result = await client()
    .from("guess_player_sessions")
    .update({
      status: "completed",
      score,
      completed_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .select("*")
    .single();
  if (result.error) throw result.error;
  return result.data as GuessPlayerSession;
}

async function lockExpiredQuestion(question: GuessPlayerQuestion) {
  const result = await client()
    .from("guess_player_session_questions")
    .update({
      answered_at: new Date().toISOString(),
      user_answer: null,
      is_correct: false,
      is_locked: true,
    })
    .eq("id", question.id)
    .eq("is_locked", false)
    .select("*")
    .maybeSingle();
  if (result.error) throw result.error;
}

async function currentQuestion(session: GuessPlayerSession) {
  let questions = await questionsForSession(session.id);

  while (true) {
    const current = questions.find((question) => !question.is_locked);
    if (!current) return { session: await completeSession(session.id), question: null };

    if (!current.started_at) {
      const result = await client()
        .from("guess_player_session_questions")
        .update({ started_at: new Date().toISOString() })
        .eq("id", current.id)
        .select("*")
        .single();
      if (result.error) throw result.error;
      return { session, question: result.data as GuessPlayerQuestion };
    }

    const elapsedMs = Date.now() - new Date(current.started_at).getTime();
    if (elapsedMs <= GUESS_PLAYER_TIME_LIMIT_MS) return { session, question: current };

    await lockExpiredQuestion(current);
    questions = await questionsForSession(session.id);
  }
}

function statePayload(session: GuessPlayerSession, question: GuessPlayerQuestion | null) {
  return {
    session_id: session.id,
    status: session.status,
    score: session.score,
    total_questions: session.total_questions,
    current_question: question ? questionPayload(question) : null,
  };
}

export async function startGuessPlayerSession(playerId: string) {
  const player = await getPlayer(playerId);
  const active = await client()
    .from("guess_player_sessions")
    .select("*")
    .eq("player_id", player.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (active.error) throw active.error;

  let session = active.data as GuessPlayerSession | null;
  if (!session) {
    const created = await client()
      .from("guess_player_sessions")
      .insert({
        player_id: player.id,
        game_type: "guess_player",
        status: "active",
        score: 0,
        total_questions: GUESS_PLAYER_QUESTION_COUNT,
        started_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (created.error) throw created.error;
    session = created.data as GuessPlayerSession;

    const questions = selectGuessPlayerQuestions(player.id, session.id).map(
      (footballer, index) => ({
        session_id: session!.id,
        footballer_id: footballer.id,
        question_order: index + 1,
        club_hint: footballer.club,
        country_hint: footballer.country,
        position_hint: footballer.position,
        started_at: index === 0 ? session!.started_at : null,
      }),
    );
    const inserted = await client().from("guess_player_session_questions").insert(questions);
    if (inserted.error) throw inserted.error;
  }

  const current = await currentQuestion(session);
  return statePayload(current.session, current.question);
}

export async function getGuessPlayerCurrent(sessionId: string, playerId: string) {
  const session = await sessionForPlayer(sessionId, playerId);
  if (!session) throw createError({ statusCode: 404, statusMessage: "session_not_found" });
  const current = await currentQuestion(session);
  return statePayload(current.session, current.question);
}

export async function submitGuessPlayerAnswer(body: Record<string, unknown>) {
  const playerId = requireString(body?.player_id, "player_id");
  const sessionId = requireString(body?.session_id, "session_id");
  const questionId = requireString(body?.question_id, "question_id");
  const answer = requireString(body?.answer, "answer");
  const session = await sessionForPlayer(sessionId, playerId);
  if (!session) throw createError({ statusCode: 404, statusMessage: "session_not_found" });
  if (session.status !== "active") {
    throw createError({ statusCode: 409, statusMessage: "session_not_active" });
  }

  const questions = await questionsForSession(sessionId);
  const active = questions.find((question) => !question.is_locked);
  if (!active) throw createError({ statusCode: 409, statusMessage: "session_already_completed" });
  if (active.id !== questionId) {
    throw createError({ statusCode: 409, statusMessage: "question_not_active" });
  }
  if (!active.started_at) {
    throw createError({ statusCode: 409, statusMessage: "question_not_started" });
  }

  const footballer = getFootballerById(active.footballer_id);
  if (!footballer) throw createError({ statusCode: 500, statusMessage: "footballer_not_found" });
  const elapsedMs = Date.now() - new Date(active.started_at).getTime();
  const expired = elapsedMs > GUESS_PLAYER_TIME_LIMIT_MS;
  const isCorrect = !expired && isCorrectFootballerAnswer(footballer, answer);

  const update = await client()
    .from("guess_player_session_questions")
    .update({
      answered_at: new Date().toISOString(),
      user_answer: answer,
      is_correct: isCorrect,
      is_locked: true,
    })
    .eq("id", questionId)
    .eq("session_id", sessionId)
    .eq("is_locked", false)
    .select("*")
    .maybeSingle();
  if (update.error) throw update.error;
  if (!update.data)
    throw createError({ statusCode: 409, statusMessage: "question_already_locked" });

  const nextQuestions = await questionsForSession(sessionId);
  const score = nextQuestions.filter((question) => question.is_correct).length;
  const allLocked = nextQuestions.every((question) => question.is_locked);
  let nextQuestion: GuessPlayerQuestion | null = null;
  let nextSession = session;

  if (allLocked) {
    nextSession = await completeSession(sessionId);
  } else {
    const next = nextQuestions.find((question) => !question.is_locked) ?? null;
    if (next) {
      const started = await client()
        .from("guess_player_session_questions")
        .update({ started_at: new Date().toISOString() })
        .eq("id", next.id)
        .select("*")
        .single();
      if (started.error) throw started.error;
      nextQuestion = started.data as GuessPlayerQuestion;
    }

    const updatedSession = await client()
      .from("guess_player_sessions")
      .update({ score })
      .eq("id", sessionId)
      .select("*")
      .single();
    if (updatedSession.error) throw updatedSession.error;
    nextSession = updatedSession.data as GuessPlayerSession;
  }

  return {
    ...statePayload(nextSession, nextQuestion),
    is_correct: isCorrect,
    expired,
    correct_answer: footballer.name,
  };
}

export async function getGuessPlayerResult(sessionId: string, playerId: string) {
  const session = await sessionForPlayer(sessionId, playerId);
  if (!session) throw createError({ statusCode: 404, statusMessage: "session_not_found" });
  const current = session.status === "active" ? (await currentQuestion(session)).session : session;
  const questions = await questionsForSession(sessionId);
  return {
    session_id: current.id,
    status: current.status,
    score: current.score,
    correct_answers: current.score,
    total_questions: current.total_questions,
    started_at: current.started_at,
    completed_at: current.completed_at,
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
