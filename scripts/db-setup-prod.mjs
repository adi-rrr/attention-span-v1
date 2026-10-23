// Creates the tables (and the single app user) in the hosted database named
// by DATABASE_URL in .env.vercel.local. Safe to run once on an empty database.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const line = readFileSync(".env.vercel.local", "utf8")
  .split("\n")
  .find((l) => l.startsWith("DATABASE_URL="));
const url = line?.slice("DATABASE_URL=".length).trim();
if (!url) {
  console.error("Fill in DATABASE_URL in .env.vercel.local first.");
  process.exit(1);
}

const run = spawnSync(
  "psql",
  [
    url,
    "-v",
    "ON_ERROR_STOP=1",
    "-q",
    "-f",
    "db/migrations/001_init.sql",
    "-f",
    "db/migrations/002_push.sql",
    "-f",
    "db/migrations/003_lifecycle.sql",
    "-f",
    "db/migrations/004_lifecycle_backfill.sql",
    "-f",
    "db/seed_dev.sql",
  ],
  { stdio: "inherit", env: { ...process.env, PGSSLMODE: "require" } },
);
process.exit(run.status ?? 1);
