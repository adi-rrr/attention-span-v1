import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireUserId } from "../auth.js";
import {
  CATEGORY_KEYS,
  listCategories,
  renameCategory,
  setCategory,
} from "../services/categories.js";

const categoryBody = z.object({ category: z.enum(CATEGORY_KEYS) });
const labelBody = z.object({ label: z.string().max(60) });

export const categoryRoutes: FastifyPluginAsync = async (app) => {
  /** Every category with this user's own label for it. */
  app.get("/categories", async (req) => {
    const userId = requireUserId(req);
    return { items: await listCategories(userId) };
  });

  /** Rename a category for this user; an empty label resets it. */
  app.put("/categories/:key", async (req) => {
    const userId = requireUserId(req);
    const { key } = z.object({ key: z.enum(CATEGORY_KEYS) }).parse(req.params);
    const { label } = labelBody.parse(req.body);
    return { items: await renameCategory(userId, key, label) };
  });

  /** The user picks or confirms a save's category while sorting. */
  app.patch("/saves/:id/category", async (req) => {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    const { category } = categoryBody.parse(req.body);
    return setCategory(userId, id, category);
  });
};
