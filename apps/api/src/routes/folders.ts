import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireUserId } from "../auth.js";
import { query, withTransaction } from "../db.js";
import { httpError } from "../httpError.js";
import {
  applyFolderMoveOrRename,
  cascadeDeleteFolder,
  getMaxFolderDepth,
} from "../services/folders.js";

const createFolderBody = z.object({
  name: z.string().min(1).max(120),
  parent_id: z.string().uuid().nullable().optional(),
});

const patchFolderBody = z.object({
  name: z.string().min(1).max(120).optional(),
  parent_id: z.string().uuid().nullable().optional(),
  sort_order: z.number().int().optional(),
});

export const foldersRoutes: FastifyPluginAsync = async (app) => {
  app.get("/folders", async (req) => {
    const userId = requireUserId(req);
    const { rows } = await query(
      `SELECT f.id, f.name, f.depth, f.path, f.parent_id, f.sort_order,
              (
                SELECT COUNT(*)::int
                FROM saves s
                WHERE s.folder_id = f.id
                  AND s.deleted_at IS NULL
                  AND s.status IN ('understand_done', 'done')
              ) AS save_count
       FROM folders f
       WHERE f.user_id = $1 AND f.deleted_at IS NULL
       ORDER BY f.path ASC`,
      [userId],
    );
    return { items: rows };
  });

  app.post("/folders", async (req, reply) => {
    const userId = requireUserId(req);
    const body = createFolderBody.parse(req.body);
    const maxDepth = await getMaxFolderDepth(query, userId);

    let depth = 1;
    let path = body.name;
    const parentId: string | null = body.parent_id ?? null;

    if (parentId) {
      const { rows: parents } = await query<{
        depth: number;
        path: string;
      }>(
        `SELECT depth, path FROM folders
         WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
        [parentId, userId],
      );
      if (!parents[0]) throw httpError(400, "Parent folder not found");
      depth = parents[0].depth + 1;
      path = `${parents[0].path} / ${body.name}`;
    }

    if (depth > maxDepth) {
      throw httpError(400, `Folder depth cannot exceed ${maxDepth}`);
    }

    const { rows } = await query(
      `INSERT INTO folders (user_id, parent_id, name, depth, path)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, depth, path, parent_id, sort_order`,
      [userId, parentId, body.name, depth, path],
    );

    return reply.code(201).send({ ...rows[0], save_count: 0 });
  });

  app.patch("/folders/:id", async (req) => {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    const body = patchFolderBody.parse(req.body);

    if (
      body.name === undefined &&
      body.parent_id === undefined &&
      body.sort_order === undefined
    ) {
      throw httpError(400, "Nothing to update");
    }

    const folder = await withTransaction(async (q) => {
      if (body.sort_order !== undefined) {
        await q(
          `UPDATE folders SET sort_order = $3, updated_at = now()
           WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
          [id, userId, body.sort_order],
        );
      }

      if (body.name !== undefined || body.parent_id !== undefined) {
        return applyFolderMoveOrRename(q, userId, id, {
          name: body.name,
          parent_id: body.parent_id,
        });
      }

      const { rows } = await q(
        `SELECT id, name, depth, path, parent_id, sort_order
         FROM folders
         WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
        [id, userId],
      );
      if (!rows[0]) throw httpError(404, "Folder not found");
      return rows[0];
    });

    return folder;
  });

  app.delete("/folders/:id", async (req, reply) => {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };

    await withTransaction(async (q) => {
      await cascadeDeleteFolder(q, userId, id);
    });

    return reply.code(204).send();
  });
};
