const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? "http://localhost:4000/api" : "/api")
).replace(/\/$/, "");

const PLAYER_ID_STORAGE_KEY = "eureka_player_id";

export type AttemptStatus = "playing" | "cashed_out" | "crashed" | "expired" | "invalidated";

export interface PlayerStatus {
  id: string;
  name: string;
  phone: string;
  documentId: string;
  attemptsUsed: number;
  attemptsLimit: number;
  bestScore: number;
  bestMultiplier: number;
}

export interface LoginInput {
  fullName: string;
  phone: string;
  documentId?: string;
}

export interface LeaderboardEntry {
  rank: number;
  player: string;
  phoneMasked: string;
  bestMultiplier: number;
  score: number;
  date: string;
}

export interface StartRocketResponse {
  attemptId: string;
  attemptNumber: number;
  startedAt: string;
  serverSeedHash: string;
  attemptsRemaining: number;
}

export interface RocketState {
  attemptId: string;
  status: AttemptStatus;
  currentMultiplier?: number;
  cashedOutAt?: number | null;
  score?: number;
  crashPoint?: number;
  serverSeed?: string;
  endedAt?: string | null;
}

export interface RocketAttemptResult extends RocketState {
  attemptsUsed: number;
  attemptsLeft: number;
  bestScore: number;
  bestMultiplier: number;
}

export interface DataTableResponse<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  filters: Record<string, unknown>;
  sort: Record<string, unknown>;
}

export interface AdminParticipant {
  id: string;
  name: string;
  phone: string;
  document: string;
  attemptsUsed: number;
  bestScore: number;
  status: "active" | "blocked";
  registeredAt: string;
}

export interface AdminAttempt {
  id: string;
  player: string;
  attemptNumber: number;
  status: AttemptStatus;
  cashoutMultiplier: number | null;
  score: number;
  datetime: string;
}

export interface AdminAuditLog {
  player: string;
  action: string;
  ip: string;
  userAgent: string;
  date: string;
  status: "pending" | "reviewed" | "invalidated";
}

interface PlayerApiPayload {
  player: {
    id: string;
    full_name: string;
    phone: string;
    document_id: string;
  };
  attempts_used: number;
  best_score: number;
  best_multiplier: number;
}

interface StartRocketApiPayload {
  attempt_id: string;
  attempt_number: number;
  started_at: string;
  server_seed_hash: string;
  attempts_left_after_start: number;
}

interface RocketStateApiPayload {
  attempt_id: string;
  status: AttemptStatus;
  current_multiplier?: number;
  cashed_out_at?: number | null;
  score?: number;
  crash_point?: number;
  server_seed?: string;
  ended_at?: string | null;
}

interface RocketResultApiPayload extends RocketStateApiPayload {
  attempts_used: number;
  attempts_left: number;
  best_score: number;
  best_multiplier: number;
}

interface LeaderboardApiRow {
  rank: number;
  full_name: string;
  masked_phone: string;
  best_multiplier: number;
  best_score: number;
  created_at: string;
}

interface AdminPlayerApiRow {
  id: string;
  full_name: string;
  phone: string;
  document_id: string;
  attempts_used: number;
  best_score: number;
  status: "active" | "blocked";
  created_at: string;
}

interface AdminAttemptApiRow {
  id: string;
  player?: { full_name?: string } | null;
  attempt_number: number;
  status: AttemptStatus;
  cashout_multiplier: number | null;
  score: number;
  ended_at?: string | null;
  started_at?: string | null;
  created_at: string;
}

interface AdminAuditLogApiRow {
  player?: { full_name?: string } | null;
  action: string;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
}

class ApiClientError extends Error {
  status: number;
  operation?: string;
  target?: string;
  supabaseCode?: string;
  diagnostic?: Record<string, unknown>;

  constructor(
    status: number,
    message: string,
    details: {
      operation?: string;
      target?: string;
      supabase_code?: string;
      diagnostic?: Record<string, unknown>;
    } = {},
  ) {
    super(message);
    this.status = status;
    this.operation = details.operation;
    this.target = details.target;
    this.supabaseCode = details.supabase_code;
    this.diagnostic = details.diagnostic;
  }
}

export function apiErrorMessage(error: unknown, fallback = "api_error") {
  if (error instanceof ApiClientError) {
    const details = [
      error.operation ? `operation=${error.operation}` : null,
      error.target ? `target=${error.target}` : null,
      error.supabaseCode ? `supabase_code=${error.supabaseCode}` : null,
      error.diagnostic ? `diagnostic=${JSON.stringify(error.diagnostic)}` : null,
    ].filter(Boolean);
    return details.length ? `${error.message} (${details.join(", ")})` : error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function apiUrl(path: string) {
  return `${API_BASE_URL}/${path.replace(/^\/+/, "")}`;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      "content-type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      operation?: string;
      target?: string;
      supabase_code?: string;
      diagnostic?: Record<string, unknown>;
    } | null;
    throw new ApiClientError(response.status, body?.error ?? "api_error", {
      operation: body?.operation,
      target: body?.target,
      supabase_code: body?.supabase_code,
      diagnostic: body?.diagnostic,
    });
  }

  return (await response.json()) as T;
}

function mapPlayerPayload(payload: PlayerApiPayload): PlayerStatus {
  return {
    id: payload.player.id,
    name: payload.player.full_name,
    phone: payload.player.phone,
    documentId: payload.player.document_id,
    attemptsUsed: payload.attempts_used,
    attemptsLimit: 3,
    bestScore: payload.best_score,
    bestMultiplier: payload.best_multiplier,
  };
}

function getStoredPlayerId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(PLAYER_ID_STORAGE_KEY);
}

function setStoredPlayerId(playerId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PLAYER_ID_STORAGE_KEY, playerId);
}

function requireStoredPlayerId() {
  const playerId = getStoredPlayerId();
  if (!playerId) throw new ApiClientError(401, "player_id_missing");
  return playerId;
}

export async function loginPlayer(input: LoginInput): Promise<PlayerStatus> {
  const payload = await request<PlayerApiPayload>("player/login", {
    method: "POST",
    body: JSON.stringify({
      full_name: input.fullName,
      phone: input.phone,
      ...(input.documentId ? { document_id: input.documentId } : {}),
    }),
  });
  const player = mapPlayerPayload(payload);
  setStoredPlayerId(player.id);
  return player;
}

export async function getPlayerStatus(): Promise<PlayerStatus | null> {
  const playerId = getStoredPlayerId();
  if (!playerId) return null;

  try {
    const payload = await request<PlayerApiPayload>(
      `player/me?player_id=${encodeURIComponent(playerId)}`,
    );
    return mapPlayerPayload(payload);
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) return null;
    throw error;
  }
}

export async function startRocketAttempt(): Promise<StartRocketResponse> {
  const payload = await request<StartRocketApiPayload>("rocket/start", {
    method: "POST",
    body: JSON.stringify({ player_id: requireStoredPlayerId() }),
  });
  return {
    attemptId: payload.attempt_id,
    attemptNumber: payload.attempt_number,
    startedAt: payload.started_at,
    serverSeedHash: payload.server_seed_hash,
    attemptsRemaining: payload.attempts_left_after_start,
  };
}

export async function getRocketState(attemptId: string): Promise<RocketState> {
  const payload = await request<RocketStateApiPayload>(
    `rocket/state/${attemptId}?player_id=${encodeURIComponent(requireStoredPlayerId())}`,
  );
  return {
    attemptId: payload.attempt_id,
    status: payload.status,
    currentMultiplier: payload.current_multiplier,
    cashedOutAt: payload.cashed_out_at,
    score: payload.score,
    crashPoint: payload.crash_point,
    serverSeed: payload.server_seed,
    endedAt: payload.ended_at,
  };
}

export async function cashOutRocketAttempt(attemptId: string): Promise<RocketAttemptResult> {
  const payload = await request<RocketResultApiPayload>("rocket/cashout", {
    method: "POST",
    body: JSON.stringify({ attempt_id: attemptId, player_id: requireStoredPlayerId() }),
  });
  return {
    attemptId: payload.attempt_id,
    status: payload.status,
    currentMultiplier: payload.current_multiplier,
    cashedOutAt: payload.cashed_out_at,
    score: payload.score,
    crashPoint: payload.crash_point,
    serverSeed: payload.server_seed,
    endedAt: payload.ended_at,
    attemptsUsed: payload.attempts_used,
    attemptsLeft: payload.attempts_left,
    bestScore: payload.best_score,
    bestMultiplier: payload.best_multiplier,
  };
}

export async function getLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
  const rows = await request<LeaderboardApiRow[]>(`leaderboard?limit=${limit}`);
  return rows.map((row) => ({
    rank: row.rank,
    player: row.full_name,
    phoneMasked: row.masked_phone,
    bestMultiplier: row.best_multiplier,
    score: row.best_score,
    date: row.created_at,
  }));
}

export async function adminLogin(pin: string): Promise<void> {
  await request<{ ok: true }>("admin/login", {
    method: "POST",
    body: JSON.stringify({ pin }),
  });
}

export async function getAdminPlayers(): Promise<AdminParticipant[]> {
  const payload = await request<DataTableResponse<AdminPlayerApiRow>>("admin/players?pageSize=100");
  return payload.rows.map((row) => ({
    id: row.id,
    name: row.full_name,
    phone: row.phone,
    document: row.document_id,
    attemptsUsed: row.attempts_used,
    bestScore: row.best_score,
    status: row.status,
    registeredAt: row.created_at,
  }));
}

export async function getAdminAttempts(): Promise<AdminAttempt[]> {
  const payload = await request<DataTableResponse<AdminAttemptApiRow>>(
    "admin/attempts?pageSize=100",
  );
  return payload.rows.map((row) => ({
    id: row.id,
    player: row.player?.full_name ?? "Jugador",
    attemptNumber: row.attempt_number,
    status: row.status,
    cashoutMultiplier: row.cashout_multiplier,
    score: row.score,
    datetime: row.ended_at ?? row.started_at ?? row.created_at,
  }));
}

export async function getAdminLeaderboard(): Promise<LeaderboardEntry[]> {
  const payload = await request<DataTableResponse<LeaderboardApiRow>>(
    "admin/leaderboard?pageSize=50",
  );
  return payload.rows.map((row) => ({
    rank: row.rank,
    player: row.full_name,
    phoneMasked: row.masked_phone,
    bestMultiplier: row.best_multiplier,
    score: row.best_score,
    date: row.created_at,
  }));
}

export async function getAdminAuditLogs(): Promise<AdminAuditLog[]> {
  const payload = await request<DataTableResponse<AdminAuditLogApiRow>>(
    "admin/audit-logs?pageSize=100",
  );
  return payload.rows.map((row) => ({
    player: row.player?.full_name ?? "Sistema",
    action: row.action,
    ip: row.ip_address ?? "",
    userAgent: row.user_agent ?? "",
    date: row.created_at,
    status: row.action.includes("invalidate")
      ? "invalidated"
      : row.action.includes("suspicious")
        ? "pending"
        : "reviewed",
  }));
}

export async function invalidateAttempt(attemptId: string, reason: string): Promise<void> {
  await request("admin/invalidate-attempt", {
    method: "POST",
    body: JSON.stringify({ attempt_id: attemptId, reason }),
  });
}
