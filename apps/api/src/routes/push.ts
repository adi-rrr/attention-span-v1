import { Receiver } from "@upstash/qstash";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireUserId } from "../auth.js";
import { httpError } from "../httpError.js";
import {
  fireReminder,
  saveSubscription,
  vapidPublicKey,
} from "../services/push.js";

const subscribeBody = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export const pushRoutes: FastifyPluginAsync = async (app) => {
  app.get("/push/public-key", async () => ({ public_key: vapidPublicKey() }));

  app.post("/push/subscribe", async (req, reply) => {
    const userId = requireUserId(req);
    const body = subscribeBody.parse(req.body);
    await saveSubscription(userId, body);
    return reply.code(204).send();
  });
};

/**
 * Called by Upstash QStash at a reminder's fire time. Not behind the
 * passcode; instead the request must carry a valid QStash signature, checked
 * against the raw body.
 */
export const pushFireRoutes: FastifyPluginAsync = async (app) => {
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body, done) => done(null, body),
  );

  app.post("/push/fire", async (req) => {
    const current = process.env.QSTASH_CURRENT_SIGNING_KEY;
    const next = process.env.QSTASH_NEXT_SIGNING_KEY;
    if (!current || !next) throw httpError(503, "Push is not configured");

    const raw = typeof req.body === "string" ? req.body : "";
    const signature = req.headers["upstash-signature"];
    const valid =
      typeof signature === "string" &&
      (await new Receiver({
        currentSigningKey: current,
        nextSigningKey: next,
      })
        .verify({ signature, body: raw })
        .catch(() => false));
    if (!valid) throw httpError(401, "Invalid signature");

    const { reminder_id } = z
      .object({ reminder_id: z.string().uuid() })
      .parse(JSON.parse(raw));
    const reached = await fireReminder(reminder_id);
    return { reached };
  });
};
