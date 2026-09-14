export type SessionStatus = "setup" | "lobby" | "running" | "result" | "complete";

export type GamePhase =
  | "queued"
  | "ready"
  | "playing"
  | "ending_notice"
  | "ending"
  | "result"
  | "complete";

export type MemberRole = "host" | "display" | "player";
export type TurnOutcome = "accepted" | "timeout" | "skipped" | "host_override";
export type TurnPhase = "normal" | "ending";

export interface SessionRow {
  id: string;
  room_code: string;
  title: string;
  status: SessionStatus;
  active_game_run_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamRow {
  id: string;
  session_id: string;
  name: string;
  expected_player_count: number;
  sort_order: number;
  created_at: string;
}

export interface MembershipRow {
  id: string;
  session_id: string;
  user_id: string;
  role: MemberRole;
  team_id: string | null;
  display_name: string;
  player_order: number | null;
  is_ready: boolean;
  created_at: string;
}

export interface PromptCardRow {
  id: string;
  session_id: string;
  title: string;
  prompt_text: string;
  seed_text: string;
  seed_effective_char_count: number;
  ending_lap: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface GameRun {
  id: string;
  session_id: string;
  team_id: string;
  prompt_card_id: string | null;
  play_order: number;
  phase: GamePhase;
  prompt_text_snapshot: string;
  seed_text_snapshot: string;
  generated_text: string;
  ending_lap_snapshot: number;
  player_count_snapshot: number;
  timer_duration_ms: number;
  start_countdown_ms: number;
  completed_turns: number;
  remaining_ending_turns: number | null;
  turn_started_at: string | null;
  turn_deadline_at: string | null;
  is_paused: boolean;
  paused_remaining_ms: number | null;
  result_revealed: boolean;
  version: number;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TurnRow {
  id: string;
  game_run_id: string;
  turn_number: number;
  lap_number: number;
  player_order: number;
  player_membership_id: string | null;
  phase: TurnPhase;
  outcome: TurnOutcome;
  raw_text: string | null;
  effective_char_count: number;
  context_before: string;
  context_after: string;
  submitted_at: string;
}

export interface RoomState {
  session: SessionRow;
  currentMembership: MembershipRow;
  teams: TeamRow[];
  memberships: MembershipRow[];
  prompts: PromptCardRow[];
  games: GameRun[];
  turns: TurnRow[];
}
