import type { IncomingMessage, ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../apps/api/src/app.js";

/**
 * Vercel serverless entry: every /api/* request is rewritten here
 * (vercel.json) and handed to the same Fastify app the Mac runs locally.
 */
let appPromise: Promise<FastifyInstance> | null = null;

function getApp(): Promise<FastifyInstance> {
  appPromise ??= buildApp({ prefix: "/api" }).then(async (app) => {
    await app.ready();
    return app;
  });
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getApp();
  app.server.emit("request", req, res);
}
