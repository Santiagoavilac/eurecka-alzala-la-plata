import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function readRocketMigration() {
  const dir = join(process.cwd(), "supabase", "migrations");
  const file = readdirSync(dir).find((name) => name.endsWith("_create_eureka_rocket_backend.sql"));
  assert.ok(file, "create_eureka_rocket_backend migration should exist");
  return readFileSync(join(dir, file), "utf8").toLowerCase();
}

test("migration creates required game tables with RLS enabled", () => {
  const sql = readRocketMigration();

  for (const table of ["players", "player_sessions", "rocket_attempts", "audit_logs"]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`));
  }
});

test("migration enforces player uniqueness, attempt limit, and valid statuses", () => {
  const sql = readRocketMigration();

  assert.match(sql, /unique \(phone_normalized, document_normalized\)/);
  assert.match(sql, /attempt_number between 1 and 3/);
  assert.match(sql, /status in \('playing', 'cashed_out', 'crashed', 'expired', 'invalidated'\)/);
});

test("cashout rpc locks the attempt row and uses database server time", () => {
  const sql = readRocketMigration();

  assert.match(sql, /create or replace function public\.cash_out_rocket_attempt/);
  assert.match(sql, /for update/);
  assert.match(sql, /clock_timestamp\(\)/);
  assert.doesNotMatch(sql, /math\.random/);
});
