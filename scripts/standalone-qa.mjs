import { access, stat } from "node:fs/promises";
import { constants } from "node:fs";

const required = [
  ".next/standalone/server.js",
  ".next/static",
];

for (const path of required) {
  await access(path, constants.R_OK);
}

const server = await stat(".next/standalone/server.js");
if (!server.isFile() || server.size === 0) {
  throw new Error("Next.js standalone server was not generated correctly");
}

const staticDir = await stat(".next/static");
if (!staticDir.isDirectory()) {
  throw new Error("Next.js static output directory is missing");
}

console.log("STANDALONE QA PASS — .next/standalone/server.js and .next/static are present");
