export const TURN_DURATION_MS = 7000;

export function timerProgress(deadlineIso: string | null, durationMs = TURN_DURATION_MS): number {
  if (!deadlineIso) return 0;
  const remaining = new Date(deadlineIso).getTime() - Date.now();
  return Math.min(1, Math.max(0, remaining / durationMs));
}

export function remainingMilliseconds(deadlineIso: string | null): number {
  if (!deadlineIso) return 0;
  return Math.max(0, new Date(deadlineIso).getTime() - Date.now());
}
