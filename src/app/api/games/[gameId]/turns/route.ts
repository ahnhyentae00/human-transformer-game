import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateThreeCharacterOutput } from "@/lib/text/three-char";

const BodySchema = z.object({
  text: z.string().min(1).max(24),
  expectedVersion: z.number().int().nonnegative(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  const { gameId } = await params;
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_TURN_PAYLOAD" }, { status: 422 });

  const validation = validateThreeCharacterOutput(parsed.data.text);
  if (!validation.ok) {
    return NextResponse.json({ error: "INVALID_CHARACTER_COUNT", ...validation }, { status: 422 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const { data, error } = await supabase.rpc("submit_turn", {
    p_game_id: gameId,
    p_raw_text: parsed.data.text,
    p_effective_char_count: validation.effectiveCount,
    p_expected_version: parsed.data.expectedVersion,
  });

  if (error) {
    const status = error.message.includes("TURN_EXPIRED") || error.message.includes("STALE_GAME_VERSION") ? 409 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ game: data });
}
