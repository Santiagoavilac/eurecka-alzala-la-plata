import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateMultiplier,
  crashPointFromSeed,
  generateSessionToken,
  hashSessionToken,
  maskPhone,
  normalizeDocument,
  normalizePhone,
  resolvePlayerIdentity,
  scoreForMultiplier,
  settleAttempt,
} from "./game";

test("normalizes phone and document to stable digit keys", () => {
  assert.equal(normalizePhone("+595 981 234-521"), "595981234521");
  assert.equal(normalizeDocument("4.521.998"), "4521998");
});

test("derives player identity without requiring document id", () => {
  assert.deepEqual(resolvePlayerIdentity({ phone: "+595 981 234 521" }), {
    phoneNormalized: "595981234521",
    documentId: "+595 981 234 521",
    documentNormalized: "595981234521",
  });

  assert.deepEqual(resolvePlayerIdentity({ phone: "+595 981 234 521", documentId: "4.521.998" }), {
    phoneNormalized: "595981234521",
    documentId: "4.521.998",
    documentNormalized: "4521998",
  });
});

test("hashes session tokens without storing the raw token", () => {
  const token = generateSessionToken();
  const hash = hashSessionToken(token);

  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, token);
  assert.equal(hashSessionToken(token), hash);
});

test("calculates multiplier and score from server elapsed time", () => {
  assert.equal(calculateMultiplier(0), 1);
  assert.equal(calculateMultiplier(1000), 1.79);
  assert.equal(scoreForMultiplier(3.456), 345);
});

test("derives a deterministic crash point from a secret seed", () => {
  const first = crashPointFromSeed("seed:player:attempt");
  const second = crashPointFromSeed("seed:player:attempt");

  assert.equal(first, second);
  assert.ok(first >= 1.1);
  assert.ok(first <= 16);
});

test("settles cashout using server time, not client multiplier", () => {
  const startedAt = new Date("2026-06-12T12:00:00.000Z");
  const now = new Date("2026-06-12T12:00:00.500Z");

  const result = settleAttempt({
    startedAt,
    now,
    crashPoint: 2,
  });

  assert.equal(result.status, "cashed_out");
  assert.equal(result.multiplier, calculateMultiplier(500));
  assert.equal(result.score, scoreForMultiplier(result.multiplier));
});

test("marks the attempt crashed when server multiplier reaches crash point", () => {
  const result = settleAttempt({
    startedAt: new Date("2026-06-12T12:00:00.000Z"),
    now: new Date("2026-06-12T12:00:00.500Z"),
    crashPoint: 1.05,
  });

  assert.equal(result.status, "crashed");
  assert.equal(result.score, 0);
});

test("masks phone numbers for leaderboard output", () => {
  assert.equal(maskPhone("+595 981 234 521"), "+595 *** **4521");
  assert.equal(maskPhone("123"), "***");
});
