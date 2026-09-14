-- v0.4: Prompt card editing support. Presentation mode is client-side only.

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

  delete from public.game_runs where session_id = card.session_id;
  update public.sessions set active_game_run_id = null, updated_at = now() where id = card.session_id;
  return card;
end;
$$;

revoke all on function public.update_prompt_card(uuid, text, text, text, integer) from public;
grant execute on function public.update_prompt_card(uuid, text, text, text, integer) to authenticated;
