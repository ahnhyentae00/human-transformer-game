import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  teamId: z.string().uuid(),
  playerOrder: z.number().int().min(1).max(12),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ membershipId: string }> },
) {
  const { membershipId } = await params;
  const body = bodySchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "INVALID_ASSIGNMENT" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("host_assign_player", {
    p_membership_id: membershipId,
    p_team_id: body.data.teamId,
    p_player_order: body.data.playerOrder,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ membership: data });
}
