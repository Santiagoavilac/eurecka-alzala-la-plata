import assert from "node:assert/strict";
import test from "node:test";

import { classifySupabaseError, toPublicApiError } from "../../server/utils/rocket-api";

test("classifies missing players table errors", () => {
  assert.deepEqual(
    classifySupabaseError(
      { code: "PGRST205", message: "Could not find the table 'players' in the schema cache" },
      "select",
      "players",
    ),
    { statusCode: 500, code: "players_table_missing" },
  );
});

test("classifies missing rocket_attempts table errors", () => {
  assert.deepEqual(
    classifySupabaseError(
      { code: "42P01", message: 'relation "public.rocket_attempts" does not exist' },
      "select",
      "rocket_attempts",
    ),
    { statusCode: 500, code: "rocket_attempts_table_missing" },
  );
});

test("classifies player insert failures without exposing raw Supabase text", () => {
  assert.deepEqual(
    classifySupabaseError(
      { code: "23502", message: "null value violates not-null" },
      "insert",
      "players",
    ),
    { statusCode: 500, code: "supabase_insert_failed" },
  );
});

test("normalizes h3 public errors for JSON responses", () => {
  assert.deepEqual(
    toPublicApiError({
      statusCode: 500,
      statusMessage: "missing_env",
      data: { error: "missing_env" },
    }),
    { statusCode: 500, code: "missing_env" },
  );
});
