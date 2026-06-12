/**
 * Mock player storage. TODO(backend): reemplazar por sesión real (JWT/cookie).
 */
export interface MockPlayer {
  id: string;
  name: string;
  phone: string;
  document: string;
  attemptsUsed: number;
  bestScore: number;
  bestMultiplier: number;
}

const KEY = "eureka_player";

export function getMockPlayer(): MockPlayer | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as MockPlayer) : null;
}

export function saveMockPlayer(p: Omit<MockPlayer, "id" | "attemptsUsed" | "bestScore" | "bestMultiplier">) {
  const player: MockPlayer = {
    id: `p_${Date.now()}`,
    attemptsUsed: 0,
    bestScore: 0,
    bestMultiplier: 0,
    ...p,
  };
  localStorage.setItem(KEY, JSON.stringify(player));
  return player;
}

export function updateMockPlayer(patch: Partial<MockPlayer>) {
  const cur = getMockPlayer();
  if (!cur) return null;
  const next = { ...cur, ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function clearMockPlayer() {
  localStorage.removeItem(KEY);
}
