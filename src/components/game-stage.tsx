"use client";

import { activeLap, activePlayerMembership, activePlayerOrder, isTurnActive } from "@/lib/game/state-machine";
import type { GameRun, MembershipRow, TeamRow, TurnRow } from "@/types/game";
import { ResultReveal } from "./result-reveal";
import { StartCountdown } from "./start-countdown";
import { TimerBar } from "./timer-bar";

export function GameStage({
  game,
  memberships,
  teams,
  timerProgress,
  turnStarted = true,
  startCountdownLabel = null,
  compact = false,
  presentation = false,
  turns = [],
  activePlayerOnline = null,
}: {
  game: GameRun;
  memberships: MembershipRow[];
  teams: TeamRow[];
  timerProgress: number;
  turnStarted?: boolean;
  startCountdownLabel?: string | null;
  compact?: boolean;
  presentation?: boolean;
  turns?: TurnRow[];
  activePlayerOnline?: boolean | null;
}) {
  const team = teams.find((t) => t.id === game.team_id);
  const player = activePlayerMembership(game, memberships);
  const playerOrder = activePlayerOrder(game.completed_turns, game.player_count_snapshot);
  const lap = activeLap(game.completed_turns, game.player_count_snapshot);
  const turnCountdown = isTurnActive(game.phase) && !game.is_paused && !turnStarted;

  if (game.phase === "result") {
    return <ResultReveal game={game} turns={turns} />;
  }

  return (
    <section className={`grid game-stage ${presentation ? "game-stage-presentation" : ""}`} style={{ gap: compact ? 12 : 18 }}>
      {isTurnActive(game.phase) && turnStarted && !game.is_paused && (
        <TimerBar progress={timerProgress} ending={game.phase === "ending"} />
      )}

      {activePlayerOnline === false && isTurnActive(game.phase) && (
        <div className="connection-banner" role="status">
          <span className="pill warn">OFFLINE</span>
          <strong>{player?.display_name ?? `${playerOrder}번 생성자`}의 연결이 끊겼습니다.</strong>
          <span>복귀하지 않으면 멘토가 현재 턴을 건너뛸 수 있습니다.</span>
        </div>
      )}

      {game.is_paused && (
        <div className="pause-banner" role="status">
          <span className="pill warn">PAUSED</span>
          <strong>게임이 일시정지되었습니다.</strong>
          <span>멘토가 재개하면 현재 생성자의 남은 시간부터 계속됩니다.</span>
        </div>
      )}

      <div className="prompt-box">
        <div className="eyebrow">USER PROMPT</div>
        <div className="prompt-text">{game.prompt_text_snapshot}</div>
      </div>

      {game.phase === "ending_notice" && (
        <div className="ending-banner ending-banner-animated">
          <div className="ending-radar" aria-hidden="true"><span /><span /><span /></div>
          <div className="ending-content">
            <div className="ending-kicker">⚠ FINAL GENERATION ORDER</div>
            <h2>GENERATION ENDING</h2>
            <div>지금부터 한 바퀴 안에 사용자의 요청에 대한 응답을 완성하십시오.</div>
            <div className="ending-dots" aria-label={`마지막 생성 기회 ${game.player_count_snapshot}회`}>
              {Array.from({ length: game.player_count_snapshot }, (_, i) => (
                <span className="ending-dot" key={i} />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="card context-box" style={{ marginTop: 0 }}>
        <div>
          <div className="label">GENERATED RESPONSE</div>
          <div className="context-text">{game.generated_text || game.seed_text_snapshot}</div>
        </div>
      </div>

      <div className="game-header">
        <div>
          <span className="pill">{team?.name ?? "TEAM"}</span>{" "}
          <span className="pill">LAP {lap}</span>{" "}
          {game.phase === "ending" && (
            <span className="pill warn">ENDING · 남은 기회 {game.remaining_ending_turns ?? 0}</span>
          )}
        </div>
        {isTurnActive(game.phase) && (
          <div className="current-player">
            {game.is_paused ? "일시정지" : turnCountdown ? "생성 준비 중" : `${player?.display_name ?? `${playerOrder}번 생성자`}의 생성 대기 중${activePlayerOnline === false ? " · OFFLINE" : ""}`}
          </div>
        )}
      </div>

      {turnCountdown && <StartCountdown label={startCountdownLabel} />}
    </section>
  );
}
