import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ roomCode: string }> },
) {
  const { roomCode } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id, room_code, title, status, active_game_run_id, created_at, updated_at")
    .eq("room_code", roomCode)
    .maybeSingle();

  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 400 });
  if (!session) return NextResponse.json({ error: "ROOM_NOT_FOUND_OR_NOT_JOINED" }, { status: 404 });

  const [teamsResult, membershipsResult, promptsResult, gamesResult] = await Promise.all([
    supabase.from("teams").select("*").eq("session_id", session.id).order("sort_order"),
    supabase.from("session_memberships").select("*").eq("session_id", session.id).order("created_at"),
    supabase.from("prompt_cards").select("*").eq("session_id", session.id).order("sort_order"),
    supabase.from("game_runs").select("*").eq("session_id", session.id).order("created_at"),
  ]);

  const firstError = teamsResult.error ?? membershipsResult.error ?? promptsResult.error ?? gamesResult.error;
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 400 });

  const gameIds = (gamesResult.data ?? []).map((g) => g.id);
  let turns: unknown[] = [];
  if (gameIds.length > 0) {
    const turnsResult = await supabase
      .from("turns")
      .select("*")
      .in("game_run_id", gameIds)
      .order("turn_number");
    if (turnsResult.error) return NextResponse.json({ error: turnsResult.error.message }, { status: 400 });
    turns = turnsResult.data ?? [];
  }

  const currentMembership = (membershipsResult.data ?? []).find((m) => m.user_id === userData.user!.id);
  if (!currentMembership) return NextResponse.json({ error: "MEMBERSHIP_NOT_FOUND" }, { status: 403 });

  return NextResponse.json({
    session,
    currentMembership,
    teams: teamsResult.data ?? [],
    memberships: membershipsResult.data ?? [],
    prompts: promptsResult.data ?? [],
    games: gamesResult.data ?? [],
    turns,
  });
}
