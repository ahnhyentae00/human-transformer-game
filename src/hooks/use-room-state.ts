"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { RoomState } from "@/types/game";

export function useRoomState(roomCode: string, enabled = true) {
  const [state, setState] = useState<RoomState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const response = await fetch(`/api/rooms/${roomCode}/state`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "ROOM_STATE_FAILED");
      if (!mounted.current) return;
      setState(payload as RoomState);
      setError(null);
    } catch (e) {
      if (!mounted.current) return;
      setError(e instanceof Error ? e.message : "ROOM_STATE_FAILED");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [enabled, roomCode]);

  useEffect(() => {
    mounted.current = true;
    if (!enabled) return;
    void refresh();
    const fallback = window.setInterval(() => void refresh(), 4000);
    return () => {
      mounted.current = false;
      window.clearInterval(fallback);
    };
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled || !state?.session.id) return;
    const supabase = createSupabaseBrowserClient();
    const sessionId = state.session.id;

    const channel = supabase
      .channel(`room:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_runs", filter: `session_id=eq.${sessionId}` },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "session_memberships", filter: `session_id=eq.${sessionId}` },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "prompt_cards", filter: `session_id=eq.${sessionId}` },
        () => void refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, refresh, state?.session.id]);

  return { state, loading, error, refresh };
}
