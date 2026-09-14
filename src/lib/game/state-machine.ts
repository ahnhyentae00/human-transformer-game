import type { GamePhase, GameRun, MembershipRow } from "@/types/game";

export const GAME_TRANSITIONS: Record<GamePhase, readonly GamePhase[]> = {
  queued: ["ready"],
  ready: ["playing", "ending_notice"],
  playing: ["ending_notice", "result"],
  ending_notice: ["ending", "result"],
  ending: ["result"],
  result: ["complete"],
  complete: [],
};

export function canTransition(from: GamePhase, to: GamePhase): boolean {
  return GAME_TRANSITIONS[from].includes(to);
}

export function activeTurnNumber(completedTurns: number): number {
  return completedTurns + 1;
}

export function activePlayerOrder(completedTurns: number, playerCount: number): number {
  return (completedTurns % playerCount) + 1;
}

export function activeLap(completedTurns: number, playerCount: number): number {
  return Math.floor(completedTurns / playerCount) + 1;
}

export function activePlayerMembership(
  game: GameRun,
  memberships: MembershipRow[],
): MembershipRow | undefined {
  const order = activePlayerOrder(game.completed_turns, game.player_count_snapshot);
  return memberships.find(
    (m) =>
      m.role === "player" &&
      m.team_id === game.team_id &&
      m.player_order === order,
  );
}

export function isTurnActive(phase: GamePhase): boolean {
  return phase === "playing" || phase === "ending";
}
