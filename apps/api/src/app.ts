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
import { lifecycleRoutes } from "./routes/lifecycle.js";
import { sweepExpiredSaves } from "./services/lifecycle.js";
import { authenticate } from "./auth.js";

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
    // Open without signing in: CORS preflight, the health check, and the
    // signed QStash callback that fires reminder pushes.
    const path = req.url.split("?")[0] ?? "";
    const open =
      req.method === "OPTIONS" ||
      path === `${prefix}/health` ||
      path === `${prefix}/push/fire`;
    if (open) return;

    let userId: string | null;
    try {
      userId = await authenticate(req);
    } catch (err) {
      const e = err as Error & { statusCode?: number; code?: string };
      return reply
        .code(e.statusCode ?? 401)
        .send({ error: e.message, code: e.code ?? "AUTH_REQUIRED" });
    }
    if (!userId) return;
    (req as { userId?: string }).userId = userId;
    // Expired inbox saves are deleted lazily on any request (throttled).
    await sweepExpiredSaves(userId).catch((err) => {
      app.log.error(err, "expiry sweep failed");
    });
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
    lifecycleRoutes,
  ]) {
    await app.register(routes, { prefix });
  }

  return app;
}
