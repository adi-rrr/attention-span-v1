import type { QueryFn } from "../db.js";
import { httpError } from "../httpError.js";

export type FolderRow = {
  id: string;
  name: string;
  parent_id: string | null;
  depth: number;
  path: string;
  sort_order: number;
};

export async function getMaxFolderDepth(
  q: QueryFn,
  userId: string,
): Promise<number> {
  const { rows } = await q<{ max_folder_depth: number }>(
    `SELECT max_folder_depth FROM user_settings WHERE user_id = $1`,
    [userId],
  );
  return rows[0]?.max_folder_depth;
}

export async function loadUserFolders(
  q: QueryFn,
  userId: string,
): Promise<FolderRow[]> {
  const { rows } = await q<FolderRow>(
    `SELECT id, name, parent_id, depth, path, sort_order
     FROM folders
     WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  return rows;
}

export function descendantIds(folders: FolderRow[], id: string): string[] {
  const out: string[] = [];
  const walk = (parentId: string) => {
    for (const child of folders.filter((f) => f.parent_id === parentId)) {
      out.push(child.id);
      walk(child.id);
    }
  };
  walk(id);
  return out;
}

function recomputeSubtree(folders: FolderRow[], rootId: string) {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    const node = byId.get(id);
    if (!node) continue;
    if (!node.parent_id) {
      node.depth = 1;
      node.path = node.name;
    } else {
      const parent = byId.get(node.parent_id);
      if (!parent) {
        throw httpError(400, "Parent folder not found");
      }
      node.depth = parent.depth + 1;
      node.path = `${parent.path} / ${node.name}`;
    }
    for (const child of folders.filter((f) => f.parent_id === id)) {
      queue.push(child.id);
    }
  }
}

export async function persistFolderTree(
  q: QueryFn,
  userId: string,
  folders: FolderRow[],
  changedIds: string[],
) {
  for (const id of changedIds) {
    const node = folders.find((f) => f.id === id);
    if (!node) continue;
    await q(
      `UPDATE folders
       SET name = $3, parent_id = $4, depth = $5, path = $6, updated_at = now()
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [id, userId, node.name, node.parent_id, node.depth, node.path],
    );
  }

  await q(
    `UPDATE saves s
     SET folder_path = f.path, updated_at = now()
     FROM folders f
     WHERE s.folder_id = f.id
       AND f.id = ANY($1::uuid[])
       AND s.deleted_at IS NULL`,
    [changedIds],
  );
}

export async function applyFolderMoveOrRename(
  q: QueryFn,
  userId: string,
  folderId: string,
  patch: { name?: string; parent_id?: string | null },
): Promise<FolderRow> {
  const maxDepth = await getMaxFolderDepth(q, userId);
  const folders = await loadUserFolders(q, userId);
  const folder = folders.find((f) => f.id === folderId);
  if (!folder) throw httpError(404, "Folder not found");

  if (patch.name !== undefined) {
    folder.name = patch.name;
  }

  if (patch.parent_id !== undefined) {
    const nextParent = patch.parent_id;
    if (nextParent === folderId) {
      throw httpError(400, "Cannot move a folder into itself");
    }
    const blocked = new Set([folderId, ...descendantIds(folders, folderId)]);
    if (nextParent && blocked.has(nextParent)) {
      throw httpError(400, "Cannot move a folder into one of its subfolders");
    }
    if (nextParent && !folders.some((f) => f.id === nextParent)) {
      throw httpError(400, "Parent folder not found");
    }
    folder.parent_id = nextParent;
  }

  recomputeSubtree(folders, folderId);

  const changedIds = [folderId, ...descendantIds(folders, folderId)];
  const tooDeep = changedIds.some((id) => {
    const node = folders.find((f) => f.id === id);
    return node && node.depth > maxDepth;
  });
  if (tooDeep) {
    throw httpError(400, `Folder depth cannot exceed ${maxDepth}`);
  }

  await persistFolderTree(q, userId, folders, changedIds);
  return folders.find((f) => f.id === folderId)!;
}

export async function cascadeDeleteFolder(
  q: QueryFn,
  userId: string,
  folderId: string,
) {
  const folders = await loadUserFolders(q, userId);
  const folder = folders.find((f) => f.id === folderId);
  if (!folder) throw httpError(404, "Folder not found");

  const ids = [folderId, ...descendantIds(folders, folderId)];

  const { rows: saveRows } = await q<{ id: string }>(
    `SELECT id FROM saves
     WHERE user_id = $1
       AND folder_id = ANY($2::uuid[])
       AND deleted_at IS NULL`,
    [userId, ids],
  );
  const saveIds = saveRows.map((r) => r.id);
  if (saveIds.length) {
    await q(
      `UPDATE reminders
       SET status = 'cancelled', deleted_at = now(), updated_at = now()
       WHERE user_id = $1
         AND save_id = ANY($2::uuid[])
         AND deleted_at IS NULL`,
      [userId, saveIds],
    );
  }

  await q(
    `UPDATE saves
     SET deleted_at = now(), status = 'deleted', updated_at = now()
     WHERE user_id = $1
       AND folder_id = ANY($2::uuid[])
       AND deleted_at IS NULL`,
    [userId, ids],
  );

  await q(
    `UPDATE folders
     SET deleted_at = now(), updated_at = now()
     WHERE user_id = $1
       AND id = ANY($2::uuid[])
       AND deleted_at IS NULL`,
    [userId, ids],
  );
}
