"use client";

import { useEffect, useRef, useState } from "react";
import { timerProgress } from "@/lib/game/timer";

export function useTurnTimer(
  deadlineIso: string | null,
  durationMs: number,
  version: number,
  onExpired?: () => void,
) {
  const [progress, setProgress] = useState(() => timerProgress(deadlineIso, durationMs));
  const expiredVersionRef = useRef<number | null>(null);
  const callbackRef = useRef(onExpired);
  callbackRef.current = onExpired;

  useEffect(() => {
    expiredVersionRef.current = null;
    setProgress(timerProgress(deadlineIso, durationMs));
    if (!deadlineIso) return;

    const tick = () => {
      const next = timerProgress(deadlineIso, durationMs);
      setProgress(next);
      if (next <= 0 && expiredVersionRef.current !== version) {
        expiredVersionRef.current = version;
        callbackRef.current?.();
      }
    };

    tick();
    const id = window.setInterval(tick, 70);
    return () => window.clearInterval(id);
  }, [deadlineIso, durationMs, version]);

  return progress;
}
