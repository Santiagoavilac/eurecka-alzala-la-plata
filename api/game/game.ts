import { createHash, randomBytes } from "node:crypto";

export type AttemptTerminalStatus = "cashed_out" | "crashed";

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function normalizeDocument(documentId: string): string {
  return documentId.replace(/\D/g, "");
}

export function resolvePlayerIdentity({
  phone,
  documentId,
}: {
  phone: string;
  documentId?: string;
}): { phoneNormalized: string; documentId: string; documentNormalized: string } {
  const phoneNormalized = normalizePhone(phone);
  const resolvedDocumentId = documentId?.trim() || phone;
  const documentNormalized = documentId?.trim() ? normalizeDocument(documentId) : phoneNormalized;

  return {
    phoneNormalized,
    documentId: resolvedDocumentId,
    documentNormalized,
  };
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateServerSeed(): string {
  return randomBytes(32).toString("hex");
}

export function hashServerSeed(seed: string): string {
  return createHash("sha256").update(seed, "utf8").digest("hex");
}

export function calculateMultiplier(elapsedMs: number): number {
  const seconds = Math.max(0, elapsedMs) / 1000;
  const multiplier = Math.pow(1.06, seconds * 10);
  return Math.max(1, Math.round(multiplier * 100) / 100);
}

export function scoreForMultiplier(multiplier: number): number {
  return Math.floor(multiplier * 100);
}

export function crashPointFromSeed(seed: string): number {
  const hash = createHash("sha256").update(seed, "utf8").digest();
  const value = hash.readUInt32BE(0) / 0xffffffff;
  const crashPoint = 1.1 + value * 14.9;
  return Math.round(crashPoint * 100) / 100;
}

export function settleAttempt({
  startedAt,
  now,
  crashPoint,
}: {
  startedAt: Date;
  now: Date;
  crashPoint: number;
}): { status: AttemptTerminalStatus; multiplier: number; score: number } {
  const multiplier = calculateMultiplier(now.getTime() - startedAt.getTime());
  if (multiplier >= crashPoint) {
    return { status: "crashed", multiplier, score: 0 };
  }
  return { status: "cashed_out", multiplier, score: scoreForMultiplier(multiplier) };
}

export function maskPhone(phone: string): string {
  const trimmed = phone.trim();
  const digits = normalizePhone(trimmed);
  if (digits.length < 4) return "***";

  const suffix = digits.slice(-4);
  const prefixMatch = trimmed.match(/^\+\d{1,4}/);
  const prefix = prefixMatch?.[0] ?? "";

  if (prefix) return `${prefix} *** **${suffix}`;
  return `*** **${suffix}`;
}
