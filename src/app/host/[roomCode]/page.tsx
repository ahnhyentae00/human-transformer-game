"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { GameStage } from "@/components/game-stage";
import { useAnonymousAuth } from "@/hooks/use-anonymous-auth";
import { useRoomState } from "@/hooks/use-room-state";
import { useTurnTimer } from "@/hooks/use-turn-timer";
import { useTurnStart } from "@/hooks/use-turn-start";
import { deleteJson, patchJson, postJson } from "@/lib/api/client";
import { friendlyError } from "@/lib/api/errors";
import { countEffectiveCharacters } from "@/lib/text/three-char";
import type { GameRun } from "@/types/game";

export default function HostRoomPage() {
  const params = useParams<{ roomCode: string }>();
  const roomCode = params.roomCode;
  const { ready: authReady, error: authError } = useAnonymousAuth();
  const { state, loading, error, refresh } = useRoomState(roomCode, authReady);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [promptTitle, setPromptTitle] = useState("");
  const [promptText, setPromptText] = useState("");
  const [seedText, setSeedText] = useState("");
  const [endingLap, setEndingLap] = useState(3);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [presentationMode, setPresentationMode] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioName, setAudioName] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.55);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previousPhaseRef = useRef<string | null>(null);

  const activeGame = useMemo(() => {
    if (!state?.session.active_game_run_id) return null;
    return state.games.find((g) => g.id === state.session.active_game_run_id) ?? null;
  }, [state]);

  const onTimeout = useCallback(async () => {
    if (!activeGame || activeGame.is_paused || !(activeGame.phase === "playing" || activeGame.phase === "ending")) return;
    try {
      await postJson(`/api/games/${activeGame.id}/timeout`, { expectedVersion: activeGame.version });
      await refresh();
    } catch {
      // PLAYER와 HOST가 동시에 timeout을 감지할 수 있다. stale/version 충돌은 정상적인 race다.
    }
  }, [activeGame, refresh]);

  const turnStart = useTurnStart(activeGame?.turn_started_at ?? null, activeGame?.version ?? -1);

  const progress = useTurnTimer(
    activeGame?.turn_deadline_at ?? null,
    activeGame?.timer_duration_ms ?? 7000,
    activeGame?.version ?? -1,
    onTimeout,
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioEnabled || !audioUrl) return;
    const shouldPlay = activeGame && !activeGame.is_paused && ["playing", "ending_notice", "ending"].includes(activeGame.phase);
    if (shouldPlay) {
      void audio.play().catch(() => undefined);
    } else {
      audio.pause();
      if (activeGame?.phase === "result" || !activeGame) audio.currentTime = 0;
    }
  }, [activeGame?.phase, audioEnabled, audioUrl, activeGame, presentationMode]);


  useEffect(() => {
    const phase = activeGame?.phase ?? null;
    const previous = previousPhaseRef.current;
    previousPhaseRef.current = phase;
    if (phase !== "ending_notice" || previous === "ending_notice") return;

    // MAIN 화면에서만 짧은 경고음을 합성한다. 외부 음원 파일은 필요하지 않다.
    try {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.42);
      gain.connect(ctx.destination);

      [0, 0.2].forEach((offset, index) => {
        const osc = ctx.createOscillator();
        osc.type = "square";
        osc.frequency.value = index === 0 ? 740 : 520;
        osc.connect(gain);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.18);
      });
      window.setTimeout(() => void ctx.close(), 700);
    } catch {
      // 오디오 정책 또는 브라우저 미지원 시 시각 경고만 사용한다.
    }
  }, [activeGame?.phase]);

  useEffect(() => () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  useEffect(() => {
    const syncFullscreen = () => {
      if (!document.fullscreenElement) setPresentationMode(false);
    };
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  async function runAction(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setActionError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setActionError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  function resetPromptForm() {
    setEditingPromptId(null);
    setPromptTitle("");
    setPromptText("");
    setSeedText("");
    setEndingLap(3);
  }

  async function savePrompt(event: FormEvent) {
    event.preventDefault();
    await runAction(editingPromptId ? `prompt-edit-${editingPromptId}` : "prompt", async () => {
      const payload = { title: promptTitle, promptText, seedText, endingLap };
      if (editingPromptId) {
        await patchJson(`/api/prompts/${editingPromptId}`, payload);
      } else {
        await postJson(`/api/rooms/${roomCode}/prompts`, payload);
      }
      resetPromptForm();
    });
  }

  function beginPromptEdit(promptId: string) {
    const prompt = state?.prompts.find((item) => item.id === promptId);
    if (!prompt) return;
    setEditingPromptId(prompt.id);
    setPromptTitle(prompt.title);
    setPromptText(prompt.prompt_text);
    setSeedText(prompt.seed_text);
    setEndingLap(prompt.ending_lap);
    window.setTimeout(() => document.getElementById("prompt-editor")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  async function enterPresentation() {
    setPresentationMode(true);
    try { await document.documentElement.requestFullscreen?.(); } catch { /* 브라우저 정책상 실패해도 포커스 모드는 유지 */ }
  }

  async function exitPresentation() {
    setPresentationMode(false);
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch { /* ignore */ }
    }
  }

  async function assignPlayer(membershipId: string, slot: string) {
    const [teamId, orderText] = slot.split(":");
    await runAction(`assign-${membershipId}`, () =>
      postJson(`/api/memberships/${membershipId}/assignment`, {
        teamId,
        playerOrder: Number(orderText),
      }),
    );
  }

  if (!authReady || loading) {
    return <main className="page-shell"><div className="narrow card center"><div className="big-status">LOADING</div></div></main>;
  }

  if (authError || error || !state) {
    return <main className="page-shell"><div className="narrow card"><div className="error">{authError ?? error ?? "세션을 불러오지 못했습니다."}</div><p><Link href="/">처음으로</Link></p></div></main>;
  }

  if (state.currentMembership.role !== "host") {
    return <main className="page-shell"><div className="narrow card"><div className="error">이 화면은 멘토 전용입니다.</div><p><Link href={`/play/${roomCode}`}>생성자 화면으로 이동</Link></p></div></main>;
  }

  const anyStarted = state.games.some((g) => !["queued", "ready"].includes(g.phase));
  const seedCount = countEffectiveCharacters(seedText);

  const presentationReadyGames = state.games
    .slice()
    .sort((a, b) => {
      const ta = state.teams.find((t) => t.id === a.team_id)?.sort_order ?? 99;
      const tb = state.teams.find((t) => t.id === b.team_id)?.sort_order ?? 99;
      return ta - tb || a.play_order - b.play_order;
    })
    .filter((game) => {
      if (!["queued", "ready"].includes(game.phase)) return false;
      const readyCount = state.memberships.filter((m) => m.role === "player" && m.team_id === game.team_id && m.is_ready).length;
      const previousComplete = !state.games.some((g) => g.team_id === game.team_id && g.play_order < game.play_order && g.phase !== "complete");
      return readyCount === game.player_count_snapshot && previousComplete;
    });

  if (presentationMode) {
    return (
      <main className="presentation-shell">
        <audio ref={audioRef} src={audioUrl ?? undefined} loop preload="auto" />
        <div className="presentation-topline">
          <div className="brand">세 글자 생성 게임<small>{state.session.title}</small></div>
          <div className="btn-row">
            <span className="pill">ROOM <span className="room-code">{roomCode}</span></span>
            <button className="btn btn-ghost" onClick={() => void exitPresentation()}>수업 화면 종료</button>
          </div>
        </div>

        <div className="presentation-stage-wrap">
          {state.session.status === "complete" && !activeGame ? (
            <div className="presentation-lobby center">
              <span className="pill ok">SESSION COMPLETE</span>
              <div className="presentation-title">모든 게임 완료</div>
              <p className="muted">아카이브에서 팀별 Prompt와 생성 결과를 비교하세요.</p>
            </div>
          ) : activeGame ? (
            <GameStage
              game={activeGame}
              memberships={state.memberships}
              teams={state.teams}
              timerProgress={progress}
              turnStarted={turnStart.started}
              startCountdownLabel={turnStart.countdownLabel}
              presentation
            />
          ) : (
            <div className="presentation-lobby center">
              <div className="label">CLASSROOM MAIN</div>
              <div className="presentation-title">게임 시작 대기</div>
              <p className="muted">생성자들은 방 코드 <strong className="room-code">{roomCode}</strong>로 참가합니다.</p>
              <div className="presentation-ready-grid">
                {state.teams.map((team) => {
                  const readyCount = state.memberships.filter((m) => m.role === "player" && m.team_id === team.id && m.is_ready).length;
                  return (
                    <div className="presentation-ready-card" key={team.id}>
                      <strong>{team.name}</strong>
                      <span>{readyCount} / {team.expected_player_count} READY</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="presentation-dock" aria-label="멘토 빠른 제어">
          {actionError && <span className="dock-error">{actionError}</span>}
          {!activeGame && presentationReadyGames.slice(0, 3).map((game) => {
            const team = state.teams.find((t) => t.id === game.team_id);
            return (
              <button
                className="btn btn-primary"
                key={game.id}
                disabled={busy !== null}
                onClick={() => runAction(`start-${game.id}`, () => postJson(`/api/games/${game.id}/start`))}
              >{team?.name} · GAME {game.play_order} 시작</button>
            );
          })}
          {activeGame && ["playing", "ending"].includes(activeGame.phase) && (
            activeGame.is_paused ? (
              <button className="btn btn-primary" disabled={busy !== null} onClick={() => runAction("resume", () => postJson(`/api/games/${activeGame.id}/resume`, { expectedVersion: activeGame.version }))}>재개</button>
            ) : (
              <button className="btn btn-ghost" disabled={busy !== null || !turnStart.started} onClick={() => runAction("pause", () => postJson(`/api/games/${activeGame.id}/pause`, { expectedVersion: activeGame.version }))}>일시정지</button>
            )
          )}
          {activeGame && ["playing", "ending"].includes(activeGame.phase) && (
            <button className="btn btn-ghost" disabled={busy !== null} onClick={() => runAction("restart-turn", () => postJson(`/api/games/${activeGame.id}/restart-turn`, { expectedVersion: activeGame.version }))}>현재 턴 재시작</button>
          )}
          {activeGame && ["playing", "ending"].includes(activeGame.phase) && (
            <button className="btn btn-ghost" disabled={busy !== null} onClick={() => {
              if (!window.confirm("현재 생성자의 턴을 건너뛰고 다음 생성자로 이동할까요? 이 턴은 SKIPPED로 기록됩니다.")) return;
              void runAction("skip", () => postJson(`/api/games/${activeGame.id}/skip`, { expectedVersion: activeGame.version }));
            }}>턴 건너뛰기</button>
          )}
          {activeGame?.phase === "playing" && (
            <button className="btn btn-warn" disabled={busy !== null} onClick={() => runAction("ending", () => postJson(`/api/games/${activeGame.id}/ending/trigger`))}>종료 지령</button>
          )}
          {activeGame?.phase === "ending_notice" && (
            <button className="btn btn-primary" disabled={busy !== null} onClick={() => runAction("ack", () => postJson(`/api/games/${activeGame.id}/ending/ack`))}>마지막 한 바퀴 시작</button>
          )}
          {activeGame && ["playing", "ending_notice", "ending"].includes(activeGame.phase) && (
            <button className="btn btn-danger" disabled={busy !== null} onClick={() => runAction("finish", () => postJson(`/api/games/${activeGame.id}/finish`))}>응답 완성</button>
          )}
          {activeGame?.phase === "result" && !activeGame.result_revealed && (
            <button className="btn btn-primary" disabled={busy !== null} onClick={() => runAction("reveal", () => postJson(`/api/games/${activeGame.id}/result/reveal`))}>결과 공개</button>
          )}
          {activeGame?.phase === "result" && activeGame.result_revealed && (
            <button className="btn btn-primary" disabled={busy !== null} onClick={() => runAction("complete", () => postJson(`/api/games/${activeGame.id}/complete`))}>다음 게임 준비</button>
          )}
          {audioUrl && (
            <button className="btn btn-ghost" onClick={() => {
              setAudioEnabled((v) => !v);
              if (audioEnabled) audioRef.current?.pause();
              else void audioRef.current?.play().catch(() => undefined);
            }}>{audioEnabled ? "BGM OFF" : "BGM ON"}</button>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <audio ref={audioRef} src={audioUrl ?? undefined} loop preload="auto" />
      <div className="container">
        <header className="topbar">
          <div className="brand">세 글자 생성 게임<small>{state.session.title}</small></div>
          <div className="btn-row">
            <span className="pill">ROOM <span className="room-code">{roomCode}</span></span>
            <button className="btn btn-primary" onClick={() => void enterPresentation()}>수업 화면</button>
            <Link className="btn btn-ghost" href={`/archive/${roomCode}`}>아카이브</Link>
          </div>
        </header>

        {(actionError || error) && <div className="error" style={{ marginBottom: 18 }}>{actionError ?? error}</div>}

        {state.session.status === "complete" && !activeGame ? (
          <div className="card center">
            <span className="pill ok">SESSION COMPLETE</span>
            <div className="big-status" style={{ marginTop: 16 }}>모든 게임 완료</div>
            <p className="muted">모든 팀의 작은 게임이 끝났습니다. 아카이브에서 Prompt와 생성 결과를 비교하세요.</p>
            <Link className="btn btn-primary" href={`/archive/${roomCode}`}>전체 결과 보기</Link>
          </div>
        ) : activeGame ? (
          <>
            <GameStage
              game={activeGame}
              memberships={state.memberships}
              teams={state.teams}
              timerProgress={progress}
              turnStarted={turnStart.started}
              startCountdownLabel={turnStart.countdownLabel}
            />

            <div className="card">
              <div className="game-header">
                <h3 style={{ margin: 0 }}>멘토 운영 제어</h3>
                <span className="pill">PHASE · {activeGame.phase.toUpperCase()}</span>
              </div>
              <div className="btn-row">
                {["playing", "ending"].includes(activeGame.phase) && (
                  activeGame.is_paused ? (
                    <button
                      className="btn btn-primary"
                      disabled={busy !== null}
                      onClick={() => runAction("resume", () => postJson(`/api/games/${activeGame.id}/resume`, { expectedVersion: activeGame.version }))}
                    >게임 재개</button>
                  ) : (
                    <button
                      className="btn btn-ghost"
                      disabled={busy !== null || !turnStart.started}
                      onClick={() => runAction("pause", () => postJson(`/api/games/${activeGame.id}/pause`, { expectedVersion: activeGame.version }))}
                    >일시정지</button>
                  )
                )}
                {["playing", "ending"].includes(activeGame.phase) && (
                  <button
                    className="btn btn-ghost"
                    disabled={busy !== null}
                    onClick={() => runAction("restart-turn", () => postJson(`/api/games/${activeGame.id}/restart-turn`, { expectedVersion: activeGame.version }))}
                  >현재 턴 7초 다시 시작</button>
                )}
                {["playing", "ending"].includes(activeGame.phase) && (
                  <button
                    className="btn btn-ghost"
                    disabled={busy !== null}
                    onClick={() => {
                      if (!window.confirm("현재 생성자의 턴을 건너뛰고 다음 생성자로 이동할까요? 이 턴은 SKIPPED로 기록됩니다.")) return;
                      void runAction("skip", () => postJson(`/api/games/${activeGame.id}/skip`, { expectedVersion: activeGame.version }));
                    }}
                  >현재 생성자 건너뛰기</button>
                )}
                {activeGame.phase === "playing" && (
                  <button
                    className="btn btn-warn"
                    disabled={busy !== null}
                    onClick={() => runAction("ending", () => postJson(`/api/games/${activeGame.id}/ending/trigger`))}
                  >종료 지령 즉시 발동</button>
                )}
                {activeGame.phase === "ending_notice" && (
                  <button
                    className="btn btn-primary"
                    disabled={busy !== null}
                    onClick={() => runAction("ack", () => postJson(`/api/games/${activeGame.id}/ending/ack`))}
                  >마지막 한 바퀴 시작</button>
                )}
                {["playing", "ending_notice", "ending"].includes(activeGame.phase) && (
                  <button
                    className="btn btn-danger"
                    disabled={busy !== null}
                    onClick={() => runAction("finish", () => postJson(`/api/games/${activeGame.id}/finish`))}
                  >응답 완성 · 조기 종료</button>
                )}
                {activeGame.phase === "result" && !activeGame.result_revealed && (
                  <button
                    className="btn btn-primary"
                    disabled={busy !== null}
                    onClick={() => runAction("reveal", () => postJson(`/api/games/${activeGame.id}/result/reveal`))}
                  >결과 공개</button>
                )}
                {activeGame.phase === "result" && activeGame.result_revealed && (
                  <button
                    className="btn btn-primary"
                    disabled={busy !== null}
                    onClick={() => runAction("complete", () => postJson(`/api/games/${activeGame.id}/complete`))}
                  >결과 확정 · 다음 게임 준비</button>
                )}
              </div>
            </div>

            <div className="card">
              <div className="game-header">
                <h3 style={{ margin: 0 }}>최근 생성 기록</h3>
                <span className="pill">최근 5턴</span>
              </div>
              <div className="list">
                {state.turns
                  .filter((turn) => turn.game_run_id === activeGame.id)
                  .slice()
                  .sort((a, b) => b.turn_number - a.turn_number)
                  .slice(0, 5)
                  .map((turn) => {
                    const player = state.memberships.find((m) => m.id === turn.player_membership_id);
                    return (
                      <div className="list-item" key={turn.id}>
                        <div className="list-main">
                          <div className="list-title">TURN {turn.turn_number} · {player?.display_name ?? `${turn.player_order}번 생성자`}</div>
                          <div className="list-sub">LAP {turn.lap_number} · {turn.outcome.toUpperCase()}</div>
                        </div>
                        <strong>{turn.raw_text ?? "—"}</strong>
                      </div>
                    );
                  })}
                {state.turns.filter((turn) => turn.game_run_id === activeGame.id).length === 0 && (
                  <div className="muted">아직 완료된 턴이 없습니다.</div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="card center">
            <div className="label">MAIN DISPLAY</div>
            <div className="big-status">게임 대기 중</div>
            <p className="muted">아래에서 프롬프트와 게임 구성을 준비한 뒤 시작할 팀의 게임을 선택하세요.</p>
          </div>
        )}

        <div className="grid grid-2" style={{ marginTop: 18 }}>
          <section className="card">
            <div className="game-header">
              <h2 style={{ margin: 0 }}>참가 현황</h2>
              {!anyStarted && <span className="pill">멘토가 팀/순번 변경 가능</span>}
            </div>
            <div className="team-roster-grid">
              {state.teams.map((team) => {
                const players = state.memberships
                  .filter((m) => m.role === "player" && m.team_id === team.id)
                  .sort((a, b) => (a.player_order ?? 0) - (b.player_order ?? 0));
                const readyCount = players.filter((p) => p.is_ready).length;
                return (
                  <div className="team-roster" key={team.id}>
                    <div className="team-roster-head">
                      <div>
                        <div className="list-title">{team.name}</div>
                        <div className="list-sub">{players.length}/{team.expected_player_count}명 · 준비 {readyCount}/{team.expected_player_count}</div>
                      </div>
                      <span className={`pill ${readyCount === team.expected_player_count ? "ok" : ""}`}>{readyCount === team.expected_player_count ? "READY" : "WAIT"}</span>
                    </div>
                    <div className="roster-slots">
                      {Array.from({ length: team.expected_player_count }, (_, slotIndex) => {
                        const order = slotIndex + 1;
                        const player = players.find((p) => p.player_order === order);
                        if (!player) {
                          return <div className="roster-slot empty" key={order}><span>{order}</span><span>빈 자리</span></div>;
                        }
                        return (
                          <div className="roster-slot" key={player.id}>
                            <div className="roster-player">
                              <span className="slot-number">{order}</span>
                              <strong>{player.display_name}</strong>
                              <span className={`status-dot ${player.is_ready ? "ready" : ""}`} title={player.is_ready ? "준비 완료" : "대기"} />
                            </div>
                            <select
                              className="select roster-select"
                              value={`${team.id}:${order}`}
                              disabled={anyStarted || busy !== null}
                              aria-label={`${player.display_name} 팀과 순번 변경`}
                              onChange={(e) => void assignPlayer(player.id, e.target.value)}
                            >
                              {state.teams.flatMap((targetTeam) =>
                                Array.from({ length: targetTeam.expected_player_count }, (_, targetIndex) => {
                                  const targetOrder = targetIndex + 1;
                                  const occupant = state.memberships.find(
                                    (m) => m.role === "player" && m.team_id === targetTeam.id && m.player_order === targetOrder,
                                  );
                                  return (
                                    <option key={`${targetTeam.id}:${targetOrder}`} value={`${targetTeam.id}:${targetOrder}`}>
                                      {targetTeam.name} · {targetOrder}번{occupant && occupant.id !== player.id ? ` ↔ ${occupant.display_name}` : ""}
                                    </option>
                                  );
                                }),
                              )}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="help">게임 시작 전에는 멘토가 참가자를 다른 팀/순번으로 이동할 수 있습니다. 이미 차지된 자리를 선택하면 두 생성자의 자리를 서로 교환합니다. 자리 변경 시 두 사람의 READY는 해제됩니다.</p>
          </section>

          <section className="card">
            <h2>메인 화면 BGM</h2>
            <div className="audio-panel">
              <label className="btn">
                음악 파일 선택
                <input
                  type="file"
                  accept="audio/*"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (audioUrl) URL.revokeObjectURL(audioUrl);
                    setAudioUrl(URL.createObjectURL(file));
                    setAudioName(file.name);
                    setAudioEnabled(true);
                  }}
                />
              </label>
              <button className="btn" disabled={!audioUrl} onClick={() => {
                setAudioEnabled((v) => !v);
                if (audioEnabled) audioRef.current?.pause();
                else void audioRef.current?.play().catch(() => undefined);
              }}>{audioEnabled ? "BGM 끄기" : "BGM 켜기"}</button>
              <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
            </div>
            <p className="help">{audioName ? `선택됨: ${audioName}` : "로컬 음악 파일을 선택하면 이 메인 화면에서만 반복 재생됩니다. PLAYER 브라우저에는 오디오가 없습니다."}</p>
          </section>
        </div>

        <div className="grid grid-2" style={{ marginTop: 18 }}>
          <section className="card">
            <h2>프롬프트 카드</h2>
            <form id="prompt-editor" onSubmit={savePrompt}>
              <div className="field">
                <label className="label">제목</label>
                <input className="input" value={promptTitle} onChange={(e) => setPromptTitle(e.target.value)} placeholder="예: 판타지 이야기" disabled={anyStarted} />
              </div>
              <div className="field">
                <label className="label">사용자 Prompt</label>
                <textarea className="textarea" value={promptText} onChange={(e) => setPromptText(e.target.value)} placeholder="용기를 주제로 한 짧은 판타지 이야기를 만들어줘." disabled={anyStarted} />
              </div>
              <div className="grid grid-2">
                <div className="field">
                  <label className="label">첫 세 글자 · Seed</label>
                  <input className="input" value={seedText} onChange={(e) => setSeedText(e.target.value)} placeholder="어느날" disabled={anyStarted} />
                  <div className={`char-count ${seedCount === 3 ? "valid" : seedCount > 3 ? "invalid" : ""}`}>{seedCount} / 3</div>
                </div>
                <div className="field">
                  <label className="label">종료 지령 시작 바퀴</label>
                  <input className="input" type="number" min={1} max={20} value={endingLap} onChange={(e) => setEndingLap(Number(e.target.value))} disabled={anyStarted} />
                </div>
              </div>
              <div className="btn-row">
                <button className="btn btn-primary" disabled={busy !== null || anyStarted || !promptText.trim() || seedCount !== 3}>
                  {editingPromptId ? "프롬프트 수정 저장" : "프롬프트 저장"}
                </button>
                {editingPromptId && (
                  <button type="button" className="btn btn-ghost" disabled={busy !== null} onClick={resetPromptForm}>수정 취소</button>
                )}
              </div>
            </form>

            <div className="sep" />
            <div className="list">
              {state.prompts.length === 0 && <div className="muted">등록된 프롬프트가 없습니다.</div>}
              {state.prompts.map((prompt) => (
                <div className="list-item" key={prompt.id}>
                  <div className="list-main">
                    <div className="list-title">{prompt.sort_order}. {prompt.title}</div>
                    <div className="list-sub">{prompt.prompt_text}<br />Seed: {prompt.seed_text} · Ending: LAP {prompt.ending_lap}</div>
                  </div>
                  <div className="btn-row">
                    <button
                      className="btn btn-ghost"
                      disabled={busy !== null || anyStarted}
                      onClick={() => beginPromptEdit(prompt.id)}
                    >수정</button>
                    <button
                      className="btn btn-danger"
                      disabled={busy !== null || anyStarted}
                      onClick={() => runAction(`delete-${prompt.id}`, () => deleteJson(`/api/prompts/${prompt.id}`))}
                    >삭제</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="sep" />
            <button
              className="btn btn-primary"
              disabled={busy !== null || anyStarted || state.prompts.length === 0}
              onClick={() => runAction("prepare", () => postJson(`/api/rooms/${roomCode}/prepare-games`))}
            >모든 팀의 게임 구성 생성 / 갱신</button>
            <p className="help">현재 MVP에서는 모든 팀이 등록된 모든 프롬프트를 순서대로 플레이하도록 구성합니다.</p>
          </section>

          <section className="card">
            <h2>게임 큐</h2>
            <div className="list">
              {state.games.length === 0 && <div className="muted">게임 구성을 생성하면 여기에 팀별 게임이 나타납니다.</div>}
              {state.games
                .slice()
                .sort((a, b) => {
                  const ta = state.teams.find((t) => t.id === a.team_id)?.sort_order ?? 99;
                  const tb = state.teams.find((t) => t.id === b.team_id)?.sort_order ?? 99;
                  return ta - tb || a.play_order - b.play_order;
                })
                .map((game: GameRun) => {
                  const team = state.teams.find((t) => t.id === game.team_id);
                  const readyCount = state.memberships.filter((m) => m.role === "player" && m.team_id === game.team_id && m.is_ready).length;
                  const previousComplete = !state.games.some((g) => g.team_id === game.team_id && g.play_order < game.play_order && g.phase !== "complete");
                  const canStart = !activeGame && ["queued", "ready"].includes(game.phase) && readyCount === game.player_count_snapshot && previousComplete;
                  return (
                    <div className="list-item" key={game.id}>
                      <div className="list-main">
                        <div className="list-title">{team?.name} · GAME {game.play_order}</div>
                        <div className="list-sub">{game.prompt_text_snapshot}<br />상태: {game.phase} · 준비 {readyCount}/{game.player_count_snapshot}</div>
                      </div>
                      {["queued", "ready"].includes(game.phase) ? (
                        <button
                          className="btn btn-primary"
                          disabled={!canStart || busy !== null}
                          onClick={() => {
                            if (audioEnabled && audioRef.current) void audioRef.current.play().catch(() => undefined);
                            void runAction(`start-${game.id}`, () => postJson(`/api/games/${game.id}/start`));
                          }}
                        >START</button>
                      ) : (
                        <span className={`pill ${game.phase === "complete" ? "ok" : game.phase === "result" ? "warn" : ""}`}>{game.phase.toUpperCase()}</span>
                      )}
                    </div>
                  );
                })}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
