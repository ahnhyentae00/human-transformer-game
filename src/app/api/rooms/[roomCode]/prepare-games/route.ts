import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ roomCode: string }> },
) {
  const { roomCode } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("prepare_game_runs", { p_room_code: roomCode });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ gameCount: data });
}
