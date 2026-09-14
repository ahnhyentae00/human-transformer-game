import { readFile, access } from "node:fs/promises";
import { constants } from "node:fs";

const mustExist = [
  "src/app/page.tsx",
  "src/app/host/[roomCode]/page.tsx",
  "src/app/play/[roomCode]/page.tsx",
  "src/app/api/health/route.ts",
  "supabase/schema.sql",
  ".env.example",
];

for (const path of mustExist) {
  await access(path, constants.R_OK);
}

const pkg = JSON.parse(await readFile("package.json", "utf8"));
if (pkg.dependencies?.next !== "15.5.24") {
  throw new Error(`Next.js must be pinned to 15.5.24 for this deployment candidate; found ${pkg.dependencies?.next}`);
}

const envExample = await readFile(".env.example", "utf8");
if (!envExample.includes("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")) {
  throw new Error("Publishable key environment variable is missing from .env.example");
}
if (envExample.includes("SERVICE_ROLE") || envExample.includes("SECRET_KEY")) {
  throw new Error("Server secret must not be documented as a browser environment variable");
}

console.log("DEPLOY PREFLIGHT PASS — secure Next.js patch pinned, deployment files present, publishable-key env documented");
