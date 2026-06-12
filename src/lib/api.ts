/**
 * Eureka Rocket — Mock API layer.
 *
 * ⚠️ Todas estas funciones son PLACEHOLDERS visuales.
 * Más adelante se reemplazarán por llamadas reales al backend Node.js.
 * El frontend NUNCA debe decidir el crashPoint ni si el jugador ganó/perdió.
 * Esa lógica vive 100% en el servidor.
 */

export type AttemptStatus = "playing" | "cashed_out" | "exploded" | "invalid";

export interface PlayerStatus {
  id: string;
  name: string;
  attemptsUsed: number;
  attemptsLimit: number;
  bestScore: number;
  bestMultiplier: number;
}

export interface LeaderboardEntry {
  rank: number;
  player: string;
  phoneMasked: string;
  bestMultiplier: number;
  score: number;
  date: string;
}

export interface RocketAttempt {
  attemptId: string;
  status: AttemptStatus;
  multiplier?: number;
  score?: number;
  attemptsRemaining: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// TODO(backend): POST /api/rocket/start — el servidor decide el crashPoint.
export async function startRocketAttempt(): Promise<{ attemptId: string }> {
  await sleep(250);
  return { attemptId: `mock_${Date.now()}` };
}

// TODO(backend): POST /api/rocket/cashout — el servidor valida tiempo de retiro.
export async function cashOutRocketAttempt(
  attemptId: string,
  clientMultiplier: number,
): Promise<RocketAttempt> {
  await sleep(150);
  return {
    attemptId,
    status: "cashed_out",
    multiplier: clientMultiplier,
    score: Math.round(clientMultiplier * 100),
    attemptsRemaining: 2,
  };
}

// TODO(backend): GET /api/player/me
export async function getPlayerStatus(): Promise<PlayerStatus | null> {
  await sleep(120);
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("eureka_player");
  if (!raw) return null;
  const p = JSON.parse(raw);
  return {
    id: p.id ?? "mock",
    name: p.name ?? "Jugador",
    attemptsUsed: p.attemptsUsed ?? 0,
    attemptsLimit: 3,
    bestScore: p.bestScore ?? 0,
    bestMultiplier: p.bestMultiplier ?? 0,
  };
}

// TODO(backend): GET /api/leaderboard
export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  await sleep(200);
  return MOCK_LEADERBOARD;
}

const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, player: "Lucas Fernández", phoneMasked: "+595 ••• ••4521", bestMultiplier: 14.82, score: 1482, date: "2026-06-10" },
  { rank: 2, player: "María González", phoneMasked: "+595 ••• ••8830", bestMultiplier: 11.05, score: 1105, date: "2026-06-11" },
  { rank: 3, player: "Diego Ramírez", phoneMasked: "+595 ••• ••1190", bestMultiplier: 9.74, score: 974, date: "2026-06-09" },
  { rank: 4, player: "Sofía Acuña", phoneMasked: "+595 ••• ••7702", bestMultiplier: 8.31, score: 831, date: "2026-06-12" },
  { rank: 5, player: "Carlos Benítez", phoneMasked: "+595 ••• ••3344", bestMultiplier: 7.6, score: 760, date: "2026-06-08" },
  { rank: 6, player: "Ana Torres", phoneMasked: "+595 ••• ••5521", bestMultiplier: 6.92, score: 692, date: "2026-06-11" },
  { rank: 7, player: "Javier Núñez", phoneMasked: "+595 ••• ••9087", bestMultiplier: 5.45, score: 545, date: "2026-06-10" },
  { rank: 8, player: "Paola Méndez", phoneMasked: "+595 ••• ••2266", bestMultiplier: 4.88, score: 488, date: "2026-06-12" },
  { rank: 9, player: "Tomás Villalba", phoneMasked: "+595 ••• ••1010", bestMultiplier: 4.12, score: 412, date: "2026-06-09" },
  { rank: 10, player: "Laura Cáceres", phoneMasked: "+595 ••• ••6655", bestMultiplier: 3.74, score: 374, date: "2026-06-08" },
];

// ---- Mock admin datasets ----
export interface AdminParticipant {
  name: string; phone: string; document: string;
  attemptsUsed: number; bestScore: number;
  status: "active" | "blocked" | "completed"; registeredAt: string;
}
export interface AdminAttempt {
  player: string; attemptNumber: number;
  status: AttemptStatus; cashoutMultiplier: number | null;
  score: number; datetime: string;
}
export interface AdminSuspicious {
  player: string; alertType: string; ip: string; userAgent: string;
  date: string; status: "pending" | "reviewed" | "invalidated";
}

export const MOCK_PARTICIPANTS: AdminParticipant[] = [
  { name: "Lucas Fernández", phone: "+595981234521", document: "4.521.998", attemptsUsed: 3, bestScore: 1482, status: "completed", registeredAt: "2026-06-08 10:22" },
  { name: "María González", phone: "+595982118830", document: "5.118.220", attemptsUsed: 2, bestScore: 1105, status: "active", registeredAt: "2026-06-09 14:10" },
  { name: "Diego Ramírez", phone: "+595971991190", document: "3.991.110", attemptsUsed: 3, bestScore: 974, status: "completed", registeredAt: "2026-06-09 09:55" },
  { name: "Sofía Acuña", phone: "+595984447702", document: "6.220.331", attemptsUsed: 1, bestScore: 831, status: "active", registeredAt: "2026-06-10 18:40" },
  { name: "Cuenta Sospechosa", phone: "+595990000000", document: "0.000.001", attemptsUsed: 3, bestScore: 0, status: "blocked", registeredAt: "2026-06-11 02:14" },
  { name: "Carlos Benítez", phone: "+595981113344", document: "4.880.221", attemptsUsed: 2, bestScore: 760, status: "active", registeredAt: "2026-06-10 11:30" },
];

export const MOCK_ATTEMPTS: AdminAttempt[] = [
  { player: "Lucas Fernández", attemptNumber: 1, status: "cashed_out", cashoutMultiplier: 14.82, score: 1482, datetime: "2026-06-08 10:30" },
  { player: "Lucas Fernández", attemptNumber: 2, status: "exploded", cashoutMultiplier: null, score: 0, datetime: "2026-06-08 10:35" },
  { player: "María González", attemptNumber: 1, status: "cashed_out", cashoutMultiplier: 11.05, score: 1105, datetime: "2026-06-09 14:15" },
  { player: "Diego Ramírez", attemptNumber: 1, status: "exploded", cashoutMultiplier: null, score: 0, datetime: "2026-06-09 10:00" },
  { player: "Diego Ramírez", attemptNumber: 2, status: "cashed_out", cashoutMultiplier: 9.74, score: 974, datetime: "2026-06-09 10:08" },
  { player: "Cuenta Sospechosa", attemptNumber: 1, status: "invalid", cashoutMultiplier: null, score: 0, datetime: "2026-06-11 02:16" },
  { player: "Sofía Acuña", attemptNumber: 1, status: "playing", cashoutMultiplier: null, score: 0, datetime: "2026-06-12 19:02" },
];

export const MOCK_SUSPICIOUS: AdminSuspicious[] = [
  { player: "Cuenta Sospechosa", alertType: "Múltiples documentos misma IP", ip: "190.0.12.44", userAgent: "Mozilla/5.0 (Linux; Android 13)", date: "2026-06-11 02:18", status: "invalidated" },
  { player: "Anon #882", alertType: "Patrón de retiros automatizados", ip: "181.92.10.7", userAgent: "Headless Chrome/124", date: "2026-06-10 23:44", status: "pending" },
  { player: "Tomás Villalba", alertType: "Misma IP que otro participante", ip: "200.55.88.21", userAgent: "Safari iOS 17", date: "2026-06-09 16:20", status: "reviewed" },
];
