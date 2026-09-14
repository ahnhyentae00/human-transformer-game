-- v0.9 Playtest usability update
-- Extend turns to 12 seconds and allow hosts to clear offline lobby slots.

alter table public.game_runs
  alter column timer_duration_ms set default 12000;

update public.game_runs
set timer_duration_ms = 12000,
    updated_at = now()
where phase in ('queued', 'ready');

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



create or replace function public.host_remove_player(p_membership_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
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
$$;


revoke all on function public.host_remove_player(uuid) from PUBLIC;
revoke all on function public.host_remove_player(uuid) from anon;
grant execute on function public.host_remove_player(uuid) to authenticated;

do $$
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
$$;


notify pgrst, 'reload schema';
