"use client";

import { GeneratedResponse } from "./generated-response";
import type { GameRun, TurnRow } from "@/types/game";

export function ResultReveal({ game, turns }: { game: GameRun; turns: TurnRow[] }) {
  if (!game.result_revealed) {
    return (
      <div className="result-wait card center">
        <div className="result-orbit" aria-hidden="true" />
        <span className="pill ok">GENERATION COMPLETE</span>
        <div className="big-status" style={{ marginTop: 18 }}>생성이 완료되었습니다</div>
        <p className="muted">멘토가 결과를 공개하면 Prompt와 최종 응답을 함께 비교합니다.</p>
      </div>
    );
  }

  return (
    <div className="result-reveal">
      <div className="result-reveal-title">
        <span className="pill ok">RESULT REVEALED</span>
        <h2>처음 요청과 우리가 만든 응답을 비교해보세요.</h2>
      </div>
      <div className="result-compare-grid">
        <div className="result-panel prompt-result-panel">
          <div className="eyebrow">USER PROMPT</div>
          <div className="result-main-text">{game.prompt_text_snapshot}</div>
        </div>
        <div className="result-arrow" aria-hidden="true">→</div>
        <div className="result-panel response-result-panel">
          <div className="eyebrow">GENERATED RESPONSE</div>
          <div className="result-main-text"><GeneratedResponse seedText={game.seed_text_snapshot} generatedText={game.generated_text} turns={turns} /></div>
          <div className="result-source-note">간격은 세 글자 생성 턴의 경계를 보여주기 위한 시각적 구분입니다. 저장된 원문은 그대로 유지됩니다.</div>
        </div>
      </div>
      <div className="reflection-row">
        <span>요청을 제대로 수행했나요?</span>
        <span>중간에 Prompt의 조건을 잊은 순간이 있었나요?</span>
        <span>같은 Prompt로 다시 하면 같은 결과가 나올까요?</span>
      </div>
    </div>
  );
}
