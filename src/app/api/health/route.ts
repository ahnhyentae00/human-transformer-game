import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );

  return NextResponse.json(
    {
      ok: supabaseConfigured,
      app: "human-transformer-game",
      version: "0.6.0",
      supabaseConfigured,
      timestamp: new Date().toISOString(),
    },
    { status: supabaseConfigured ? 200 : 503 },
  );
}
