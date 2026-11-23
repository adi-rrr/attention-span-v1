import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireUserId } from "../auth.js";
import { query } from "../db.js";
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

  /**
   * How many saves sit in each category, for Kept's category list. Saves that
   * never got a category count as "other".
   */
  app.get("/categories/counts", async (req) => {
    const userId = requireUserId(req);
    const { status } = z.object({ status: z.string().optional() }).parse(req.query);
    const statuses = status ? status.split(",").map((s) => s.trim()) : null;
    const { rows } = await query<{ category: string; n: number }>(
      `SELECT COALESCE(category, 'other') AS category, count(*)::int AS n
       FROM saves
       WHERE user_id = $1 AND deleted_at IS NULL
         AND ($2::save_status[] IS NULL OR status = ANY($2::save_status[]))
       GROUP BY 1`,
      [userId, statuses],
    );
    return { counts: Object.fromEntries(rows.map((r) => [r.category, r.n])) };
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
