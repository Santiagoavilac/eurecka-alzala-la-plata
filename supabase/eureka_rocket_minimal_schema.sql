create extension if not exists pgcrypto with schema extensions;

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  document_id text not null,
  phone_normalized text not null,
  document_normalized text not null,
  created_at timestamptz not null default now(),
  last_login_at timestamptz,
  status text not null default 'active'
);

alter table public.players add column if not exists full_name text not null default '';
alter table public.players add column if not exists phone text not null default '';
alter table public.players add column if not exists document_id text not null default '';
alter table public.players add column if not exists phone_normalized text not null default '';
alter table public.players add column if not exists document_normalized text not null default '';
alter table public.players add column if not exists created_at timestamptz not null default now();
alter table public.players add column if not exists last_login_at timestamptz;
alter table public.players add column if not exists status text not null default 'active';
alter table public.players alter column full_name drop default;
alter table public.players alter column phone drop default;
alter table public.players alter column document_id drop default;
alter table public.players alter column phone_normalized drop default;
alter table public.players alter column document_normalized drop default;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'players_phone_document_unique'
      and conrelid = 'public.players'::regclass
  ) then
    alter table public.players
      add constraint players_phone_document_unique
      unique (phone_normalized, document_normalized);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'players_status_check'
      and conrelid = 'public.players'::regclass
  ) then
    alter table public.players
      add constraint players_status_check
      check (status in ('active', 'blocked'));
  end if;
end $$;

create table if not exists public.rocket_attempts (
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
  created_at timestamptz not null default now()
);

alter table public.rocket_attempts add column if not exists player_id uuid;
alter table public.rocket_attempts add column if not exists attempt_number int;
alter table public.rocket_attempts add column if not exists status text not null default 'playing';
alter table public.rocket_attempts add column if not exists server_seed_hash text;
alter table public.rocket_attempts add column if not exists server_seed text;
alter table public.rocket_attempts add column if not exists crash_point numeric(10, 2);
alter table public.rocket_attempts add column if not exists started_at timestamptz;
alter table public.rocket_attempts add column if not exists ended_at timestamptz;
alter table public.rocket_attempts add column if not exists cashed_out_at numeric(10, 2);
alter table public.rocket_attempts add column if not exists score int not null default 0;
alter table public.rocket_attempts add column if not exists ip_address text;
alter table public.rocket_attempts add column if not exists user_agent text;
alter table public.rocket_attempts add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'rocket_attempts_player_id_fkey'
      and conrelid = 'public.rocket_attempts'::regclass
  ) then
    alter table public.rocket_attempts
      add constraint rocket_attempts_player_id_fkey
      foreign key (player_id) references public.players(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'rocket_attempts_player_attempt_unique'
      and conrelid = 'public.rocket_attempts'::regclass
  ) then
    alter table public.rocket_attempts
      add constraint rocket_attempts_player_attempt_unique
      unique (player_id, attempt_number);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'rocket_attempts_attempt_number_check'
      and conrelid = 'public.rocket_attempts'::regclass
  ) then
    alter table public.rocket_attempts
      add constraint rocket_attempts_attempt_number_check
      check (attempt_number between 1 and 3);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'rocket_attempts_status_check'
      and conrelid = 'public.rocket_attempts'::regclass
  ) then
    alter table public.rocket_attempts
      add constraint rocket_attempts_status_check
      check (status in ('playing', 'cashed_out', 'crashed', 'expired', 'invalidated'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'rocket_attempts_score_check'
      and conrelid = 'public.rocket_attempts'::regclass
  ) then
    alter table public.rocket_attempts
      add constraint rocket_attempts_score_check check (score >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'rocket_attempts_crash_point_check'
      and conrelid = 'public.rocket_attempts'::regclass
  ) then
    alter table public.rocket_attempts
      add constraint rocket_attempts_crash_point_check check (crash_point >= 1);
  end if;
end $$;

create unique index if not exists rocket_attempts_one_playing_per_player_idx
  on public.rocket_attempts (player_id)
  where status = 'playing';

create index if not exists rocket_attempts_player_id_idx
  on public.rocket_attempts (player_id);

create index if not exists rocket_attempts_score_idx
  on public.rocket_attempts (score desc)
  where score > 0;

alter table public.players enable row level security;
alter table public.rocket_attempts enable row level security;

revoke all on table public.players from anon, authenticated;
revoke all on table public.rocket_attempts from anon, authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.players to service_role;
grant select, insert, update, delete on table public.rocket_attempts to service_role;

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
