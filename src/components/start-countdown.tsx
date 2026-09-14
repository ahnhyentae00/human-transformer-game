"use client";

export function StartCountdown({ label }: { label: string | null }) {
  if (!label) return null;
  return (
    <div className="start-countdown" role="status" aria-live="polite">
      <div className="start-countdown-ring" />
      <div className="start-countdown-copy">
        <div className="start-countdown-eyebrow">GENERATION START</div>
        <div className="start-countdown-number" key={label}>{label}</div>
        <div className="start-countdown-help">Prompt와 현재 Context를 확인하세요.</div>
      </div>
    </div>
  );
}
