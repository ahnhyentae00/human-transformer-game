"use client";

import Link from "next/link";
import { useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { GameStage } from "@/components/game-stage";
import { useAnonymousAuth } from "@/hooks/use-anonymous-auth";
import { useRoomState } from "@/hooks/use-room-state";
import { useTurnTimer } from "@/hooks/use-turn-timer";
import { useTurnStart } from "@/hooks/use-turn-start";
import { postJson } from "@/lib/api/client";
import { isTurnActive } from "@/lib/game/state-machine";

export default function DisplayRoomPage() {
  const params = useParams<{ roomCode: string }>();
  const roomCode = params.roomCode;
  const { ready } = useAnonymousAuth();
  const { state, loading, error, refresh } = useRoomState(roomCode, ready);

  const activeGame = useMemo(() => {
    if (!state?.session.active_game_run_id) return null;
    return state.games.find((g) => g.id === state.session.active_game_run_id) ?? null;
  }, [state]);

  const onTimeout = useCallback(async () => {
    if (!activeGame || !isTurnActive(activeGame.phase)) return;
    try {
      await postJson(`/api/games/${activeGame.id}/timeout`, { expectedVersion: activeGame.version });
      await refresh();
    } catch {
      // 다른 클라이언트가 먼저 처리한 경우 무시
    }
  }, [activeGame, refresh]);

  const turnStart = useTurnStart(activeGame?.turn_started_at ?? null, activeGame?.version ?? -1);

  const progress = useTurnTimer(
    activeGame?.turn_deadline_at ?? null,
    activeGame?.timer_duration_ms ?? 12000,
    activeGame?.version ?? -1,
    onTimeout,
  );

  if (!ready || loading) return <main className="page-shell"><div className="narrow card center"><div className="big-status">CONNECTING</div></div></main>;
  if (error || !state) return <main className="page-shell"><div className="narrow card"><div className="error">{error ?? "표시 화면에 접근할 수 없습니다."}</div><Link href="/">처음으로</Link></div></main>;

  return (
    <main className="page-shell">
      <div className="container">
        <header className="topbar">
          <div className="brand">MAIN DISPLAY<small>{state.session.title}</small></div>
          <span className="pill">ROOM <span className="room-code">{roomCode}</span></span>
        </header>
        {activeGame ? (
          <GameStage game={activeGame} memberships={state.memberships} teams={state.teams} timerProgress={progress} turnStarted={turnStart.started} startCountdownLabel={turnStart.countdownLabel} turns={state.turns.filter((turn) => turn.game_run_id === activeGame.id)} />
        ) : (
          <div className="card center"><div className="big-status">게임 대기 중</div><p className="muted">멘토가 게임을 시작하면 자동으로 표시됩니다.</p></div>
        )}
      </div>
    </main>
  );
}
