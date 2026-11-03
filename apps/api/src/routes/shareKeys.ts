import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireUserId } from "../auth.js";
import { createShareKey, revokeShareKey } from "../services/shareKeys.js";

const revokeBody = z.object({ key: z.string().min(10) });

/** Device share keys for the phone's background share receiver. */
export const shareKeyRoutes: FastifyPluginAsync = async (app) => {
  app.post("/share-keys", async (req, reply) => {
    const userId = requireUserId(req);
    return reply.code(201).send({ key: await createShareKey(userId) });
  });

  app.post("/share-keys/revoke", async (req, reply) => {
    const userId = requireUserId(req);
    const { key } = revokeBody.parse(req.body);
    await revokeShareKey(userId, key);
    return reply.code(204).send();
  });
};
