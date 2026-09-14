-- v0.5 Classroom safety controls
-- Adds pause/resume, current-turn restart, and host skip while preserving the exact-three-character rule.

alter table public.game_runs
  add column if not exists paused_remaining_ms integer null
  check (paused_remaining_ms is null or paused_remaining_ms >= 0);

create or replace function public.pause_game(
  p_game_id uuid,
  p_expected_version bigint
)
returns public.game_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.game_runs;
  now_ts timestamptz := now();
  remaining_ms integer;
begin
  select * into g
  from public.game_runs
  where id = p_game_id
  for update;

  if g.id is null then raise exception 'GAME_NOT_FOUND'; end if;
  if not public.is_session_host(g.session_id) then raise exception 'HOST_ONLY'; end if;
  if g.phase not in ('playing', 'ending') then raise exception 'INVALID_PHASE'; end if;
  if g.version <> p_expected_version then raise exception 'STALE_GAME_VERSION'; end if;
  if g.is_paused then raise exception 'GAME_ALREADY_PAUSED'; end if;
  if g.turn_started_at is null or now_ts < g.turn_started_at then raise exception 'TURN_NOT_STARTED'; end if;
  if g.turn_deadline_at is null or now_ts >= g.turn_deadline_at then raise exception 'TURN_EXPIRED'; end if;

  remaining_ms := greatest(
    0,
    ceil(extract(epoch from (g.turn_deadline_at - now_ts)) * 1000)::integer
  );

  update public.game_runs
  set is_paused = true,
      paused_remaining_ms = remaining_ms,
      turn_started_at = null,
      turn_deadline_at = null,
      version = version + 1,
      updated_at = now_ts
  where id = g.id
  returning * into g;

  return g;
end;
$$;

create or replace function public.resume_game(
  p_game_id uuid,
  p_expected_version bigint
)
returns public.game_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.game_runs;
  now_ts timestamptz := now();
  remaining_ms integer;
begin
  select * into g
  from public.game_runs
  where id = p_game_id
  for update;

  if g.id is null then raise exception 'GAME_NOT_FOUND'; end if;
  if not public.is_session_host(g.session_id) then raise exception 'HOST_ONLY'; end if;
  if g.phase not in ('playing', 'ending') then raise exception 'INVALID_PHASE'; end if;
  if g.version <> p_expected_version then raise exception 'STALE_GAME_VERSION'; end if;
  if not g.is_paused then raise exception 'GAME_NOT_PAUSED'; end if;

  remaining_ms := greatest(coalesce(g.paused_remaining_ms, g.timer_duration_ms), 250);

  update public.game_runs
  set is_paused = false,
      paused_remaining_ms = null,
      turn_started_at = now_ts,
      turn_deadline_at = now_ts + make_interval(secs => remaining_ms / 1000.0),
      version = version + 1,
      updated_at = now_ts
  where id = g.id
  returning * into g;

  return g;
end;
$$;

create or replace function public.restart_current_turn(
  p_game_id uuid,
  p_expected_version bigint
)
returns public.game_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.game_runs;
  now_ts timestamptz := now();
begin
  select * into g
  from public.game_runs
  where id = p_game_id
  for update;

  if g.id is null then raise exception 'GAME_NOT_FOUND'; end if;
  if not public.is_session_host(g.session_id) then raise exception 'HOST_ONLY'; end if;
  if g.phase not in ('playing', 'ending') then raise exception 'INVALID_PHASE'; end if;
  if g.version <> p_expected_version then raise exception 'STALE_GAME_VERSION'; end if;

  update public.game_runs
  set is_paused = false,
      paused_remaining_ms = null,
      turn_started_at = now_ts + make_interval(secs => start_countdown_ms / 1000.0),
      turn_deadline_at = now_ts + make_interval(secs => (start_countdown_ms + timer_duration_ms) / 1000.0),
      version = version + 1,
      updated_at = now_ts
  where id = g.id
  returning * into g;

  return g;
end;
$$;

create or replace function public.skip_current_turn(
  p_game_id uuid,
  p_expected_version bigint
)
returns public.game_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.game_runs;
  m public.session_memberships;
  now_ts timestamptz := now();
  turn_no integer;
  lap_no integer;
  player_order_no integer;
  new_completed integer;
  next_lap integer;
  next_remaining integer;
  turn_phase_value public.turn_phase;
begin
  select * into g
  from public.game_runs
  where id = p_game_id
  for update;

  if g.id is null then raise exception 'GAME_NOT_FOUND'; end if;
  if not public.is_session_host(g.session_id) then raise exception 'HOST_ONLY'; end if;
  if g.phase not in ('playing', 'ending') then raise exception 'INVALID_PHASE'; end if;
  if g.version <> p_expected_version then raise exception 'STALE_GAME_VERSION'; end if;

  turn_no := g.completed_turns + 1;
  lap_no := floor(g.completed_turns::numeric / g.player_count_snapshot)::integer + 1;
  player_order_no := (g.completed_turns % g.player_count_snapshot) + 1;

  select * into m
  from public.session_memberships
  where session_id = g.session_id
    and team_id = g.team_id
    and role = 'player'
    and player_order = player_order_no
  limit 1;

  turn_phase_value := case when g.phase = 'ending' then 'ending'::public.turn_phase else 'normal'::public.turn_phase end;

  insert into public.turns (
    game_run_id, turn_number, lap_number, player_order, player_membership_id,
    phase, outcome, raw_text, effective_char_count, context_before, context_after, submitted_at
  ) values (
    g.id, turn_no, lap_no, player_order_no, m.id,
    turn_phase_value, 'skipped', null, 0, g.generated_text, g.generated_text, now_ts
  );

  new_completed := g.completed_turns + 1;

  if g.phase = 'ending' then
    next_remaining := greatest(coalesce(g.remaining_ending_turns, g.player_count_snapshot) - 1, 0);

    if next_remaining = 0 then
      update public.game_runs
      set completed_turns = new_completed,
          remaining_ending_turns = 0,
          phase = 'result',
          turn_started_at = null,
          turn_deadline_at = null,
          is_paused = false,
          paused_remaining_ms = null,
          finished_at = now_ts,
          result_revealed = false,
          version = version + 1,
          updated_at = now_ts
      where id = g.id
      returning * into g;
      return g;
    end if;

    update public.game_runs
    set completed_turns = new_completed,
        remaining_ending_turns = next_remaining,
        is_paused = false,
        paused_remaining_ms = null,
        turn_started_at = now_ts,
        turn_deadline_at = now_ts + make_interval(secs => timer_duration_ms / 1000.0),
        version = version + 1,
        updated_at = now_ts
    where id = g.id
    returning * into g;
    return g;
  end if;

  next_lap := floor(new_completed::numeric / g.player_count_snapshot)::integer + 1;

  if next_lap >= g.ending_lap_snapshot then
    update public.game_runs
    set completed_turns = new_completed,
        phase = 'ending_notice',
        remaining_ending_turns = player_count_snapshot,
        is_paused = false,
        paused_remaining_ms = null,
        turn_started_at = null,
        turn_deadline_at = null,
        version = version + 1,
        updated_at = now_ts
    where id = g.id
    returning * into g;
    return g;
  end if;

  update public.game_runs
  set completed_turns = new_completed,
      is_paused = false,
      paused_remaining_ms = null,
      turn_started_at = now_ts,
      turn_deadline_at = now_ts + make_interval(secs => timer_duration_ms / 1000.0),
      version = version + 1,
      updated_at = now_ts
  where id = g.id
  returning * into g;

  return g;
end;
$$;

revoke all on function public.pause_game(uuid, bigint) from public;
revoke all on function public.resume_game(uuid, bigint) from public;
revoke all on function public.restart_current_turn(uuid, bigint) from public;
revoke all on function public.skip_current_turn(uuid, bigint) from public;

grant execute on function public.pause_game(uuid, bigint) to authenticated;
grant execute on function public.resume_game(uuid, bigint) to authenticated;
grant execute on function public.restart_current_turn(uuid, bigint) to authenticated;
grant execute on function public.skip_current_turn(uuid, bigint) to authenticated;

-- Existing v0.4 control functions are replaced so a paused game cannot carry stale pause state
-- into ending_notice / ending / result.
create or replace function public.acknowledge_ending(p_game_id uuid)
returns public.game_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.game_runs;
  now_ts timestamptz := now();
begin
  select * into g from public.game_runs where id = p_game_id for update;
  if g.id is null then raise exception 'GAME_NOT_FOUND'; end if;
  if not public.is_session_host(g.session_id) then raise exception 'HOST_ONLY'; end if;
  if g.phase <> 'ending_notice' then raise exception 'INVALID_PHASE'; end if;

  update public.game_runs
  set phase = 'ending',
      is_paused = false,
      paused_remaining_ms = null,
      turn_started_at = now_ts,
      turn_deadline_at = now_ts + make_interval(secs => timer_duration_ms / 1000.0),
      version = version + 1,
      updated_at = now_ts
  where id = g.id
  returning * into g;
  return g;
end;
$$;

create or replace function public.trigger_ending_now(p_game_id uuid)
returns public.game_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.game_runs;
begin
  select * into g from public.game_runs where id = p_game_id for update;
  if g.id is null then raise exception 'GAME_NOT_FOUND'; end if;
  if not public.is_session_host(g.session_id) then raise exception 'HOST_ONLY'; end if;
  if g.phase <> 'playing' then raise exception 'INVALID_PHASE'; end if;

  update public.game_runs
  set phase = 'ending_notice',
      remaining_ending_turns = player_count_snapshot,
      is_paused = false,
      paused_remaining_ms = null,
      turn_started_at = null,
      turn_deadline_at = null,
      version = version + 1,
      updated_at = now()
  where id = g.id
  returning * into g;
  return g;
end;
$$;

create or replace function public.finish_game_early(p_game_id uuid)
returns public.game_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.game_runs;
begin
  select * into g from public.game_runs where id = p_game_id for update;
  if g.id is null then raise exception 'GAME_NOT_FOUND'; end if;
  if not public.is_session_host(g.session_id) then raise exception 'HOST_ONLY'; end if;
  if g.phase not in ('playing', 'ending_notice', 'ending') then raise exception 'INVALID_PHASE'; end if;

  update public.game_runs
  set phase = 'result',
      is_paused = false,
      paused_remaining_ms = null,
      turn_started_at = null,
      turn_deadline_at = null,
      finished_at = now(),
      result_revealed = false,
      version = version + 1,
      updated_at = now()
  where id = g.id
  returning * into g;
  return g;
end;
$$;
