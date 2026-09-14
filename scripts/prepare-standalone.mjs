import { access, cp, mkdir } from "node:fs/promises";
import { constants } from "node:fs";

await mkdir(".next/standalone/.next", { recursive: true });
await cp(".next/static", ".next/standalone/.next/static", {
  recursive: true,
  force: true,
});

try {
  await access("public", constants.R_OK);
  await cp("public", ".next/standalone/public", {
    recursive: true,
    force: true,
  });
} catch {
  // public/ is optional in this project.
}

console.log("STANDALONE ASSETS PREPARED — copied .next/static (and public/ when present)");
