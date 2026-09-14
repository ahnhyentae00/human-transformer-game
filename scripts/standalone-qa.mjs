import { access, stat } from "node:fs/promises";
import { constants } from "node:fs";

const required = [
  ".next/standalone/server.js",
  ".next/standalone/.next/static",
];

for (const path of required) {
  await access(path, constants.R_OK);
}

const server = await stat(".next/standalone/server.js");
if (!server.isFile() || server.size === 0) {
  throw new Error("Next.js standalone server was not generated correctly");
}

const staticDir = await stat(".next/standalone/.next/static");
if (!staticDir.isDirectory()) {
  throw new Error("Standalone runtime static directory is missing");
}

console.log("STANDALONE QA PASS — server.js and runtime static assets are present");
