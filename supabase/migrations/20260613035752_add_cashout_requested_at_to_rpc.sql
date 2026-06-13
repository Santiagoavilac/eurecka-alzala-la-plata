drop function if exists public.cash_out_rocket_attempt(uuid, uuid);

create or replace function public.cash_out_rocket_attempt(
  p_attempt_id uuid,
  p_player_id uuid,
  p_cashout_requested_at timestamptz default null
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
  v_effective_at timestamptz;
  v_elapsed_ms numeric;
  v_current_multiplier numeric(10, 2);
  v_backdate_limit interval := interval '1500 milliseconds';
  v_future_leeway interval := interval '250 milliseconds';
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

  if p_cashout_requested_at is null then
    v_effective_at := v_now;
  elsif p_cashout_requested_at > v_now + v_future_leeway then
    v_effective_at := v_now;
  else
    v_effective_at := least(v_now, greatest(p_cashout_requested_at, v_now - v_backdate_limit));
  end if;

  v_effective_at := greatest(v_effective_at, v_attempt.started_at);
  v_elapsed_ms := greatest(0, extract(epoch from (v_effective_at - v_attempt.started_at)) * 1000);
  v_current_multiplier := round(power(1.06, (v_elapsed_ms / 1000) * 10)::numeric, 2);

  if v_attempt.status in ('cashed_out', 'invalidated') then
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

  if v_attempt.status not in ('playing', 'crashed', 'expired') then
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

  if v_elapsed_ms > 120000 then
    update public.rocket_attempts
       set status = 'expired',
           score = 0,
           ended_at = v_effective_at
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

  if v_current_multiplier >= v_attempt.crash_point then
    update public.rocket_attempts
       set status = 'crashed',
           score = 0,
           ended_at = coalesce(v_attempt.ended_at, v_effective_at)
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
         ended_at = v_effective_at
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

revoke all on function public.cash_out_rocket_attempt(uuid, uuid, timestamptz) from public;
revoke all on function public.cash_out_rocket_attempt(uuid, uuid, timestamptz) from anon, authenticated;
grant execute on function public.cash_out_rocket_attempt(uuid, uuid, timestamptz) to service_role;
