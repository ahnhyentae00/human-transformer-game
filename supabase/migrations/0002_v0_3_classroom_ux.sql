-- v0.2 -> v0.3 migration
-- Adds 3-second opening countdown, mentor team/slot reassignment, and staged result reveal.

alter table public.game_runs
  add column if not exists start_countdown_ms integer not null default 3000
    check (start_countdown_ms >= 0 and start_countdown_ms <= 10000);

alter table public.game_runs
  add column if not exists result_revealed boolean not null default false;

create or replace function public.host_assign_player(
  p_membership_id uuid,
  p_team_id uuid,
  p_player_order integer
)
returns public.session_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  moving public.session_memberships;
  target_team public.teams;
  occupant public.session_memberships;
  source_team_id uuid;
  source_order integer;
  started_count integer;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into moving
  from public.session_memberships
  where id = p_membership_id and role = 'player'
  for update;

  if moving.id is null then raise exception 'PLAYER_MEMBERSHIP_NOT_FOUND'; end if;
  if not public.is_session_host(moving.session_id) then raise exception 'HOST_ONLY'; end if;

  select count(*) into started_count
  from public.game_runs
  where session_id = moving.session_id and phase not in ('queued', 'ready');
  if started_count > 0 then raise exception 'SESSION_ALREADY_STARTED'; end if;

  select * into target_team
  from public.teams
  where id = p_team_id and session_id = moving.session_id
  for update;

  if target_team.id is null then raise exception 'TEAM_NOT_FOUND'; end if;
  if p_player_order < 1 or p_player_order > target_team.expected_player_count then
    raise exception 'INVALID_PLAYER_ORDER';
  end if;

  perform pg_advisory_xact_lock(hashtext(moving.session_id::text));

  if moving.team_id = target_team.id and moving.player_order = p_player_order then
    return moving;
  end if;

  source_team_id := moving.team_id;
  source_order := moving.player_order;

  select * into occupant
  from public.session_memberships
  where session_id = moving.session_id
    and role = 'player'
    and team_id = target_team.id
    and player_order = p_player_order
    and id <> moving.id
  for update;

  -- 먼저 이동자를 임시로 슬롯에서 빼 unique index 충돌을 피한다.
  update public.session_memberships
  set team_id = null, player_order = null, is_ready = false
  where id = moving.id;

  if occupant.id is not null then
    if source_team_id is null or source_order is null then
      raise exception 'TARGET_SLOT_OCCUPIED';
    end if;
    update public.session_memberships
    set team_id = source_team_id,
        player_order = source_order,
        is_ready = false
    where id = occupant.id;
  end if;

  update public.session_memberships
  set team_id = target_team.id,
      player_order = p_player_order,
      is_ready = false
  where id = moving.id
  returning * into moving;

  return moving;
end;
$$;

create or replace function public.prepare_game_runs(p_room_code text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.sessions;
  started_count integer;
  prompt_count integer;
  inserted_count integer;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into s from public.sessions where room_code = p_room_code limit 1;
  if s.id is null then raise exception 'ROOM_NOT_FOUND'; end if;
  if not public.is_session_host(s.id) then raise exception 'HOST_ONLY'; end if;

  select count(*) into prompt_count from public.prompt_cards where session_id = s.id;
  if prompt_count = 0 then raise exception 'PROMPT_REQUIRED'; end if;

  select count(*) into started_count
  from public.game_runs
  where session_id = s.id and phase not in ('queued', 'ready');
  if started_count > 0 then raise exception 'SESSION_ALREADY_STARTED'; end if;

  delete from public.game_runs where session_id = s.id;

  insert into public.game_runs(
    session_id, team_id, prompt_card_id, play_order, phase,
    prompt_text_snapshot, seed_text_snapshot, generated_text,
    ending_lap_snapshot, player_count_snapshot, timer_duration_ms, start_countdown_ms
  )
  select
    s.id,
    t.id,
    p.id,
    p.sort_order,
    'ready'::public.game_phase,
    p.prompt_text,
    p.seed_text,
    p.seed_text,
    p.ending_lap,
    t.expected_player_count,
    7000,
    3000
  from public.teams t
  cross join public.prompt_cards p
  where t.session_id = s.id and p.session_id = s.id
  order by t.sort_order, p.sort_order;

  get diagnostics inserted_count = row_count;

  update public.sessions
  set status = 'lobby', active_game_run_id = null, updated_at = now()
  where id = s.id;

  return inserted_count;
end;
$$;

create or replace function public.start_game(p_game_id uuid)
returns public.game_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.game_runs;
  ready_count integer;
  now_ts timestamptz := now();
begin
  select * into g
  from public.game_runs
  where id = p_game_id
  for update;

  if g.id is null then
    raise exception 'GAME_NOT_FOUND';
  end if;

  if not public.is_session_host(g.session_id) then
    raise exception 'HOST_ONLY';
  end if;

  if g.phase not in ('queued', 'ready') then
    raise exception 'INVALID_PHASE';
  end if;

  if exists (
    select 1 from public.sessions s
    where s.id = g.session_id
      and s.active_game_run_id is not null
      and s.active_game_run_id <> g.id
  ) then
    raise exception 'ACTIVE_GAME_EXISTS';
  end if;

  if exists (
    select 1 from public.game_runs previous
    where previous.session_id = g.session_id
      and previous.team_id = g.team_id
      and previous.play_order < g.play_order
      and previous.phase <> 'complete'
  ) then
    raise exception 'PREVIOUS_GAME_NOT_COMPLETE';
  end if;

  select count(*) into ready_count
  from public.session_memberships m
  where m.session_id = g.session_id
    and m.team_id = g.team_id
    and m.role = 'player'
    and m.is_ready = true
    and m.player_order is not null;

  if ready_count <> g.player_count_snapshot then
    raise exception 'PLAYERS_NOT_READY';
  end if;

  update public.sessions
  set status = 'running',
      active_game_run_id = g.id,
      updated_at = now_ts
  where id = g.session_id;

  update public.game_runs
  set phase = case when ending_lap_snapshot = 1 then 'ending_notice'::public.game_phase else 'playing'::public.game_phase end,
      generated_text = seed_text_snapshot,
      completed_turns = 0,
      remaining_ending_turns = case when ending_lap_snapshot = 1 then player_count_snapshot else null end,
      turn_started_at = case when ending_lap_snapshot = 1 then null else now_ts + make_interval(secs => start_countdown_ms / 1000.0) end,
      turn_deadline_at = case when ending_lap_snapshot = 1 then null else now_ts + make_interval(secs => (start_countdown_ms + timer_duration_ms) / 1000.0) end,
      started_at = now_ts,
      finished_at = null,
      is_paused = false,
      result_revealed = false,
      version = version + 1,
      updated_at = now_ts
  where id = g.id
  returning * into g;

  return g;
end;
$$;

create or replace function public.submit_turn(
  p_game_id uuid,
  p_raw_text text,
  p_effective_char_count integer,
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
  before_text text;
  after_text text;
begin
  select * into g
  from public.game_runs
  where id = p_game_id
  for update;

  if g.id is null then raise exception 'GAME_NOT_FOUND'; end if;
  if g.phase not in ('playing', 'ending') then raise exception 'INVALID_PHASE'; end if;
  if g.is_paused then raise exception 'GAME_PAUSED'; end if;
  if g.version <> p_expected_version then raise exception 'STALE_GAME_VERSION'; end if;
  if p_effective_char_count <> 3 then raise exception 'INVALID_CHARACTER_COUNT'; end if;
  if p_raw_text is null or length(p_raw_text) = 0 then raise exception 'EMPTY_OUTPUT'; end if;
  if g.turn_started_at is null or now_ts < g.turn_started_at then raise exception 'TURN_NOT_STARTED'; end if;
  if g.turn_deadline_at is null or now_ts > g.turn_deadline_at then raise exception 'TURN_EXPIRED'; end if;

  turn_no := g.completed_turns + 1;
  lap_no := floor(g.completed_turns::numeric / g.player_count_snapshot)::integer + 1;
  player_order_no := (g.completed_turns % g.player_count_snapshot) + 1;

  select * into m
  from public.session_memberships
  where session_id = g.session_id
    and team_id = g.team_id
    and user_id = auth.uid()
    and role = 'player'
    and player_order = player_order_no
  limit 1;

  if m.id is null then raise exception 'NOT_ACTIVE_PLAYER'; end if;

  turn_phase_value := case when g.phase = 'ending' then 'ending'::public.turn_phase else 'normal'::public.turn_phase end;
  before_text := g.generated_text;
  after_text := g.generated_text || p_raw_text;

  insert into public.turns (
    game_run_id, turn_number, lap_number, player_order, player_membership_id,
    phase, outcome, raw_text, effective_char_count, context_before, context_after, submitted_at
  ) values (
    g.id, turn_no, lap_no, player_order_no, m.id,
    turn_phase_value, 'accepted', p_raw_text, 3, before_text, after_text, now_ts
  );

  new_completed := g.completed_turns + 1;

  if g.phase = 'ending' then
    next_remaining := greatest(coalesce(g.remaining_ending_turns, g.player_count_snapshot) - 1, 0);

    if next_remaining = 0 then
      update public.game_runs
      set generated_text = after_text,
          completed_turns = new_completed,
          remaining_ending_turns = 0,
          phase = 'result',
          turn_started_at = null,
          turn_deadline_at = null,
          finished_at = now_ts,
          result_revealed = false,
          version = version + 1,
          updated_at = now_ts
      where id = g.id
      returning * into g;

      return g;
    end if;

    update public.game_runs
    set generated_text = after_text,
        completed_turns = new_completed,
        remaining_ending_turns = next_remaining,
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
    set generated_text = after_text,
        completed_turns = new_completed,
        phase = 'ending_notice',
        remaining_ending_turns = player_count_snapshot,
        turn_started_at = null,
        turn_deadline_at = null,
        version = version + 1,
        updated_at = now_ts
    where id = g.id
    returning * into g;

    return g;
  end if;

  update public.game_runs
  set generated_text = after_text,
      completed_turns = new_completed,
      turn_started_at = now_ts,
      turn_deadline_at = now_ts + make_interval(secs => timer_duration_ms / 1000.0),
      version = version + 1,
      updated_at = now_ts
  where id = g.id
  returning * into g;

  return g;
end;
$$;

create or replace function public.expire_turn(
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
  if not public.is_session_member(g.session_id) then raise exception 'MEMBER_ONLY'; end if;
  if g.phase not in ('playing', 'ending') then raise exception 'INVALID_PHASE'; end if;
  if g.version <> p_expected_version then raise exception 'STALE_GAME_VERSION'; end if;
  if g.turn_deadline_at is null or now_ts < g.turn_deadline_at then raise exception 'TURN_NOT_EXPIRED'; end if;

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
    turn_phase_value, 'timeout', null, 0, g.generated_text, g.generated_text, now_ts
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
      turn_started_at = now_ts,
      turn_deadline_at = now_ts + make_interval(secs => timer_duration_ms / 1000.0),
      version = version + 1,
      updated_at = now_ts
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
  select * into g
  from public.game_runs
  where id = p_game_id
  for update;

  if g.id is null then raise exception 'GAME_NOT_FOUND'; end if;
  if not public.is_session_host(g.session_id) then raise exception 'HOST_ONLY'; end if;
  if g.phase not in ('playing', 'ending_notice', 'ending') then raise exception 'INVALID_PHASE'; end if;

  update public.game_runs
  set phase = 'result',
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

create or replace function public.reveal_game_result(p_game_id uuid)
returns public.game_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.game_runs;
begin
  select * into g
  from public.game_runs
  where id = p_game_id
  for update;

  if g.id is null then raise exception 'GAME_NOT_FOUND'; end if;
  if not public.is_session_host(g.session_id) then raise exception 'HOST_ONLY'; end if;
  if g.phase <> 'result' then raise exception 'INVALID_PHASE'; end if;

  update public.game_runs
  set result_revealed = true,
      version = version + 1,
      updated_at = now()
  where id = g.id
  returning * into g;

  return g;
end;
$$;

create or replace function public.complete_game(p_game_id uuid)
returns public.game_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.game_runs;
  remaining_games integer;
begin
  select * into g
  from public.game_runs
  where id = p_game_id
  for update;

  if g.id is null then raise exception 'GAME_NOT_FOUND'; end if;
  if not public.is_session_host(g.session_id) then raise exception 'HOST_ONLY'; end if;
  if g.phase <> 'result' then raise exception 'INVALID_PHASE'; end if;
  if not g.result_revealed then raise exception 'RESULT_NOT_REVEALED'; end if;

  update public.game_runs
  set phase = 'complete',
      version = version + 1,
      updated_at = now()
  where id = g.id
  returning * into g;

  update public.sessions
  set active_game_run_id = null,
      updated_at = now()
  where id = g.session_id
    and active_game_run_id = g.id;

  select count(*) into remaining_games
  from public.game_runs
  where session_id = g.session_id
    and phase <> 'complete';

  if remaining_games = 0 then
    update public.sessions
    set status = 'complete',
        updated_at = now()
    where id = g.session_id;
  else
    update public.sessions
    set status = 'lobby',
        updated_at = now()
    where id = g.session_id;
  end if;

  return g;
end;
$$;

revoke all on function public.host_assign_player(uuid, uuid, integer) from public;
revoke all on function public.reveal_game_result(uuid) from public;
grant execute on function public.host_assign_player(uuid, uuid, integer) to authenticated;
grant execute on function public.reveal_game_result(uuid) to authenticated;
