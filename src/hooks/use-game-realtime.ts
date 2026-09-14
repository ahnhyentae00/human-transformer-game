"use client";

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { GameRun } from "@/types/game";

export function useGameRealtime(
  gameId: string,
  onGameChange: (game: GameRun) => void,
) {
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    const channel = supabase
      .channel(`game:${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "game_runs",
          filter: `id=eq.${gameId}`,
        },
        (payload) => onGameChange(payload.new as GameRun),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [gameId, onGameChange]);
}
