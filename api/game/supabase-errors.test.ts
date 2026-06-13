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
    {
      statusCode: 500,
      code: "players_table_missing",
      operation: "select",
      target: "players",
      supabase_code: "PGRST205",
    },
  );
});

test("classifies missing rocket_attempts table errors", () => {
  assert.deepEqual(
    classifySupabaseError(
      { code: "42P01", message: 'relation "public.rocket_attempts" does not exist' },
      "select",
      "rocket_attempts",
    ),
    {
      statusCode: 500,
      code: "rocket_attempts_table_missing",
      operation: "select",
      target: "rocket_attempts",
      supabase_code: "42P01",
    },
  );
});

test("classifies invalid Supabase keys without exposing key material", () => {
  assert.deepEqual(
    classifySupabaseError(
      { code: "PGRST301", message: "JWT expired or invalid" },
      "select",
      "players",
    ),
    {
      statusCode: 500,
      code: "supabase_invalid_key",
      operation: "select",
      target: "players",
      supabase_code: "PGRST301",
    },
  );
});

test("classifies permission failures with operation and target", () => {
  assert.deepEqual(
    classifySupabaseError(
      { code: "42501", message: "permission denied for table players" },
      "select",
      "players",
    ),
    {
      statusCode: 500,
      code: "supabase_permission_denied",
      operation: "select",
      target: "players",
      supabase_code: "42501",
    },
  );
});

test("classifies fallback select failures by table", () => {
  assert.deepEqual(classifySupabaseError({ message: "network failed" }, "select", "players"), {
    statusCode: 500,
    code: "players_select_failed",
    operation: "select",
    target: "players",
    supabase_code: undefined,
  });

  assert.deepEqual(
    classifySupabaseError({ message: "network failed" }, "select", "rocket_attempts"),
    {
      statusCode: 500,
      code: "rocket_attempts_select_failed",
      operation: "select",
      target: "rocket_attempts",
      supabase_code: undefined,
    },
  );
});

test("classifies player insert failures without exposing raw Supabase text", () => {
  assert.deepEqual(
    classifySupabaseError(
      { code: "23502", message: "null value violates not-null" },
      "insert",
      "players",
    ),
    {
      statusCode: 500,
      code: "supabase_insert_failed",
      operation: "insert",
      target: "players",
      supabase_code: "23502",
    },
  );
});

test("normalizes h3 public errors for JSON responses", () => {
  assert.deepEqual(
    toPublicApiError({
      statusCode: 500,
      statusMessage: "missing_env",
      data: { error: "missing_env" },
    }),
    {
      statusCode: 500,
      code: "missing_env",
      operation: undefined,
      target: undefined,
      supabase_code: undefined,
    },
  );
});

test("keeps safe Supabase metadata in public error payloads", () => {
  assert.deepEqual(
    toPublicApiError({
      statusCode: 500,
      statusMessage: "players_select_failed",
      data: {
        error: "players_select_failed",
        operation: "select",
        target: "players",
        supabase_code: "PGRST301",
      },
    }),
    {
      statusCode: 500,
      code: "players_select_failed",
      operation: "select",
      target: "players",
      supabase_code: "PGRST301",
    },
  );
});
