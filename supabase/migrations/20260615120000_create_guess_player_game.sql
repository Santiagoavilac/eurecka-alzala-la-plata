create table public.guess_player_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  game_type text not null default 'guess_player',
  status text not null default 'active',
  score int not null default 0,
  total_questions int not null default 5,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint guess_player_sessions_game_type_check check (game_type = 'guess_player'),
  constraint guess_player_sessions_status_check check (status in ('active', 'completed', 'expired')),
  constraint guess_player_sessions_score_check check (score >= 0 and score <= total_questions),
  constraint guess_player_sessions_total_questions_check check (total_questions = 5)
);

create table public.guess_player_session_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.guess_player_sessions(id) on delete cascade,
  footballer_id text not null,
  question_order int not null,
  club_hint text not null,
  country_hint text not null,
  position_hint text not null,
  started_at timestamptz,
  answered_at timestamptz,
  user_answer text,
  is_correct boolean,
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  constraint guess_player_session_questions_order_check check (question_order between 1 and 5),
  constraint guess_player_session_questions_unique_order unique (session_id, question_order),
  constraint guess_player_session_questions_unique_footballer unique (session_id, footballer_id)
);

create unique index guess_player_sessions_one_active_per_player_idx
  on public.guess_player_sessions (player_id)
  where status = 'active';

create index guess_player_sessions_player_id_created_at_idx
  on public.guess_player_sessions (player_id, created_at desc);

create index guess_player_session_questions_session_order_idx
  on public.guess_player_session_questions (session_id, question_order);

alter table public.guess_player_sessions enable row level security;
alter table public.guess_player_session_questions enable row level security;

revoke all on table public.guess_player_sessions from anon, authenticated;
revoke all on table public.guess_player_session_questions from anon, authenticated;

grant select, insert, update, delete on table public.guess_player_sessions to service_role;
grant select, insert, update, delete on table public.guess_player_session_questions to service_role;
