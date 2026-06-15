import assert from "node:assert/strict";
import test from "node:test";

import {
  GUESS_PLAYER_QUESTION_COUNT,
  findFootballerByAnswer,
  footballers,
  normalizeAnswer,
  selectGuessPlayerQuestions,
} from "./guess-player";

test("normalizes answer text for lenient comparisons", () => {
  assert.equal(normalizeAnswer("  Kylian  Mbappé "), "kylian mbappe");
  assert.equal(normalizeAnswer("N'Golo-Kanté"), "ngolo kante");
  assert.equal(normalizeAnswer("Unai   Simón"), "unai simon");
});

test("accepts known aliases and accent-free names", () => {
  assert.equal(findFootballerByAnswer("mbappe")?.name, "Kylian Mbappé");
  assert.equal(findFootballerByAnswer("rodri")?.name, "Rodrigo Hernández");
  assert.equal(findFootballerByAnswer("gavi")?.name, "Pablo Páez Gavi");
  assert.equal(findFootballerByAnswer("unai simon")?.name, "Unai Simón");
  assert.equal(findFootballerByAnswer("dibu martinez")?.name, "Emiliano Martínez");
  assert.equal(findFootballerByAnswer("messi")?.name, "Lionel Messi");
});

test("rejects vague ambiguous answers", () => {
  assert.equal(findFootballerByAnswer("martinez"), null);
  assert.equal(findFootballerByAnswer("garcia"), null);
});

test("selects five unique questions", () => {
  const selected = selectGuessPlayerQuestions("player-1", "session-1");
  assert.equal(selected.length, GUESS_PLAYER_QUESTION_COUNT);
  assert.equal(new Set(selected.map((item) => item.id)).size, GUESS_PLAYER_QUESTION_COUNT);
  assert.ok(selected.every((item) => footballers.some((footballer) => footballer.id === item.id)));
});
