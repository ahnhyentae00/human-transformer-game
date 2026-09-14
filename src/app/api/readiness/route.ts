import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let urlValid = false;
  try {
    if (url) {
      const parsed = new URL(url);
      urlValid = parsed.protocol === "https:" && parsed.hostname.length > 0;
    }
  } catch {
    urlValid = false;
  }

  const supabaseConfigured = Boolean(url && key && urlValid);

  return NextResponse.json(
    {
      ready: supabaseConfigured,
      app: "human-transformer-game",
      version: "0.8.3",
      supabaseConfigured,
      urlValid,
      timestamp: new Date().toISOString(),
    },
    { status: supabaseConfigured ? 200 : 503 },
  );
}
