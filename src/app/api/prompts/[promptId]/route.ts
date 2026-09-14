import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateThreeCharacterOutput } from "@/lib/text/three-char";

const UpdateBodySchema = z.object({
  title: z.string().trim().max(80).default(""),
  promptText: z.string().trim().min(1).max(1200),
  seedText: z.string().min(1).max(40),
  endingLap: z.number().int().min(1).max(20),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ promptId: string }> },
) {
  const { promptId } = await params;
  const parsed = UpdateBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_PROMPT_CARD" }, { status: 422 });

  const validation = validateThreeCharacterOutput(parsed.data.seedText);
  if (!validation.ok) {
    return NextResponse.json({ error: "SEED_MUST_BE_THREE_CHARACTERS", ...validation }, { status: 422 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("update_prompt_card", {
    p_prompt_id: promptId,
    p_title: parsed.data.title,
    p_prompt_text: parsed.data.promptText,
    p_seed_text: parsed.data.seedText,
    p_ending_lap: parsed.data.endingLap,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ prompt: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ promptId: string }> },
) {
  const { promptId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("delete_prompt_card", { p_prompt_id: promptId });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ deleted: data });
}
