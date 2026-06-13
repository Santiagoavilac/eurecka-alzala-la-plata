alter table public.rocket_attempts
  drop constraint if exists rocket_attempts_attempt_number_check;

alter table public.rocket_attempts
  add constraint rocket_attempts_attempt_number_check
  check (attempt_number between 1 and 5);
