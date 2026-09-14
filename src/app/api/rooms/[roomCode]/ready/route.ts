import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const BodySchema = z.object({ ready: z.boolean() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomCode: string }> },
) {
  const { roomCode } = await params;
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_READY_STATE" }, { status: 422 });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("set_player_ready", {
    p_room_code: roomCode,
    p_ready: parsed.data.ready,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ membership: data });
}
