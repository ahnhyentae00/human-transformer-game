"use client";

import { useEffect, useMemo, useState } from "react";

export function useTurnStart(startIso: string | null, version: number) {
  const startAt = useMemo(() => (startIso ? new Date(startIso).getTime() : null), [startIso]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    if (startAt === null || startAt <= Date.now()) return;

    const id = window.setInterval(() => {
      const nextNow = Date.now();
      setNow(nextNow);
      if (nextNow >= startAt) window.clearInterval(id);
    }, 50);

    return () => window.clearInterval(id);
  }, [startAt, version]);

  if (startAt === null) {
    return { started: false, remainingMs: 0, countdownLabel: null as string | null };
  }

  const remainingMs = Math.max(0, startAt - now);
  const started = remainingMs <= 0;
  const countdownLabel = started ? null : String(Math.max(1, Math.ceil(remainingMs / 1000)));

  return { started, remainingMs, countdownLabel };
}
