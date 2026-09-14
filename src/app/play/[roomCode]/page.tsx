"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { GameStage } from "@/components/game-stage";
import { useAnonymousAuth } from "@/hooks/use-anonymous-auth";
import { useRoomState } from "@/hooks/use-room-state";
import { useTurnTimer } from "@/hooks/use-turn-timer";
import { useTurnStart } from "@/hooks/use-turn-start";
import { postJson } from "@/lib/api/client";
import { friendlyError } from "@/lib/api/errors";
import { activeLap, activePlayerOrder, isTurnActive } from "@/lib/game/state-machine";
import { countEffectiveCharacters } from "@/lib/text/three-char";

export default function PlayerRoomPage() {
  const params = useParams<{ roomCode: string }>();
  const roomCode = params.roomCode;
  const { ready: authReady, error: authError } = useAnonymousAuth();
  const { state, loading, error, refresh } = useRoomState(roomCode, authReady);
  const [text, setText] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const wasMyTurnRef = useRef(false);

  const activeGame = useMemo(() => {
    if (!state?.session.active_game_run_id) return null;
    return state.games.find((g) => g.id === state.session.active_game_run_id) ?? null;
  }, [state]);

  const turnStart = useTurnStart(activeGame?.turn_started_at ?? null, activeGame?.version ?? -1);

  const isMyTeamGame = Boolean(activeGame && state?.currentMembership.team_id === activeGame.team_id);
  const currentOrder = activeGame ? activePlayerOrder(activeGame.completed_turns, activeGame.player_count_snapshot) : null;
  const isMyTurn = Boolean(
    activeGame &&
      isMyTeamGame &&
      !activeGame.is_paused &&
      isTurnActive(activeGame.phase) &&
      turnStart.started &&
      state?.currentMembership.player_order === currentOrder,
  );

  useEffect(() => {
    if (isMyTurn && !wasMyTurnRef.current) {
      try { navigator.vibrate?.([70, 45, 70]); } catch { /* vibration is optional */ }
    }
    wasMyTurnRef.current = isMyTurn;
  }, [isMyTurn]);

  useEffect(() => {
    setText("");
    setIsComposing(false);
    setActionError(null);
  }, [activeGame?.version]);

  const onTimeout = useCallback(async () => {
    if (!activeGame || activeGame.is_paused || !isMyTeamGame || !isTurnActive(activeGame.phase)) return;
    try {
      await postJson(`/api/games/${activeGame.id}/timeout`, { expectedVersion: activeGame.version });
      await refresh();
    } catch {
      // HOST 또는 다른 클라이언트가 먼저 timeout을 확정했다면 무시한다.
    }
  }, [activeGame, isMyTeamGame, refresh]);

  const progress = useTurnTimer(
    activeGame?.turn_deadline_at ?? null,
    activeGame?.timer_duration_ms ?? 7000,
    activeGame?.version ?? -1,
    onTimeout,
  );

  async function toggleReady() {
    if (!state) return;
    setBusy(true);
    setActionError(null);
    try {
      await postJson(`/api/rooms/${roomCode}/ready`, { ready: !state.currentMembership.is_ready });
      await refresh();
    } catch (e) {
      setActionError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!activeGame || !isMyTurn || isComposing || countEffectiveCharacters(text) !== 3) return;
    setBusy(true);
    setActionError(null);
    try {
      await postJson(`/api/games/${activeGame.id}/turns`, {
        text,
        expectedVersion: activeGame.version,
      });
      setText("");
      await refresh();
    } catch (e) {
      setActionError(friendlyError(e));
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!authReady || loading) {
    return <main className="page-shell"><div className="narrow card center"><div className="big-status">CONNECTING</div></div></main>;
  }

  if (authError || error || !state) {
    return (
      <main className="page-shell">
        <div className="narrow card">
          <div className="error">{authError ?? error ?? "방 정보를 불러오지 못했습니다."}</div>
          <p className="muted">이 브라우저에서 아직 방에 참가하지 않았다면 처음 화면에서 방 코드와 이름을 입력해주세요.</p>
          <Link className="btn" href="/">처음으로</Link>
        </div>
      </main>
    );
  }

  if (state.currentMembership.role !== "player") {
    return <main className="page-shell"><div className="narrow card"><div className="error">이 화면은 생성자 전용입니다.</div><Link href={`/host/${roomCode}`}>멘토 화면</Link></div></main>;
  }

  const team = state.teams.find((t) => t.id === state.currentMembership.team_id);
  const effectiveCount = countEffectiveCharacters(text);
  const valid = effectiveCount === 3 && !isComposing;

  return (
    <main className="page-shell">
      <div className="narrow">
        <header className="topbar">
          <div className="brand">GENERATOR<small>{state.currentMembership.display_name} · {team?.name}</small></div>
          <span className="pill">ROOM <span className="room-code">{roomCode}</span></span>
        </header>

        {actionError && <div className="error" style={{ marginBottom: 16 }}>{actionError}</div>}

        {state.session.status === "complete" && !activeGame && (
          <section className="card center">
            <span className="pill ok">SESSION COMPLETE</span>
            <div className="big-status" style={{ marginTop: 16 }}>전체 게임 종료</div>
            <p className="muted">모든 팀의 생성이 완료되었습니다.</p>
            <Link className="btn" href={`/archive/${roomCode}`}>결과 아카이브 보기</Link>
          </section>
        )}

        {state.session.status !== "complete" && !state.currentMembership.is_ready && !activeGame && (
          <section className="card center">
            <div className="big-status">준비되셨나요?</div>
            <p className="muted">당신은 {team?.name}의 {state.currentMembership.player_order}번 생성자입니다.</p>
            <button className="btn btn-primary" disabled={busy} onClick={toggleReady}>준비 완료</button>
          </section>
        )}

        {state.session.status !== "complete" && state.currentMembership.is_ready && !activeGame && (
          <section className="card center">
            <span className="pill ok">READY</span>
            <div className="big-status" style={{ marginTop: 16 }}>게임 시작 대기</div>
            <p className="muted">멘토가 {team?.name}의 게임을 시작하면 이 화면이 자동으로 바뀝니다.</p>
            <button className="btn btn-ghost" disabled={busy} onClick={toggleReady}>준비 취소</button>
          </section>
        )}

        {activeGame && !isMyTeamGame && (
          <section className="card center">
            <span className="pill">다른 팀 플레이 중</span>
            <div className="big-status" style={{ marginTop: 16 }}>관전 대기</div>
            <p className="muted">현재는 {state.teams.find((t) => t.id === activeGame.team_id)?.name}의 게임입니다. 당신의 팀 차례가 오면 자동으로 전환됩니다.</p>
          </section>
        )}

        {activeGame && isMyTeamGame && (
          <>
            <GameStage
              game={activeGame}
              memberships={state.memberships}
              teams={state.teams}
              timerProgress={progress}
              turnStarted={turnStart.started}
              startCountdownLabel={turnStart.countdownLabel}
              compact
            />

            {activeGame.phase === "ending_notice" && (
              <div className="card center">
                <div className="pill warn">멈춤</div>
                <p>멘토가 마지막 한 바퀴를 시작할 때까지 기다리세요.</p>
              </div>
            )}

            {activeGame.is_paused && (
              <div className="card center pause-card">
                <div className="pill warn">PAUSED</div>
                <h2>잠시 멈췄습니다</h2>
                <p className="muted">입력하지 말고 기다려주세요. 멘토가 재개하면 남은 시간부터 계속됩니다.</p>
              </div>
            )}

            {isMyTurn && (
              <form className="card player-turn-card" onSubmit={submit}>
                <div className="center">
                  <div className="pill ok">당신의 차례</div>
                  <h2>다음 세 글자를 생성하세요</h2>
                </div>
                <input
                  className="input player-input"
                  autoFocus
                  maxLength={24}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onCompositionStart={() => setIsComposing(true)}
                  onCompositionEnd={(e) => {
                    setIsComposing(false);
                    setText(e.currentTarget.value);
                  }}
                  placeholder="세 글자"
                  aria-label="다음 세 글자"
                />
                <div className={`char-count ${valid ? "valid" : effectiveCount > 3 ? "invalid" : ""}`}>
                  {effectiveCount} / 3 {isComposing ? "· 입력 조합 중" : ""}
                </div>
                <button className="btn btn-primary" style={{ width: "100%", marginTop: 12 }} disabled={!valid || busy}>
                  생성 확정 <span className="kbd">Enter</span>
                </button>
                <p className="help center">공백과 문장부호는 글자 수에서 제외됩니다. 7초가 끝날 때 정확히 세 글자가 아니면 TIME OUT입니다.</p>
              </form>
            )}

            {!isMyTurn && isTurnActive(activeGame.phase) && turnStart.started && (
              <div className="card center">
                <span className="pill">WAIT</span>
                <h2>{currentOrder}번 생성자의 출력 대기 중</h2>
                <p className="muted">다른 생성자의 입력 내용은 확정되기 전까지 공개되지 않습니다.</p>
              </div>
            )}

          </>
        )}

        <footer className="center muted" style={{ margin: "24px 0" }}>
          {activeGame && isMyTeamGame ? `현재 LAP ${activeLap(activeGame.completed_turns, activeGame.player_count_snapshot)}` : "PLAYER CONTROLLER"}
        </footer>
      </div>
    </main>
  );
}
