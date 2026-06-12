create extension if not exists pgcrypto with schema extensions;

create table public.players (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  document_id text not null,
  phone_normalized text not null,
  document_normalized text not null,
  created_at timestamptz not null default now(),
  last_login_at timestamptz,
  status text not null default 'active',
  constraint players_phone_document_unique unique (phone_normalized, document_normalized),
  constraint players_status_check check (status in ('active', 'blocked'))
);

create table public.player_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  session_token_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ip_address text,
  user_agent text,
  revoked_at timestamptz
);

create table public.rocket_attempts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  attempt_number int not null,
  status text not null default 'playing',
  server_seed_hash text not null,
  server_seed text,
  crash_point numeric(10, 2) not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  cashed_out_at numeric(10, 2),
  score int not null default 0,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint rocket_attempts_player_attempt_unique unique (player_id, attempt_number),
  constraint rocket_attempts_attempt_number_check check (attempt_number between 1 and 3),
  constraint rocket_attempts_status_check check (status in ('playing', 'cashed_out', 'crashed', 'expired', 'invalidated')),
  constraint rocket_attempts_score_check check (score >= 0),
  constraint rocket_attempts_crash_point_check check (crash_point >= 1)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references public.players(id) on delete set null,
  action text not null,
  metadata jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create unique index rocket_attempts_one_playing_per_player_idx
  on public.rocket_attempts (player_id)
  where status = 'playing';

create unique index player_sessions_token_hash_idx
  on public.player_sessions (session_token_hash);

create index player_sessions_player_id_idx on public.player_sessions (player_id);
create index rocket_attempts_player_id_idx on public.rocket_attempts (player_id);
create index rocket_attempts_score_idx on public.rocket_attempts (score desc) where score > 0;
create index audit_logs_player_id_created_at_idx on public.audit_logs (player_id, created_at desc);
create index audit_logs_action_created_at_idx on public.audit_logs (action, created_at desc);

alter table public.players enable row level security;
alter table public.player_sessions enable row level security;
alter table public.rocket_attempts enable row level security;
alter table public.audit_logs enable row level security;

revoke all on table public.players from anon, authenticated;
revoke all on table public.player_sessions from anon, authenticated;
revoke all on table public.rocket_attempts from anon, authenticated;
revoke all on table public.audit_logs from anon, authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.players to service_role;
grant select, insert, update, delete on table public.player_sessions to service_role;
grant select, insert, update, delete on table public.rocket_attempts to service_role;
grant select, insert, update, delete on table public.audit_logs to service_role;

create or replace function public.cash_out_rocket_attempt(
  p_attempt_id uuid,
  p_player_id uuid
)
returns table (
  attempt_id uuid,
  status text,
  current_multiplier numeric,
  cashed_out_at numeric,
  score int,
  crash_point numeric,
  server_seed text,
  ended_at timestamptz
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_attempt public.rocket_attempts%rowtype;
  v_now timestamptz := clock_timestamp();
  v_elapsed_ms numeric;
  v_current_multiplier numeric(10, 2);
begin
  select *
    into v_attempt
  from public.rocket_attempts
  where id = p_attempt_id
    and player_id = p_player_id
  for update;

  if not found then
    raise exception 'attempt_not_found' using errcode = 'P0002';
  end if;

  if v_attempt.status <> 'playing' then
    attempt_id := v_attempt.id;
    status := v_attempt.status;
    current_multiplier := coalesce(v_attempt.cashed_out_at, 0);
    cashed_out_at := v_attempt.cashed_out_at;
    score := v_attempt.score;
    crash_point := v_attempt.crash_point;
    server_seed := v_attempt.server_seed;
    ended_at := v_attempt.ended_at;
    return next;
    return;
  end if;

  v_elapsed_ms := greatest(0, extract(epoch from (v_now - v_attempt.started_at)) * 1000);
  v_current_multiplier := round(power(1.06, (v_elapsed_ms / 1000) * 10)::numeric, 2);

  if v_current_multiplier >= v_attempt.crash_point then
    update public.rocket_attempts
       set status = 'crashed',
           score = 0,
           ended_at = v_now
     where id = v_attempt.id
     returning * into v_attempt;

    attempt_id := v_attempt.id;
    status := v_attempt.status;
    current_multiplier := v_current_multiplier;
    cashed_out_at := null;
    score := 0;
    crash_point := v_attempt.crash_point;
    server_seed := v_attempt.server_seed;
    ended_at := v_attempt.ended_at;
    return next;
    return;
  end if;

  update public.rocket_attempts
     set status = 'cashed_out',
         cashed_out_at = v_current_multiplier,
         score = floor(v_current_multiplier * 100)::int,
         ended_at = v_now
   where id = v_attempt.id
   returning * into v_attempt;

  attempt_id := v_attempt.id;
  status := v_attempt.status;
  current_multiplier := v_current_multiplier;
  cashed_out_at := v_attempt.cashed_out_at;
  score := v_attempt.score;
  crash_point := v_attempt.crash_point;
  server_seed := v_attempt.server_seed;
  ended_at := v_attempt.ended_at;
  return next;
end;
$$;

revoke all on function public.cash_out_rocket_attempt(uuid, uuid) from public;
revoke all on function public.cash_out_rocket_attempt(uuid, uuid) from anon, authenticated;
grant execute on function public.cash_out_rocket_attempt(uuid, uuid) to service_role;
