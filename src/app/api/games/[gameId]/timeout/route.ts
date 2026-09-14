import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const BodySchema = z.object({ expectedVersion: z.number().int().nonnegative() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  const { gameId } = await params;
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_TIMEOUT_PAYLOAD" }, { status: 422 });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("expire_turn", {
    p_game_id: gameId,
    p_expected_version: parsed.data.expectedVersion,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ game: data });
}
