import { readFile, access } from "node:fs/promises";
import { constants } from "node:fs";

const mustExist = [
  "src/app/page.tsx",
  "src/app/host/[roomCode]/page.tsx",
  "src/app/play/[roomCode]/page.tsx",
  "src/app/api/health/route.ts",
  "src/app/api/readiness/route.ts",
  "supabase/schema.sql",
  ".env.example",
  "next.config.ts",
  "RAILWAY_DEPLOYMENT.md",
];

for (const path of mustExist) {
  await access(path, constants.R_OK);
}

const pkg = JSON.parse(await readFile("package.json", "utf8"));
if (pkg.dependencies?.next !== "15.5.24") {
  throw new Error(`Next.js must be pinned to 15.5.24 for this deployment candidate; found ${pkg.dependencies?.next}`);
}
if (pkg.scripts?.start !== "HOSTNAME=0.0.0.0 node .next/standalone/server.js") {
  throw new Error("Railway start script must bind the Next.js standalone server to 0.0.0.0");
}

const nextConfig = await readFile("next.config.ts", "utf8");
if (!nextConfig.includes('output: "standalone"')) {
  throw new Error('next.config.ts must include output: "standalone" for Railway self-hosting');
}

const envExample = await readFile(".env.example", "utf8");
if (!envExample.includes("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")) {
  throw new Error("Publishable key environment variable is missing from .env.example");
}
if (envExample.includes("SERVICE_ROLE") || envExample.includes("SECRET_KEY")) {
  throw new Error("Server secret must not be documented as a browser environment variable");
}

console.log("DEPLOY PREFLIGHT PASS — Next.js secure patch pinned, Railway standalone runtime configured, publishable-key env documented");
