"use client";

export function TimerBar({ progress, ending = false }: { progress: number; ending?: boolean }) {
  return (
    <div className="timer-track" aria-label="턴 진행 시간">
      <div
        className={`timer-fill${ending ? " ending" : ""}`}
        style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }}
      />
    </div>
  );
}
