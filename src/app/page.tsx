"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAnonymousAuth } from "@/hooks/use-anonymous-auth";
import { postJson } from "@/lib/api/client";
import { friendlyError } from "@/lib/api/errors";

export default function HomePage() {
  const router = useRouter();
  const { ready, error: authError } = useAnonymousAuth();
  const [title, setTitle] = useState("생성형 AI 세 글자 게임");
  const [teamCount, setTeamCount] = useState(2);
  const [teamSizes, setTeamSizes] = useState([4, 4]);
  const [roomCode, setRoomCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const normalizedCode = useMemo(() => roomCode.replace(/\D/g, "").slice(0, 6), [roomCode]);

  function changeTeamCount(next: number) {
    const safe = Math.max(1, Math.min(8, next));
    setTeamCount(safe);
    setTeamSizes((current) => Array.from({ length: safe }, (_, i) => current[i] ?? 4));
  }

  async function createSession(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setBusy("create");
    setMessage(null);
    try {
      const payload = await postJson<{ session: { room_code: string } }>("/api/sessions", {
        title,
        teamSizes,
      });
      router.push(`/host/${payload.session.room_code}`);
    } catch (e) {
      setMessage(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  async function joinSession(event: FormEvent) {
    event.preventDefault();
    if (!ready || normalizedCode.length < 4) return;
    setBusy("join");
    setMessage(null);
    try {
      await postJson(`/api/rooms/${normalizedCode}/join`, { displayName });
      router.push(`/play/${normalizedCode}`);
    } catch (e) {
      setMessage(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="page-shell">
      <div className="container">
        <section className="hero">
          <div className="pill">AI MENTORING · AUTOREGRESSIVE GENERATION</div>
          <h1>세 글자<br />생성 게임</h1>
          <p>
            여러 명이 하나의 생성형 AI가 되어, 공개된 Prompt와 누적 Context를 보고 다음 세 글자를 차례로 생성합니다.
            실제 토큰을 그대로 재현하는 게임이 아니라 자동회귀 생성의 핵심 흐름을 체험하기 위한 시뮬레이션입니다.
          </p>
        </section>

        {authError && <div className="error">익명 인증 실패: {authError}. Supabase에서 Anonymous Sign-ins를 활성화했는지 확인하세요.</div>}
        {message && <div className="error" style={{ marginBottom: 18 }}>{message}</div>}

        <div className="grid grid-2">
          <form className="card" onSubmit={createSession}>
            <h2>멘토 · 새 세션 만들기</h2>
            <div className="field">
              <label className="label">세션 이름</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
            </div>
            <div className="field">
              <label className="label">팀 수</label>
              <input
                className="input"
                type="number"
                min={1}
                max={8}
                value={teamCount}
                onChange={(e) => changeTeamCount(Number(e.target.value))}
              />
            </div>
            <div className="grid grid-2">
              {teamSizes.map((size, index) => (
                <div className="field" key={index}>
                  <label className="label">TEAM {String.fromCharCode(65 + index)} 생성자 수</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={12}
                    value={size}
                    onChange={(e) => {
                      const next = [...teamSizes];
                      next[index] = Math.max(1, Math.min(12, Number(e.target.value) || 1));
                      setTeamSizes(next);
                    }}
                  />
                </div>
              ))}
            </div>
            <button className="btn btn-primary" disabled={!ready || busy !== null || !title.trim()}>
              {busy === "create" ? "생성 중…" : "세션 생성"}
            </button>
            <p className="help">방 코드는 자동 발급됩니다. 각 팀의 입력한 인원 수가 한 바퀴의 생성 기회 수가 됩니다.</p>
          </form>

          <form className="card" onSubmit={joinSession}>
            <h2>생성자 · 방 참가</h2>
            <div className="field">
              <label className="label">방 코드</label>
              <input
                className="input room-code"
                inputMode="numeric"
                placeholder="7063"
                value={normalizedCode}
                onChange={(e) => setRoomCode(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="label">이름 또는 닉네임</label>
              <input
                className="input"
                placeholder="예: 민수"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={30}
              />
            </div>
            <button
              className="btn btn-primary"
              disabled={!ready || busy !== null || normalizedCode.length < 4 || !displayName.trim()}
            >
              {busy === "join" ? "참가 중…" : "게임 참가"}
            </button>
            <p className="help">빈자리가 있는 팀에 자동 배정됩니다. 참가 후 준비 완료 버튼을 눌러주세요.</p>
          </form>
        </div>
      </div>
    </main>
  );
}
