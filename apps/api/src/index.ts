import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { healthRoutes } from "./routes/health.js";
import { savesRoutes } from "./routes/saves.js";
import { foldersRoutes } from "./routes/folders.js";
import { meRoutes } from "./routes/me.js";
import { understandRoutes } from "./routes/understand.js";
import { searchRoutes } from "./routes/search.js";
import { reminderRoutes } from "./routes/reminders.js";

const app = Fastify({ logger: true });

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

app.addHook("onRequest", async (req) => {
  // P0 stub: treat x-user-id as authenticated user until JWT is wired
  const stub = req.headers["x-user-id"];
  if (typeof stub === "string" && stub.length > 0) {
    (req as { userId?: string }).userId = stub;
  }
});

await app.register(healthRoutes);
await app.register(meRoutes);
await app.register(savesRoutes);
await app.register(foldersRoutes);
await app.register(understandRoutes);
await app.register(searchRoutes);
await app.register(reminderRoutes);

const port = Number(process.env.PORT ?? 3001);

try {
  await app.listen({ port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
