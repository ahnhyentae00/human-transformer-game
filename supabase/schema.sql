create extension if not exists pgcrypto;

create type public.session_status as enum (
  'setup', 'lobby', 'running', 'result', 'complete'
);

create type public.member_role as enum (
  'host', 'display', 'player'
);

create type public.game_phase as enum (
  'queued', 'ready', 'playing', 'ending_notice', 'ending', 'result', 'complete'
);

create type public.turn_outcome as enum (
  'accepted', 'timeout', 'skipped', 'host_override'
);

create type public.turn_phase as enum (
  'normal', 'ending'
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  title text not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  status public.session_status not null default 'setup',
  active_game_run_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sessions_room_code_format check (room_code ~ '^[0-9]{4,6}$')
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  name text not null,
  expected_player_count integer not null check (expected_player_count >= 1),
  sort_order integer not null default 1,
  created_at timestamptz not null default now(),
  unique (session_id, name),
  unique (session_id, sort_order)
);

create table public.session_memberships (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null,
  team_id uuid null references public.teams(id) on delete cascade,
  display_name text not null,
  player_order integer null check (player_order is null or player_order >= 1),
  is_ready boolean not null default false,
  created_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create unique index one_player_order_per_team
  on public.session_memberships(team_id, player_order)
  where role = 'player' and team_id is not null and player_order is not null;

create table public.prompt_cards (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  title text not null,
  prompt_text text not null,
  seed_text text not null,
  seed_effective_char_count smallint not null default 3 check (seed_effective_char_count = 3),
  ending_lap integer not null default 3 check (ending_lap >= 1),
  sort_order integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.game_runs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  prompt_card_id uuid null references public.prompt_cards(id) on delete set null,
  play_order integer not null,
  phase public.game_phase not null default 'queued',

  prompt_text_snapshot text not null,
  seed_text_snapshot text not null,
  generated_text text not null,
  ending_lap_snapshot integer not null check (ending_lap_snapshot >= 1),
  player_count_snapshot integer not null check (player_count_snapshot >= 1),
  timer_duration_ms integer not null default 12000 check (timer_duration_ms >= 1000),
  start_countdown_ms integer not null default 3000 check (start_countdown_ms >= 0 and start_countdown_ms <= 10000),

  completed_turns integer not null default 0 check (completed_turns >= 0),
  remaining_ending_turns integer null check (remaining_ending_turns is null or remaining_ending_turns >= 0),
  turn_started_at timestamptz null,
  turn_deadline_at timestamptz null,
  is_paused boolean not null default false,
  paused_remaining_ms integer null check (paused_remaining_ms is null or paused_remaining_ms >= 0),
  result_revealed boolean not null default false,
  version bigint not null default 0,

  started_at timestamptz null,
  finished_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (session_id, team_id, play_order)
);

alter table public.sessions
  add constraint sessions_active_game_run_fk
  foreign key (active_game_run_id)
  references public.game_runs(id)
  on delete set null;

create table public.turns (
  id uuid primary key default gen_random_uuid(),
  game_run_id uuid not null references public.game_runs(id) on delete cascade,
  turn_number integer not null check (turn_number >= 1),
  lap_number integer not null check (lap_number >= 1),
  player_order integer not null check (player_order >= 1),
  player_membership_id uuid null references public.session_memberships(id) on delete set null,
  phase public.turn_phase not null,
  outcome public.turn_outcome not null,
  raw_text text null,
  effective_char_count integer not null default 0 check (effective_char_count >= 0),
  context_before text not null,
  context_after text not null,
  submitted_at timestamptz not null default now(),
  unique (game_run_id, turn_number)
);

create index game_runs_session_idx on public.game_runs(session_id);
create index game_runs_team_idx on public.game_runs(team_id);
create index turns_game_run_idx on public.turns(game_run_id, turn_number);
create index memberships_session_idx on public.session_memberships(session_id);

-- ------------------------------------------------------------
-- RLS helpers
-- ------------------------------------------------------------

create or replace function public.is_session_member(p_session_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.session_memberships m
    where m.session_id = p_session_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_session_host(p_session_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.session_memberships m
    where m.session_id = p_session_id
      and m.user_id = auth.uid()
      and m.role = 'host'
  );
$$;

alter table public.sessions enable row level security;
alter table public.teams enable row level security;
alter table public.session_memberships enable row level security;
alter table public.prompt_cards enable row level security;
alter table public.game_runs enable row level security;
alter table public.turns enable row level security;

create policy "members can read sessions"
  on public.sessions for select
  using (public.is_session_member(id));

create policy "members can read teams"
  on public.teams for select
  using (public.is_session_member(session_id));

create policy "members can read memberships"
  on public.session_memberships for select
  using (public.is_session_member(session_id));

create policy "members can read prompts"
  on public.prompt_cards for select
  using (public.is_session_member(session_id));

create policy "members can read game runs"
  on public.game_runs for select
  using (public.is_session_member(session_id));

create policy "members can read turns"
  on public.turns for select
  using (
    exists (
      select 1
      from public.game_runs g
      where g.id = turns.game_run_id
        and public.is_session_member(g.session_id)
    )
  );

-- 클라이언트의 직접 INSERT/UPDATE/DELETE는 허용하지 않는다.
-- 상태 변경은 아래 RPC 함수로만 수행한다.

-- ------------------------------------------------------------
-- Setup / lobby RPCs
-- ------------------------------------------------------------

create or replace function public.create_game_session(
  p_title text,
  p_team_sizes integer[]
)
returns public.sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.sessions;
  room_candidate text;
  team_size integer;
  i integer;
  attempts integer := 0;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_title is null or btrim(p_title) = '' then raise exception 'TITLE_REQUIRED'; end if;
  if coalesce(array_length(p_team_sizes, 1), 0) < 1 then raise exception 'TEAM_REQUIRED'; end if;
  if array_length(p_team_sizes, 1) > 8 then raise exception 'TOO_MANY_TEAMS'; end if;

  foreach team_size in array p_team_sizes loop
    if team_size < 1 or team_size > 12 then raise exception 'INVALID_TEAM_SIZE'; end if;
  end loop;

  loop
    attempts := attempts + 1;
    room_candidate := (floor(random() * 9000) + 1000)::integer::text;
    begin
      insert into public.sessions(room_code, title, owner_user_id, status)
      values (room_candidate, btrim(p_title), auth.uid(), 'setup')
      returning * into s;
      exit;
    exception when unique_violation then
      if attempts >= 20 then raise exception 'ROOM_CODE_GENERATION_FAILED'; end if;
    end;
  end loop;

  insert into public.session_memberships(
    session_id, user_id, role, team_id, display_name, player_order, is_ready
  ) values (
    s.id, auth.uid(), 'host', null, '멘토', null, true
  );

  for i in 1..array_length(p_team_sizes, 1) loop
    insert into public.teams(session_id, name, expected_player_count, sort_order)
    values (
      s.id,
      case when i <= 26 then 'TEAM ' || chr(64 + i) else 'TEAM ' || i::text end,
      p_team_sizes[i],
      i
    );
  end loop;

  return s;
end;
$$;

create or replace function public.join_game_session(
  p_room_code text,
  p_display_name text
)
returns public.session_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.sessions;
  existing public.session_memberships;
  selected_team public.teams;
  selected_order integer;
  joined public.session_memberships;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_display_name is null or btrim(p_display_name) = '' then raise exception 'DISPLAY_NAME_REQUIRED'; end if;

  select * into s from public.sessions where room_code = p_room_code limit 1;
  if s.id is null then raise exception 'ROOM_NOT_FOUND'; end if;

  select * into existing
  from public.session_memberships
  where session_id = s.id and user_id = auth.uid()
  limit 1;

  if existing.id is not null then
    return existing;
  end if;

  if s.status in ('result', 'complete') then raise exception 'ROOM_CLOSED'; end if;
  if s.status = 'running' then raise exception 'GAME_ALREADY_RUNNING'; end if;

  -- 같은 세션에 여러 학생이 동시에 참가해도 팀/순번 배정이 충돌하지 않도록 직렬화한다.
  perform pg_advisory_xact_lock(hashtext(s.id::text));

  select t.* into selected_team
  from public.teams t
  where t.session_id = s.id
    and (
      select count(*) from public.session_memberships m
      where m.team_id = t.id and m.role = 'player'
    ) < t.expected_player_count
  order by (
    select count(*) from public.session_memberships m
    where m.team_id = t.id and m.role = 'player'
  ) asc, t.sort_order asc
  limit 1;

  if selected_team.id is null then raise exception 'ROOM_FULL'; end if;

  select gs into selected_order
  from generate_series(1, selected_team.expected_player_count) gs
  where not exists (
    select 1 from public.session_memberships m
    where m.team_id = selected_team.id
      and m.role = 'player'
      and m.player_order = gs
  )
  order by gs
  limit 1;

  if selected_order is null then raise exception 'TEAM_FULL'; end if;

  insert into public.session_memberships(
    session_id, user_id, role, team_id, display_name, player_order, is_ready
  ) values (
    s.id, auth.uid(), 'player', selected_team.id, left(btrim(p_display_name), 30), selected_order, false
  ) returning * into joined;

  update public.sessions
  set status = 'lobby', updated_at = now()
  where id = s.id and status = 'setup';

  return joined;
end;
$$;

create or replace function public.set_player_ready(
  p_room_code text,
  p_ready boolean
)
returns public.session_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.sessions;
  m public.session_memberships;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into s from public.sessions where room_code = p_room_code limit 1;
  if s.id is null then raise exception 'ROOM_NOT_FOUND'; end if;

  update public.session_memberships
  set is_ready = p_ready
  where session_id = s.id
    and user_id = auth.uid()
    and role = 'player'
  returning * into m;

  if m.id is null then raise exception 'PLAYER_MEMBERSHIP_NOT_FOUND'; end if;
  return m;
end;
$$;

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

create or replace function public.create_prompt_card(
  p_room_code text,
  p_title text,
  p_prompt_text text,
  p_seed_text text,
  p_ending_lap integer
)
returns public.prompt_cards
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.sessions;
  card public.prompt_cards;
  next_order integer;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into s from public.sessions where room_code = p_room_code limit 1;
  if s.id is null then raise exception 'ROOM_NOT_FOUND'; end if;
  if not public.is_session_host(s.id) then raise exception 'HOST_ONLY'; end if;
  if exists (
    select 1 from public.game_runs g
    where g.session_id = s.id and g.phase not in ('queued', 'ready')
  ) then raise exception 'SESSION_ALREADY_STARTED'; end if;
  if p_prompt_text is null or btrim(p_prompt_text) = '' then raise exception 'PROMPT_REQUIRED'; end if;
  if p_seed_text is null or btrim(p_seed_text) = '' then raise exception 'SEED_REQUIRED'; end if;
  if p_ending_lap < 1 or p_ending_lap > 20 then raise exception 'INVALID_ENDING_LAP'; end if;

  select coalesce(max(sort_order), 0) + 1 into next_order
  from public.prompt_cards where session_id = s.id;

  insert into public.prompt_cards(
    session_id, title, prompt_text, seed_text, seed_effective_char_count, ending_lap, sort_order
  ) values (
    s.id,
    coalesce(nullif(btrim(p_title), ''), '프롬프트 ' || next_order::text),
    btrim(p_prompt_text),
    p_seed_text,
    3,
    p_ending_lap,
    next_order
  ) returning * into card;

  -- Prompt 구성이 바뀌면 아직 시작되지 않은 game queue는 무효화한다.
  delete from public.game_runs where session_id = s.id;
  update public.sessions set active_game_run_id = null, updated_at = now() where id = s.id;

  return card;
end;
$$;

create or replace function public.update_prompt_card(
  p_prompt_id uuid,
  p_title text,
  p_prompt_text text,
  p_seed_text text,
  p_ending_lap integer
)
returns public.prompt_cards
language plpgsql
security definer
set search_path = public
as $$
declare
  card public.prompt_cards;
  started_count integer;
begin
  select * into card from public.prompt_cards where id = p_prompt_id for update;
  if card.id is null then raise exception 'PROMPT_NOT_FOUND'; end if;
  if not public.is_session_host(card.session_id) then raise exception 'HOST_ONLY'; end if;

  select count(*) into started_count
  from public.game_runs
  where session_id = card.session_id and phase not in ('queued', 'ready');
  if started_count > 0 then raise exception 'SESSION_ALREADY_STARTED'; end if;

  if p_prompt_text is null or btrim(p_prompt_text) = '' then raise exception 'PROMPT_REQUIRED'; end if;
  if p_seed_text is null or btrim(p_seed_text) = '' then raise exception 'SEED_REQUIRED'; end if;
  if p_ending_lap < 1 or p_ending_lap > 20 then raise exception 'INVALID_ENDING_LAP'; end if;

  update public.prompt_cards
  set title = coalesce(nullif(btrim(p_title), ''), card.title),
      prompt_text = btrim(p_prompt_text),
      seed_text = p_seed_text,
      seed_effective_char_count = 3,
      ending_lap = p_ending_lap,
      updated_at = now()
  where id = card.id
  returning * into card;

  -- 프롬프트 스냅샷을 다시 만들 수 있도록 아직 시작되지 않은 큐는 제거한다.
  delete from public.game_runs where session_id = card.session_id;
  update public.sessions set active_game_run_id = null, updated_at = now() where id = card.session_id;

  return card;
end;
$$;

revoke all on function public.update_prompt_card(uuid, text, text, text, integer) from public;
grant execute on function public.update_prompt_card(uuid, text, text, text, integer) to authenticated;


create or replace function public.delete_prompt_card(p_prompt_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  card public.prompt_cards;
  started_count integer;
begin
  select * into card from public.prompt_cards where id = p_prompt_id;
  if card.id is null then raise exception 'PROMPT_NOT_FOUND'; end if;
  if not public.is_session_host(card.session_id) then raise exception 'HOST_ONLY'; end if;

  select count(*) into started_count
  from public.game_runs
  where session_id = card.session_id and phase not in ('queued', 'ready');
  if started_count > 0 then raise exception 'SESSION_ALREADY_STARTED'; end if;

  delete from public.game_runs where session_id = card.session_id;
  delete from public.prompt_cards where id = card.id;

  with ranked as (
    select id, row_number() over(order by sort_order, created_at)::integer as new_order
    from public.prompt_cards
    where session_id = card.session_id
  )
  update public.prompt_cards p
  set sort_order = ranked.new_order,
      updated_at = now()
  from ranked
  where p.id = ranked.id;

  update public.sessions set active_game_run_id = null, updated_at = now() where id = card.session_id;
  return true;
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
    12000,
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

-- ------------------------------------------------------------
-- Core game RPCs
-- ------------------------------------------------------------

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
      paused_remaining_ms = null,
      result_revealed = false,
      version = version + 1,
      updated_at = now_ts
  where id = g.id
  returning * into g;

  return g;
end;
$$;

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
  select * into g
  from public.game_runs
  where id = p_game_id
  for update;

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
  select * into g
  from public.game_runs
  where id = p_game_id
  for update;

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

-- Realtime 구독 대상
alter publication supabase_realtime add table public.game_runs;
alter publication supabase_realtime add table public.turns;
alter publication supabase_realtime add table public.session_memberships;


create or replace function public.host_remove_player(p_membership_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $
declare
  target public.session_memberships;
begin
  select * into target
  from public.session_memberships
  where id = p_membership_id
    and role = 'player'
  for update;

  if target.id is null then raise exception 'PLAYER_MEMBERSHIP_NOT_FOUND'; end if;
  if not public.is_session_host(target.session_id) then raise exception 'HOST_ONLY'; end if;

  if exists (
    select 1
    from public.game_runs g
    where g.session_id = target.session_id
      and g.phase not in ('queued', 'ready')
  ) then
    raise exception 'SESSION_ALREADY_STARTED';
  end if;

  delete from public.session_memberships where id = target.id;
  return true;
end;
$;

-- Anonymous Auth 사용자는 Postgres role상 authenticated로 동작한다.
revoke all on function public.create_game_session(text, integer[]) from public;
revoke all on function public.join_game_session(text, text) from public;
revoke all on function public.set_player_ready(text, boolean) from public;
revoke all on function public.host_assign_player(uuid, uuid, integer) from public;
revoke all on function public.create_prompt_card(text, text, text, text, integer) from public;
revoke all on function public.delete_prompt_card(uuid) from public;
revoke all on function public.prepare_game_runs(text) from public;
revoke all on function public.start_game(uuid) from public;
revoke all on function public.submit_turn(uuid, text, integer, bigint) from public;
revoke all on function public.expire_turn(uuid, bigint) from public;
revoke all on function public.acknowledge_ending(uuid) from public;
revoke all on function public.trigger_ending_now(uuid) from public;
revoke all on function public.finish_game_early(uuid) from public;
revoke all on function public.pause_game(uuid, bigint) from public;
revoke all on function public.resume_game(uuid, bigint) from public;
revoke all on function public.restart_current_turn(uuid, bigint) from public;
revoke all on function public.skip_current_turn(uuid, bigint) from public;
revoke all on function public.reveal_game_result(uuid) from public;
revoke all on function public.complete_game(uuid) from public;
revoke all on function public.host_remove_player(uuid) from public;

grant execute on function public.create_game_session(text, integer[]) to authenticated;
grant execute on function public.join_game_session(text, text) to authenticated;
grant execute on function public.set_player_ready(text, boolean) to authenticated;
grant execute on function public.host_assign_player(uuid, uuid, integer) to authenticated;
grant execute on function public.create_prompt_card(text, text, text, text, integer) to authenticated;
grant execute on function public.delete_prompt_card(uuid) to authenticated;
grant execute on function public.prepare_game_runs(text) to authenticated;
grant execute on function public.start_game(uuid) to authenticated;
grant execute on function public.submit_turn(uuid, text, integer, bigint) to authenticated;
grant execute on function public.expire_turn(uuid, bigint) to authenticated;
grant execute on function public.acknowledge_ending(uuid) to authenticated;
grant execute on function public.trigger_ending_now(uuid) to authenticated;
grant execute on function public.finish_game_early(uuid) to authenticated;
grant execute on function public.pause_game(uuid, bigint) to authenticated;
grant execute on function public.resume_game(uuid, bigint) to authenticated;
grant execute on function public.restart_current_turn(uuid, bigint) to authenticated;
grant execute on function public.skip_current_turn(uuid, bigint) to authenticated;
grant execute on function public.reveal_game_result(uuid) to authenticated;
grant execute on function public.complete_game(uuid) to authenticated;
grant execute on function public.host_remove_player(uuid) to authenticated;

-- Explicitly remove SECURITY DEFINER execution from the unauthenticated anon role.
do $
declare
  r record;
begin
  for r in
    select n.nspname as schema_name,
           p.proname as function_name,
           pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    execute format('revoke all privileges on function %I.%I(%s) from anon', r.schema_name, r.function_name, r.identity_args);
    execute format('revoke all privileges on function %I.%I(%s) from PUBLIC', r.schema_name, r.function_name, r.identity_args);
    execute format('grant execute on function %I.%I(%s) to authenticated', r.schema_name, r.function_name, r.identity_args);
  end loop;
end
$;

