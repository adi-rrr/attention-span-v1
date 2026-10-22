// Uploads every filled-in line of .env.vercel.local to the Vercel project's
// Production environment. Run it yourself: `npm run vercel:env`.
// Values are piped straight to the Vercel CLI and never printed.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const FILE = ".env.vercel.local";

const entries = readFileSync(FILE, "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => {
    const i = line.indexOf("=");
    return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
  });

const missing = entries.filter(([, value]) => !value).map(([key]) => key);
if (missing.length) {
  console.error(`Fill these in ${FILE} first: ${missing.join(", ")}`);
  process.exit(1);
}

console.log(`Uploading ${entries.length} settings from ${process.cwd()} …`);

for (const [key, value] of entries) {
  // Replace any old value so re-running the script is safe.
  spawnSync("npx", ["vercel", "env", "rm", key, "production", "--yes"], {
    stdio: "ignore",
  });
  spawnSync("npx", ["vercel", "env", "add", key, "production"], {
    input: value,
    stdio: ["pipe", "ignore", "ignore"],
  });
}

// Trust Vercel's own list, not the exit codes: show what actually arrived.
const listed = spawnSync(
  "npx",
  ["vercel", "env", "ls", "--environment", "production"],
  { encoding: "utf8" },
);
const names = new Set(
  `${listed.stdout}\n${listed.stderr}`
    .split("\n")
    .map((line) => line.trim().split(/\s+/)[0]),
);
for (const [key] of entries) {
  const ok = names.has(key);
  console.log(`${ok ? "✓" : "✗"} ${key}`);
  if (!ok) process.exitCode = 1;
}
if (process.exitCode) {
  console.error(
    "\nSome settings are missing. Run this from the project folder (where .vercel/ is) and make sure `npx vercel whoami` shows your account.",
  );
}
