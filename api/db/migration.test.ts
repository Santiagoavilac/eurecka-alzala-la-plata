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

function readAllMigrations() {
  const dir = join(process.cwd(), "supabase", "migrations");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => readFileSync(join(dir, name), "utf8").toLowerCase())
    .join("\n");
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
  const allSql = readAllMigrations();

  assert.match(sql, /unique \(phone_normalized, document_normalized\)/);
  assert.match(allSql, /attempt_number between 1 and 5/);
  assert.match(sql, /status in \('playing', 'cashed_out', 'crashed', 'expired', 'invalidated'\)/);
});

test("cashout rpc locks the attempt row and uses database server time", () => {
  const sql = readAllMigrations();

  assert.match(sql, /create or replace function public\.cash_out_rocket_attempt/);
  assert.match(sql, /for update/);
  assert.match(sql, /clock_timestamp\(\)/);
  assert.match(sql, /p_cashout_requested_at/);
  assert.match(sql, /interval '1500 milliseconds'/);
  assert.doesNotMatch(sql, /math\.random/);
});

test("migration creates guess player session tables with locked answers", () => {
  const sql = readAllMigrations();

  for (const table of ["guess_player_sessions", "guess_player_session_questions"]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`));
  }

  assert.match(sql, /game_type text not null default 'guess_player'/);
  assert.match(sql, /status text not null default 'active'/);
  assert.match(sql, /question_order int not null/);
  assert.match(sql, /footballer_id text not null/);
  assert.match(sql, /user_answer text/);
  assert.match(sql, /is_correct boolean/);
  assert.match(sql, /is_locked boolean not null default false/);
});
