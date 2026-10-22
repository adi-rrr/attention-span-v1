import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireUserId } from "../auth.js";
import { httpError } from "../httpError.js";
import {
  cancelReminder,
  getActiveReminder,
  upsertReminder,
} from "../services/reminders.js";

const upsertBody = z.object({
  fire_at: z.string().datetime(),
  timezone: z.string().min(1).max(80).optional(),
  delivery: z.enum(["in_app", "calendar", "both"]).optional().default("in_app"),
  created_from: z
    .enum(["understand_answer", "manual"])
    .optional()
    .default("manual"),
});

export const reminderRoutes: FastifyPluginAsync = async (app) => {
  app.get("/saves/:id/reminder", async (req) => {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    const reminder = await getActiveReminder(id, userId);
    if (!reminder) throw httpError(404, "No reminder");
    return reminder;
  });

  app.post("/saves/:id/reminder", async (req, reply) => {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    const body = upsertBody.parse(req.body);
    const reminder = await upsertReminder({
      saveId: id,
      userId,
      fireAt: body.fire_at,
      timezone: body.timezone,
      createdFrom: body.created_from,
      delivery: body.delivery,
    });
    return reply.code(200).send(reminder);
  });

  app.delete("/saves/:id/reminder", async (req, reply) => {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    await cancelReminder(id, userId);
    return reply.code(204).send();
  });
};
