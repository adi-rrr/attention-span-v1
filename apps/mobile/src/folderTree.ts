import type { Folder } from "./types";

/** Closed-dropdown label: "Uncategorized" | "A" | "A › D" */
export function folderBreadcrumbLabel(
  folders: Folder[],
  folderId: string | null | undefined,
  emptyLabel = "Uncategorized",
): string {
  if (folderId == null) return emptyLabel;
  const byId = new Map(folders.map((f) => [f.id, f]));
  const names: string[] = [];
  let cur: Folder | undefined = byId.get(folderId);
  while (cur) {
    names.unshift(cur.name);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return names.length ? names.join(" › ") : emptyLabel;
}

export function childrenOf(
  folders: Folder[],
  parentId: string | null,
): Folder[] {
  return folders
    .filter((f) => f.parent_id === parentId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function folderById(
  folders: Folder[],
  id: string | null | undefined,
): Folder | undefined {
  if (!id) return undefined;
  return folders.find((f) => f.id === id);
}

/** Parent id to use when creating a new folder under the current selection. */
export function createParentId(
  folders: Folder[],
  selectedId: string | null | undefined,
  maxDepth = 5,
): string | null | false {
  if (selectedId == null) return null; // root
  const selected = folderById(folders, selectedId);
  if (!selected) return null;
  if (selected.depth >= maxDepth) return false; // cannot nest deeper
  return selected.id;
}
