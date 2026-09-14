"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useParams } from "next/navigation";
import { useAnonymousAuth } from "@/hooks/use-anonymous-auth";
import { useRoomState } from "@/hooks/use-room-state";

export default function ArchivePage() {
  const params = useParams<{ roomCode: string }>();
  const roomCode = params.roomCode;
  const { ready } = useAnonymousAuth();
  const { state, loading, error } = useRoomState(roomCode, ready);

  const games = useMemo(() => {
    if (!state) return [];
    return state.games.slice().sort((a, b) => {
      const ta = state.teams.find((t) => t.id === a.team_id)?.sort_order ?? 99;
      const tb = state.teams.find((t) => t.id === b.team_id)?.sort_order ?? 99;
      return ta - tb || a.play_order - b.play_order;
    });
  }, [state]);

  if (!ready || loading) return <main className="page-shell"><div className="narrow card center"><div className="big-status">LOADING</div></div></main>;
  if (error || !state) return <main className="page-shell"><div className="narrow card"><div className="error">{error ?? "아카이브를 불러오지 못했습니다."}</div><Link href="/">처음으로</Link></div></main>;

  return (
    <main className="page-shell">
      <div className="container">
        <header className="topbar">
          <div className="brand">ARCHIVE<small>{state.session.title}</small></div>
          <div className="btn-row">
            <span className="pill">ROOM <span className="room-code">{roomCode}</span></span>
            {state.currentMembership.role === "host" && <Link className="btn" href={`/host/${roomCode}`}>멘토 화면</Link>}
          </div>
        </header>

        <div className="card">
          <h2>생성 결과</h2>
          <p className="muted">각 턴은 실제로 그 순간 존재했던 Context before/after를 보존합니다.</p>
        </div>


        <section className="card">
          <h2>팀별 결과 비교</h2>
          <p className="muted">같은 Prompt를 여러 팀이 수행했다면 생성 결과가 어떻게 달라졌는지 비교할 수 있습니다.</p>
          {state.prompts.map((prompt) => {
            const related = games.filter((game) => game.prompt_card_id === prompt.id || game.play_order === prompt.sort_order);
            return (
              <div key={prompt.id} style={{ marginTop: 18 }}>
                <div className="label">PROMPT {prompt.sort_order}</div>
                <div className="prompt-box">
                  <div className="eyebrow">{prompt.title}</div>
                  <div className="prompt-text" style={{ fontSize: 18 }}>{prompt.prompt_text}</div>
                </div>
                <div className="grid grid-3" style={{ marginTop: 12 }}>
                  {related.map((game) => {
                    const team = state.teams.find((t) => t.id === game.team_id);
                    return (
                      <div className="list-item" key={game.id} style={{ alignItems: "flex-start" }}>
                        <div className="list-main">
                          <div className="list-title">{team?.name}</div>
                          <div className="list-sub" style={{ fontSize: 14, color: "var(--text)", marginTop: 8 }}>{game.generated_text}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>

                {games.map((game) => {
          const team = state.teams.find((t) => t.id === game.team_id);
          const turns = state.turns.filter((turn) => turn.game_run_id === game.id).sort((a, b) => a.turn_number - b.turn_number);
          return (
            <section className="card" key={game.id}>
              <div className="game-header">
                <div>
                  <span className="pill">{team?.name}</span>{" "}
                  <span className="pill">GAME {game.play_order}</span>{" "}
                  <span className={`pill ${game.phase === "complete" ? "ok" : ""}`}>{game.phase.toUpperCase()}</span>
                </div>
              </div>
              <div className="prompt-box">
                <div className="eyebrow">USER PROMPT</div>
                <div className="prompt-text">{game.prompt_text_snapshot}</div>
              </div>
              <div className="sep" />
              <div className="label">SEED</div>
              <p>{game.seed_text_snapshot}</p>
              <div className="label">FINAL RESPONSE</div>
              <p style={{ fontSize: 22, lineHeight: 1.65, fontWeight: 800 }}>{game.generated_text}</p>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>TURN</th><th>LAP</th><th>생성자</th><th>상태</th><th>출력</th><th>Context before → after</th>
                    </tr>
                  </thead>
                  <tbody>
                    {turns.length === 0 && <tr><td colSpan={6} className="muted">아직 기록된 턴이 없습니다.</td></tr>}
                    {turns.map((turn) => {
                      const player = state.memberships.find((m) => m.id === turn.player_membership_id);
                      return (
                        <tr key={turn.id}>
                          <td>{turn.turn_number}</td>
                          <td>{turn.lap_number}</td>
                          <td>{player?.display_name ?? `${turn.player_order}번`}</td>
                          <td>{turn.phase} / {turn.outcome}</td>
                          <td>{turn.raw_text ?? "—"}</td>
                          <td><span className="muted">{turn.context_before}</span> → <strong>{turn.context_after}</strong></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
