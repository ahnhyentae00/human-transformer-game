"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function useAnonymousAuth() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        if (!cancelled) setReady(true);
        return;
      }

      const { error: signInError } = await supabase.auth.signInAnonymously();
      if (cancelled) return;
      if (signInError) {
        setError(signInError.message);
        return;
      }
      setReady(true);
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  return { ready, error };
}
