import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  const { gameId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("complete_game", { p_game_id: gameId });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ game: data });
}
