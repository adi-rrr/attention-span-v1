import { timingSafeEqual } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { healthRoutes } from "./routes/health.js";
import { savesRoutes } from "./routes/saves.js";
import { foldersRoutes } from "./routes/folders.js";
import { meRoutes } from "./routes/me.js";
import { understandRoutes } from "./routes/understand.js";
import { searchRoutes } from "./routes/search.js";
import { reminderRoutes } from "./routes/reminders.js";
import { pushFireRoutes, pushRoutes } from "./routes/push.js";

function passcodeMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Builds the API. Locally it is served at the root (`src/index.ts`); on
 * Vercel every route lives under `/api` (`api/index.ts` at the repo root).
 */
export async function buildApp(
  opts: { prefix?: string } = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  const prefix = opts.prefix ?? "";

  await app.register(cors, { origin: true });

  app.setErrorHandler((err, _req, reply) => {
    const e = err as Error & { statusCode?: number; code?: string };
    const status = e.statusCode ?? 500;
    if (status >= 500) app.log.error(e);
    reply.code(status).send({
      error: e.message || "Internal Server Error",
      code: e.code,
    });
  });

  app.addHook("onRequest", async (req, reply) => {
    // Hosted web app: one shared passcode guards everything except the
    // health check and the signed QStash callback.
    const passcode = process.env.APP_PASSCODE;
    const path = req.url.split("?")[0] ?? "";
    const open =
      req.method === "OPTIONS" ||
      path === `${prefix}/health` ||
      path === `${prefix}/push/fire`;
    if (passcode && !open) {
      const given = req.headers["x-passcode"];
      if (typeof given !== "string" || !passcodeMatches(given, passcode)) {
        return reply
          .code(401)
          .send({ error: "Passcode required", code: "PASSCODE_REQUIRED" });
      }
    }

    // P0 stub: treat x-user-id as authenticated user until JWT is wired
    const stub = req.headers["x-user-id"];
    if (typeof stub === "string" && stub.length > 0) {
      (req as { userId?: string }).userId = stub;
    }
  });

  for (const routes of [
    healthRoutes,
    meRoutes,
    savesRoutes,
    foldersRoutes,
    understandRoutes,
    searchRoutes,
    reminderRoutes,
    pushRoutes,
    pushFireRoutes,
  ]) {
    await app.register(routes, { prefix });
  }

  return app;
}
