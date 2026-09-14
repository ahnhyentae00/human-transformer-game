"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { MembershipRow } from "@/types/game";

export const PRESENCE_GRACE_MS = 10_000;

export function useRoomPresence(
  sessionId: string | null,
  membership: MembershipRow | null,
  enabled = true,
) {
  const [onlineMembershipIds, setOnlineMembershipIds] = useState<Set<string>>(() => new Set());
  const [synced, setSynced] = useState(false);

  // Presence is authoritative while an id exists in presenceState().
  // The grace timer starts only after an id actually disappears from that state.
  const presentIdsRef = useRef<Set<string>>(new Set());
  const leftAtRef = useRef<Map<string, number>>(new Map());

  const recompute = useCallback(() => {
    const now = Date.now();
    const next = new Set<string>(presentIdsRef.current);

    for (const [membershipId, leftAt] of leftAtRef.current.entries()) {
      if (now - leftAt < PRESENCE_GRACE_MS) {
        next.add(membershipId);
      } else {
        leftAtRef.current.delete(membershipId);
      }
    }

    setOnlineMembershipIds(next);
  }, []);

  useEffect(() => {
    if (!enabled || !sessionId || !membership) {
      presentIdsRef.current = new Set();
      leftAtRef.current = new Map();
      setOnlineMembershipIds(new Set());
      setSynced(false);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const channel = supabase.channel(`presence:${sessionId}`, {
      config: { presence: { key: membership.id } },
    });

    const payload = {
      membership_id: membership.id,
      role: membership.role,
      team_id: membership.team_id,
      player_order: membership.player_order,
      display_name: membership.display_name,
    };

    const syncPresence = () => {
      const now = Date.now();
      const state = channel.presenceState();
      const currentIds = new Set<string>();

      for (const entries of Object.values(state)) {
        for (const entry of entries as Array<Record<string, unknown>>) {
          const membershipId = entry.membership_id;
          if (typeof membershipId === "string") currentIds.add(membershipId);
        }
      }

      // The current tab is online even if the first sync arrives just before track().
      currentIds.add(membership.id);

      for (const membershipId of currentIds) {
        leftAtRef.current.delete(membershipId);
      }

      for (const membershipId of presentIdsRef.current) {
        if (!currentIds.has(membershipId) && !leftAtRef.current.has(membershipId)) {
          leftAtRef.current.set(membershipId, now);
        }
      }

      presentIdsRef.current = currentIds;
      setSynced(true);
      recompute();
    };

    channel
      .on("presence", { event: "sync" }, syncPresence)
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        await channel.track({ ...payload, connected_at: new Date().toISOString() });
      });

    const graceTimer = window.setInterval(recompute, 1_000);

    const retrack = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      void channel.track({ ...payload, connected_at: new Date().toISOString() });
    };

    document.addEventListener("visibilitychange", retrack);
    window.addEventListener("online", retrack);

    return () => {
      window.clearInterval(graceTimer);
      document.removeEventListener("visibilitychange", retrack);
      window.removeEventListener("online", retrack);
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
  }, [
    enabled,
    membership?.display_name,
    membership?.id,
    membership?.player_order,
    membership?.role,
    membership?.team_id,
    recompute,
    sessionId,
  ]);

  const isOnline = useCallback(
    (membershipId: string) => onlineMembershipIds.has(membershipId),
    [onlineMembershipIds],
  );

  return { synced, onlineMembershipIds, isOnline };
}
