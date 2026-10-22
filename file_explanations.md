services/folders.ts

## Running example

```
Trips                    id=A   parent=null   depth=1   path="Trips"
 └── Japan 2026          id=B   parent=A      depth=2   path="Trips / Japan 2026"
      └── Food           id=C   parent=B      depth=3   path="Trips / Japan 2026 / Food"
Recipes                  id=D   parent=null   depth=1   path="Recipes"
```

Save in Food: *“Best ramen in Shibuya”* with `folder_id=C`, `folder_path="Trips / Japan 2026 / Food"`.

---

## Lines 1–11 — imports + shape

```1:11:apps/api/src/services/folders.ts
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
```

| Lines | Meaning |
|-------|---------|
| 1 | `QueryFn` = either a normal DB query or a query inside a transaction (same signature) |
| 2 | `httpError(status, message)` — throws an error Fastify turns into a JSON error |
| 4–11 | One folder row in memory. `path` is the breadcrumb string used in UI + search |

---

## Lines 13–22 — `getMaxFolderDepth`

```13:22:apps/api/src/services/folders.ts
export async function getMaxFolderDepth(
  q: QueryFn,
  userId: string,
): Promise<number> {
  const { rows } = await q<{ max_folder_depth: number }>(
    `SELECT max_folder_depth FROM user_settings WHERE user_id = $1`,
    [userId],
  );
  return rows[0]?.max_folder_depth ?? 5;
}
```

Reads the user’s max nesting (default **5**). Used so move/create can’t go deeper than allowed.

Example: user settings say `5` → Food at depth 3 is fine; nesting 6 levels is rejected.

---

## Lines 24–35 — `loadUserFolders`

```24:35:apps/api/src/services/folders.ts
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
```

Loads **all live folders** for that user into an array. Soft-deleted ones (`deleted_at` set) are ignored.

Example result: `[Trips, Japan 2026, Food, Recipes]` as objects in memory.

---

## Lines 37–47 — `descendantIds`

```37:47:apps/api/src/services/folders.ts
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
```

Recursive walk: “give me every folder **under** this one” (not including itself).

| Lines | What happens |
|-------|----------------|
| 38 | empty result array |
| 39–44 | `walk`: find children of `parentId`, push each id, recurse |
| 45 | start from the folder you care about |
| 46 | return all found ids |

**Example:** `descendantIds(folders, "A")` (Trips)  
→ children of A = Japan (`B`) → push `B` → children of B = Food (`C`) → push `C`  
→ returns `["B", "C"]`

`descendantIds(folders, "C")` → `[]` (Food has no kids)

Used for: cascade delete, blocking “move into your own child”, and knowing which rows to rewrite after a rename/move.

---

## Lines 49–71 — `recomputeSubtree`

```49:71:apps/api/src/services/folders.ts
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
```

After you change a folder’s **name** or **parent**, depth/path of that folder **and all kids** may be wrong. This fixes them **in memory** (BFS queue).

| Lines | Meaning |
|-------|---------|
| 50 | Map `id → folder` for O(1) parent lookups |
| 51–52 | Start at the changed folder; process queue until empty |
| 54–55 | Skip if missing |
| 56–58 | Root folder (`parent_id` null) → depth 1, path = just the name |
| 59–65 | Non-root → depth = parent.depth + 1, path = `"parent.path / name"` |
| 61–63 | Broken parent link → 400 |
| 67–69 | Enqueue children so they get updated next |

**Example: rename Japan → “Tokyo trip”**

Before calling this, we already set `B.name = "Tokyo trip"`. Then `recomputeSubtree(folders, "B")`:

1. Process B: parent is Trips (`A`), so  
   `depth=2`, `path="Trips / Tokyo trip"`
2. Enqueue Food (`C`)
3. Process C: parent is B, so  
   `depth=3`, `path="Trips / Tokyo trip / Food"`

Trips and Recipes are untouched — only the subtree starting at B.

**Example: move Food under Recipes**

We set `C.parent_id = D`. Then `recomputeSubtree(folders, "C")`:

1. Process C: parent = Recipes →  
   `depth=2`, `path="Recipes / Food"`

---

## Lines 73–99 — `persistFolderTree`

```73:99:apps/api/src/services/folders.ts
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
```

Writes the in-memory fixes back to the DB.

| Lines | Meaning |
|-------|---------|
| 79–88 | For each changed folder id, UPDATE that folder row |
| 90–98 | For every save whose `folder_id` is one of those folders, copy the new `folders.path` into `saves.folder_path` |

Why the saves update? Search ranks by `folder_path`. If Japan is renamed, the ramen save must become `"Trips / Tokyo trip / Food"`, not keep the old string.

---

## Lines 101–144 — `applyFolderMoveOrRename` (main entry)

Called from `PATCH /folders/:id` when name and/or parent change.

```101:144:apps/api/src/services/folders.ts
export async function applyFolderMoveOrRename(
  q: QueryFn,
  userId: string,
  folderId: string,
  patch: { name?: string; parent_id?: string | null },
): Promise<FolderRow> {
  // ...
}
```

### Step by step with: move **Japan 2026** under **Recipes**

`folderId = "B"`, `patch = { parent_id: "D" }`

| Lines | Action |
|-------|--------|
| 107 | Load max depth (5) |
| 108 | Load all folders into memory |
| 109–110 | Find Japan (`B`); 404 if missing |
| 112–114 | Skip (no rename in this patch) |
| 116–117 | `nextParent = "D"` (Recipes) |
| 118–120 | Block moving a folder into **itself** |
| 121 | `blocked = { B, C }` — Japan + Food (via `descendantIds`) |
| 122–124 | If you tried to move Japan under Food, Food is in `blocked` → 400 |
| 125–127 | Recipes must exist |
| 128 | Set `B.parent_id = "D"` in memory |
| 131 | `recomputeSubtree(folders, "B")` → Japan becomes depth 2, path `"Recipes / Japan 2026"`; Food becomes depth 3, path `"Recipes / Japan 2026 / Food"` |
| 133 | `changedIds = ["B", "C"]` |
| 134–140 | If any of those depths > 5 → 400 |
| 142 | Persist folders B+C and update saves under them |
| 143 | Return the updated Japan folder |

Invalid example: move Trips under Food  
→ `blocked` for Trips includes Japan + Food → Food is blocked → 400 *“Cannot move a folder into one of its subfolders”*.

---

## Lines 146–193 — `cascadeDeleteFolder`

Called from `DELETE /folders/:id`. Your product rule: **delete folder + everything inside**.

```146:193:apps/api/src/services/folders.ts
export async function cascadeDeleteFolder(...) {
  // ...
}
```

### Example: delete **Japan 2026** (`B`)

| Lines | Action |
|-------|--------|
| 151–153 | Load folders; find Japan; 404 if gone |
| 155 | `ids = ["B", "C"]` — Japan + Food |
| 157–163 | Find all saves in those folders → ramen save id |
| 164–174 | If any saves: cancel their reminders (soft cancel) |
| 176–183 | Soft-delete those saves (`deleted_at`, `status='deleted'`) |
| 185–192 | Soft-delete folders B and C |

Nothing hard-deletes rows; they’re marked deleted so unique URL constraints and history stay clean.

---

## How the pieces call each other

```
PATCH /folders/:id  { name?, parent_id? }
        │
        ▼
applyFolderMoveOrRename
  ├── getMaxFolderDepth
  ├── loadUserFolders
  ├── descendantIds          (block illegal moves)
  ├── recomputeSubtree       (fix depth/path in memory)
  ├── descendantIds again    (list rows to write)
  └── persistFolderTree      (DB folders + saves.folder_path)

DELETE /folders/:id
        │
        ▼
cascadeDeleteFolder
  ├── loadUserFolders
  ├── descendantIds
  ├── cancel reminders on affected saves
  ├── soft-delete saves
  └── soft-delete folders
```

---

## One sentence summary

`folders.ts` treats your folders as an in-memory tree: find descendants, recompute breadcrumb paths after rename/move, write them back (including save search paths), or cascade soft-delete a whole branch.




routers/folders.ts

## Running example

Same tree as before:

```
Trips           id=A   parent=null   depth=1   path="Trips"
 └── Japan 2026 id=B   parent=A      depth=2   path="Trips / Japan 2026"
      └── Food  id=C   parent=B      depth=3   path="Trips / Japan 2026 / Food"
Recipes         id=D   parent=null   depth=1   path="Recipes"
```

User id (dev header): `00000000-0000-4000-8000-000000000001`

---

## Lines 1–10 — imports

```1:10:apps/api/src/routes/folders.ts
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
```

| Lines | Meaning |
|-------|---------|
| 1 | Type for a Fastify route plugin (`async (app) => { ... }`) |
| 2 | Zod — validates request JSON before we trust it |
| 3 | Reads `x-user-id` off the request; 401 if missing |
| 4 | `query` = normal DB call; `withTransaction` = BEGIN/COMMIT/ROLLBACK wrapper |
| 5 | Throw a typed HTTP error (`400`, `404`, etc.) |
| 6–10 | Tree logic from `services/folders.ts` (rename/move/delete/depth) |

**Who does what:** routes = “HTTP + validation + simple create/list”; service = “tree math + cascade”.

---

## Lines 12–21 — request body schemas

```12:21:apps/api/src/routes/folders.ts
const createFolderBody = z.object({
  name: z.string().min(1).max(120),
  parent_id: z.string().uuid().nullable().optional(),
});

const patchFolderBody = z.object({
  name: z.string().min(1).max(120).optional(),
  parent_id: z.string().uuid().nullable().optional(),
  sort_order: z.number().int().optional(),
});
```

**Create** (`POST`):
- `name` required, 1–120 chars
- `parent_id` optional — omit/null = root folder; uuid = create under that parent

**Patch** (`PATCH`):
- Any of `name`, `parent_id`, `sort_order` — all optional, but at least one must be sent (checked later)
- `parent_id: null` means “move to Library root”

Example create body:

```json
{ "name": "Food", "parent_id": "B" }
```

Example patch body (rename):

```json
{ "name": "Tokyo trip" }
```

---

## Lines 23–41 — `GET /folders`

```23:41:apps/api/src/routes/folders.ts
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
```

| Lines | Meaning |
|-------|---------|
| 23 | Register this plugin on the Fastify app |
| 24 | Handle `GET /folders` |
| 25 | Who is calling? Must have `x-user-id` |
| 26–38 | SQL: all of **your** non-deleted folders |
| 28–34 | Subquery: count saves **directly** in that folder (Library statuses only) |
| 36 | Soft-deleted folders hidden |
| 37 | Sort by path so tree-ish order: `Recipes`, `Trips`, `Trips / Japan…` |
| 40 | Response shape `{ items: [...] }` |

**Example response** if Food has 1 ramen save:

```json
{
  "items": [
    { "id": "D", "name": "Recipes", "depth": 1, "path": "Recipes", "parent_id": null, "save_count": 0 },
    { "id": "A", "name": "Trips", "depth": 1, "path": "Trips", "parent_id": null, "save_count": 0 },
    { "id": "B", "name": "Japan 2026", "depth": 2, "path": "Trips / Japan 2026", "parent_id": "A", "save_count": 0 },
    { "id": "C", "name": "Food", "depth": 3, "path": "Trips / Japan 2026 / Food", "parent_id": "B", "save_count": 1 }
  ]
}
```

Mobile uses this list and filters children in JS (`parent_id === currentFolder`).

---

## Lines 43–78 — `POST /folders`

```43:78:apps/api/src/routes/folders.ts
  app.post("/folders", async (req, reply) => {
    const userId = requireUserId(req);
    const body = createFolderBody.parse(req.body);
    const maxDepth = await getMaxFolderDepth(query, userId);

    let depth = 1;
    let path = body.name;
    const parentId: string | null = body.parent_id ?? null;

    if (parentId) {
      // look up parent, bump depth, build path
    }

    if (depth > maxDepth) {
      throw httpError(400, `Folder depth cannot exceed ${maxDepth}`);
    }

    const { rows } = await query(
      `INSERT INTO folders ... RETURNING ...`,
      [userId, parentId, body.name, depth, path],
    );

    return reply.code(201).send({ ...rows[0], save_count: 0 });
  });
```

### Example A — create root folder “Trips”

Request:

```http
POST /folders
x-user-id: 00000000-...
{ "name": "Trips" }
```

| Lines | What happens |
|-------|----------------|
| 44–45 | Auth + parse body → `{ name: "Trips", parent_id: undefined }` |
| 46 | maxDepth = 5 |
| 48–50 | Start as root: `depth=1`, `path="Trips"`, `parentId=null` |
| 52 | `parentId` is null → skip parent lookup |
| 66–68 | depth 1 ≤ 5 → OK |
| 70–75 | INSERT row |
| 77 | **201** with `save_count: 0` (brand new, empty) |

### Example B — create “Food” under Japan (`B`)

Request:

```json
{ "name": "Food", "parent_id": "B" }
```

| Lines | What happens |
|-------|----------------|
| 50 | `parentId = "B"` |
| 52–60 | Load Japan: `depth=2`, `path="Trips / Japan 2026"` |
| 61 | If Japan missing → 400 |
| 62–63 | `depth = 3`, `path = "Trips / Japan 2026 / Food"` |
| 66–68 | 3 ≤ 5 → OK |
| 70–77 | Insert and return 201 |

### Example C — too deep

If parent is already depth 5 and you POST a child → line 66–67 throws **400** `Folder depth cannot exceed 5`.

---

## Lines 80–120 — `PATCH /folders/:id`

```80:120:apps/api/src/routes/folders.ts
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
      if (body.sort_order !== undefined) { /* update sort_order */ }

      if (body.name !== undefined || body.parent_id !== undefined) {
        return applyFolderMoveOrRename(q, userId, id, {
          name: body.name,
          parent_id: body.parent_id,
        });
      }

      // sort_order-only: re-read and return the folder
      const { rows } = await q(`SELECT ...`);
      if (!rows[0]) throw httpError(404, "Folder not found");
      return rows[0];
    });

    return folder;
  });
```

| Lines | Meaning |
|-------|---------|
| 81–83 | Auth + folder id from URL + parse body |
| 85–91 | Empty `{}` body → 400 (nothing to do) |
| 93 | **Transaction** — if rename fails mid-way, everything rolls back |
| 94–100 | Optional: update `sort_order` only (reorder siblings; UI not built yet) |
| 102–107 | Name and/or parent change → hand off to `applyFolderMoveOrRename` (the service you just studied) |
| 109–116 | If only `sort_order` changed, SELECT the row and return it |
| 119 | Return updated folder JSON |

### Example — rename Japan

```http
PATCH /folders/B
{ "name": "Tokyo trip" }
```

Flow:
1. Lines 85–91 pass (name is set)
2. Transaction starts
3. Lines 102–106 call `applyFolderMoveOrRename` → recomputes Food’s path to `"Trips / Tokyo trip / Food"`, updates saves’ `folder_path`
4. Returns Japan’s new row

### Example — move Japan under Recipes

```http
PATCH /folders/B
{ "parent_id": "D" }
```

Same path, but service sets `parent_id=D` and rebuilds paths under Recipes. Illegal moves (into self/child) become **400** from the service.

### Example — only reorder (future UI)

```http
PATCH /folders/A
{ "sort_order": 2 }
```

Lines 94–99 update sort; 102 is false (no name/parent); 109–116 return the folder.

---

## Lines 122–131 — `DELETE /folders/:id`

```122:131:apps/api/src/routes/folders.ts
  app.delete("/folders/:id", async (req, reply) => {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };

    await withTransaction(async (q) => {
      await cascadeDeleteFolder(q, userId, id);
    });

    return reply.code(204).send();
  });
});
```

| Lines | Meaning |
|-------|---------|
| 122–124 | Auth + which folder to delete |
| 126–128 | Transaction around cascade (reminders + saves + folders must succeed together) |
| 127 | Service soft-deletes folder, all subfolders, all saves inside, cancels reminders |
| 130 | **204 No Content** — success, empty body |

### Example — delete Japan (`B`)

```http
DELETE /folders/B
```

Inside the transaction, `cascadeDeleteFolder` soft-deletes:
- Folders: Japan + Food
- Saves: ramen in Food
- Reminders on those saves

Mobile then refreshes `GET /folders` and Japan/Food disappear.

Missing folder → service throws **404**.

---

## How this file talks to the service

```
Mobile LibraryScreen
        │
        ├─ GET    /folders          → this file only (list + save_count)
        ├─ POST   /folders          → this file (compute depth/path + INSERT)
        ├─ PATCH  /folders/:id      → this file → applyFolderMoveOrRename
        └─ DELETE /folders/:id      → this file → cascadeDeleteFolder
```

**Rule of thumb:**
- **Create / list** = simple enough to live in the route
- **Rename / move / delete** = tree side effects → `services/folders.ts`

---

## Quick map of every endpoint

| Method | Path | Example | Success |
|--------|------|---------|---------|
| GET | `/folders` | Open Library | `{ items: [...] }` |
| POST | `/folders` | Tap **+**, name “Food”, inside Japan | `201` + new folder |
| PATCH | `/folders/:id` | Rename / Move | Updated folder object |
| DELETE | `/folders/:id` | Confirm “Delete everything” | `204` |



This file is the **HTTP door for saves** — list, create (share), detail, edit, delete. Understand Q&A lives in another route file; this one owns the save record itself.

Running example throughout:

- You share `https://www.youtube.com/watch?v=lisbon48`
- Dev user: `00000000-0000-4000-8000-000000000001`
- Later it sits in folder Food (`folder_id = C`, path `"Trips / Japan 2026 / Food"`)




## Lines 1–7 — imports

```1:7:apps/api/src/routes/saves.ts
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireUserId } from "../auth.js";
import { query } from "../db.js";
import { httpError } from "../httpError.js";
import { resolvePreview } from "../services/preview.js";
import { cancelReminder } from "../services/reminders.js";
```

| Line | Meaning |
|------|---------|
| 1 | Fastify plugin type |
| 2 | Zod validates JSON bodies |
| 3 | Requires `x-user-id` (dev auth stub) |
| 4 | Postgres `query(...)` |
| 5 | Throw typed HTTP errors (404, 400…) |
| 6 | Fetch title from YouTube oEmbed / OG — **no AI scrape of content** |
| 7 | Soft-cancel reminder when a save is deleted |

---

## Lines 9–27 — `SAVE_LIST_FIELDS`

```9:27:apps/api/src/routes/saves.ts
const SAVE_LIST_FIELDS = `id, platform, status, source_url, title, user_note,
              folder_id, folder_path, content_kind, offline_policy,
              LEFT(regexp_replace(understand_text, E'[\\n\\r]+', ' ', 'g'), 140)
                AS understand_snippet,
              EXISTS (
                SELECT 1 FROM reminders r
                WHERE r.save_id = saves.id
                  AND r.deleted_at IS NULL
                  AND r.status = 'scheduled'
              ) AS has_reminder,
              (
                SELECT r.fire_at FROM reminders r
                WHERE r.save_id = saves.id
                  AND r.deleted_at IS NULL
                  AND r.status = 'scheduled'
                ORDER BY r.fire_at ASC
                LIMIT 1
              ) AS reminder_fire_at,
              created_at, updated_at`;
```

Shared SELECT list for `GET /saves` (Library cards, Inbox, Recent).

| Lines | Meaning |
|-------|---------|
| 9–10 | Core save columns |
| 11–12 | `understand_snippet`: flatten newlines → spaces, take first **140** chars of reflection text (for SaveCard preview) |
| 13–18 | `has_reminder`: true if any scheduled, non-deleted reminder exists |
| 19–26 | `reminder_fire_at`: earliest scheduled fire time (or null) |
| 27 | timestamps |

Example snippet output: `"Planning long weekend with friends in May — try that ramen spot"`

---

## Lines 29–48 — request schemas

```29:48:apps/api/src/routes/saves.ts
const createSaveBody = z.object({
  id: z.string().uuid().optional(),
  platform: z.enum([
    "instagram",
    "reddit",
    "substack",
    "youtube",
    "screenshot",
  ]),
  source_url: z.string().url().nullable().optional(),
  title: z.string().optional(),
  replace_existing: z.boolean().optional().default(false),
});

const patchSaveBody = z.object({
  user_note: z.string().nullable().optional(),
  folder_id: z.string().uuid().nullable().optional(),
  title: z.string().optional(),
  status: z.enum(["understand_done", "done", "archived"]).optional(),
});
```

**Create (`POST /saves`):**
| Field | Role |
|-------|------|
| `id` | Optional client UUID (share extension can pre-generate) |
| `platform` | Required enum |
| `source_url` | Link, or null (screenshot / text-only) |
| `title` | Optional override; else preview fills it |
| `replace_existing` | Default `false`; `true` = overwrite duplicate URL |

**Patch (`PATCH /saves/:id`):**
| Field | Role |
|-------|------|
| `user_note` | Note text, or `null` to clear |
| `folder_id` | Move; `null` = Uncategorized |
| `title` | Rename |
| `status` | `understand_done` / `done` / `archived` |

---

## Lines 50–93 — `GET /saves` (list)

```50:93:apps/api/src/routes/saves.ts
export const savesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/saves", async (req) => {
    const userId = requireUserId(req);
    const q = req.query as {
      status?: string;
      folder_id?: string;
      uncategorized?: string;
      platform?: string;
      inbox?: string;
    };

    const clauses = [`user_id = $1`, `deleted_at IS NULL`];
    const params: unknown[] = [userId];

    if (q.inbox === "true") {
      clauses.push(`status = 'understand_pending'`);
    } else if (q.status) {
      const statuses = q.status.split(",").map((s) => s.trim());
      params.push(statuses);
      clauses.push(`status = ANY($${params.length}::save_status[])`);
    }

    if (q.uncategorized === "true") {
      clauses.push(`folder_id IS NULL`);
    } else if (q.folder_id) {
      params.push(q.folder_id);
      clauses.push(`folder_id = $${params.length}`);
    }
    if (q.platform) {
      params.push(q.platform);
      clauses.push(`platform = $${params.length}`);
    }

    const { rows } = await query(
      `SELECT ${SAVE_LIST_FIELDS}
       FROM saves
       WHERE ${clauses.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT 100`,
      params,
    );

    return { items: rows };
  });
```

| Lines | Meaning |
|-------|---------|
| 50–51 | Register plugin; handle list |
| 52 | Auth |
| 53–59 | Query string filters |
| 61–62 | Always: only this user’s non-deleted saves; `$1` = userId |
| 64–65 | **Inbox**: only `understand_pending` (still need to reflect) |
| 66–69 | Else if `status=understand_done,done` → array filter for Library |
| 72–73 | Uncategorized bucket: `folder_id IS NULL` |
| 74–76 | Exact folder (Notion-style): only saves **in** that folder, not subtree |
| 78–80 | Optional platform filter |
| 83–90 | Build SQL, newest first, cap 100 |
| 92 | `{ items: [...] }` |

### Examples

| Call | What you get |
|------|----------------|
| `GET /saves?inbox=true` | Lisbon save right after share, before Understand |
| `GET /saves?status=understand_done,done` | Library Recent |
| `GET /saves?folder_id=C&status=understand_done,done` | Saves inside Food only |
| `GET /saves?uncategorized=true&status=understand_done,done` | Completed but never filed |

---

## Lines 95–166 — `POST /saves` (create / share)

```95:166:apps/api/src/routes/saves.ts
  app.post("/saves", async (req, reply) => {
    const userId = requireUserId(req);
    const body = createSaveBody.parse(req.body);

    if (body.source_url) {
      // duplicate check...
    }

    const id = body.id ?? crypto.randomUUID();

    const preview = await resolvePreview(...);
    const title = (body.title && body.title.trim()) || preview.title || "";

    // INSERT save + understand_sessions
    return reply.code(201).send(rows[0]);
  });
```

### Lines 99–122 — duplicate URL flow

```99:122:apps/api/src/routes/saves.ts
    if (body.source_url) {
      const { rows: existing } = await query(
        `SELECT id, created_at FROM saves
         WHERE user_id = $1 AND source_url = $2 AND deleted_at IS NULL
         LIMIT 1`,
        [userId, body.source_url],
      );

      if (existing[0] && !body.replace_existing) {
        return reply.code(409).send({
          existing_save_id: existing[0].id,
          saved_at: existing[0].created_at,
          message: `Already saved. Replace it?`,
        });
      }

      if (existing[0] && body.replace_existing) {
        await query(
          `UPDATE saves SET deleted_at = now(), status = 'deleted', updated_at = now()
           WHERE id = $1`,
          [existing[0].id],
        );
      }
    }
```

| Lines | Meaning |
|-------|---------|
| 99 | Only check when there is a URL (screenshots skip this) |
| 100–105 | Find an active save with the same URL |
| 107–112 | Exists + `replace_existing` false → **409** (mobile shows Replace/Cancel) |
| 115–120 | Exists + Replace → soft-delete old save, then create a new one below |

Example first share → no existing → continue.  
Same URL again without replace → 409 popup.  
User taps Replace → soft-delete old → new save + fresh Understand.

### Lines 124–134 — id + title preview

```124:134:apps/api/src/routes/saves.ts
    const id = body.id ?? crypto.randomUUID();

    // Preview metadata only (no body scrape / AI extract)
    const preview = await resolvePreview(
      body.platform,
      body.source_url ?? null,
    );
    const title =
      (body.title && body.title.trim()) ||
      preview.title ||
      "";
```

| Lines | Meaning |
|-------|---------|
| 124 | Use client id if provided, else generate UUID |
| 126–130 | YouTube oEmbed / OG title only — **no** thumbnail in P0 |
| 131–134 | Prefer body title, else preview title, else `""` |

Example: body has no title → oEmbed returns `"48 hours in Lisbon"` → that becomes `title`.

### Lines 136–165 — insert save + Understand session

```136:165:apps/api/src/routes/saves.ts
    const { rows } = await query(
      `INSERT INTO saves (
         id, user_id, platform, source_url, title, status
       ) VALUES ($1, $2, $3, $4, $5, 'understand_pending')
       RETURNING id, platform, status, source_url, title,
                 user_note, folder_id, folder_path, content_kind, offline_policy,
                 created_at, updated_at`,
      [
        id,
        userId,
        body.platform,
        body.source_url ?? null,
        title,
      ],
    );

    await query(
      `INSERT INTO understand_sessions (save_id, status)
       VALUES ($1, 'pending')
       ON CONFLICT (save_id) DO UPDATE SET
         status = 'pending',
         qa_pairs = '[]'::jsonb,
         ai_turn_count = 0,
         completed_at = NULL,
         skipped_at = NULL,
         updated_at = now()`,
      [id],
    );

    return reply.code(201).send(rows[0]);
```

| Lines | Meaning |
|-------|---------|
| 136–150 | Insert save; status always starts `understand_pending`; folder still null |
| 152–163 | Create Understand session `pending`. `ON CONFLICT` resets if a session row somehow already exists (e.g. replace edge cases) |
| 165 | **201** with the new save JSON |

After this, mobile opens Understand for that `id`. Folder/content_kind get set later via Understand **complete**, not here.

---

## Lines 168–200 — `GET /saves/:id` (detail)

```168:200:apps/api/src/routes/saves.ts
  app.get("/saves/:id", async (req) => {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };

    const { rows } = await query(
      `SELECT s.id, s.platform, s.status, s.source_url, s.title, s.user_note,
              s.folder_id, s.folder_path, s.content_kind, s.offline_policy,
              s.created_at, s.updated_at,
              COALESCE(us.qa_pairs, '[]'::jsonb) AS qa_pairs,
              CASE WHEN r.id IS NULL THEN NULL ELSE json_build_object(
                'id', r.id,
                'save_id', r.save_id,
                'fire_at', r.fire_at,
                'status', r.status,
                'delivery', r.delivery,
                'created_from', r.created_from,
                'timezone', r.timezone
              ) END AS reminder
       FROM saves s
       LEFT JOIN understand_sessions us ON us.save_id = s.id
       LEFT JOIN LATERAL (
         SELECT id, save_id, fire_at, status, delivery, created_from, timezone
         FROM reminders
         WHERE save_id = s.id AND deleted_at IS NULL AND status = 'scheduled'
         ORDER BY fire_at ASC
         LIMIT 1
       ) r ON true
       WHERE s.id = $1 AND s.user_id = $2 AND s.deleted_at IS NULL`,
      [id, userId],
    );
    if (!rows[0]) throw httpError(404, "Not found");
    return rows[0];
  });
```

| Lines | Meaning |
|-------|---------|
| 169–170 | Auth + save id from URL |
| 172–175 | Save columns |
| 176 | Full Q&A array from understand session (or `[]`) |
| 177–185 | Reminder as nested JSON object, or `null` if none |
| 186–187 | Join understand session |
| 188–194 | `LATERAL`: pick soonest scheduled reminder for this save |
| 195 | Must be yours and not deleted |
| 198–199 | Missing → 404; else return one object |

Used by **SaveDetailScreen** (tap a Library card). Example response includes:

```json
{
  "title": "48 hours in Lisbon",
  "folder_path": "Trips / Japan 2026 / Food",
  "qa_pairs": [{ "question": "Why save this?", "answer": "May trip with friends" }],
  "reminder": { "fire_at": "2026-05-01T09:00:00Z", "status": "scheduled", ... }
}
```

---

## Lines 202–249 — `PATCH /saves/:id` (edit)

```202:249:apps/api/src/routes/saves.ts
  app.patch("/saves/:id", async (req) => {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    const body = patchSaveBody.parse(req.body);

    const hasFolder = body.folder_id !== undefined;
    const hasNote = body.user_note !== undefined;

    let folderPath: string | null = null;
    if (hasFolder && body.folder_id) {
      const { rows: folders } = await query<{ path: string }>(...);
      if (!folders[0]) throw httpError(400, "Folder not found");
      folderPath = folders[0].path;
    } else if (hasFolder) {
      folderPath = "";
    }

    const { rows } = await query(
      `UPDATE saves SET
         user_note = CASE WHEN $3::boolean THEN $4 ELSE user_note END,
         folder_id = CASE WHEN $5::boolean THEN $6 ELSE folder_id END,
         folder_path = CASE WHEN $5::boolean THEN $7 ELSE folder_path END,
         title = COALESCE($8, title),
         status = COALESCE($9::save_status, status),
         updated_at = now()
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       RETURNING ...`,
      [...]
    );
    if (!rows[0]) throw httpError(404, "Not found");
    return rows[0];
  });
```

### Why the CASE / boolean flags (207–221, 224–227)?

`COALESCE($folder_id, folder_id)` cannot clear a folder: if you send `folder_id: null` (Uncategorized), COALESCE would keep the old value.

So:
- `hasFolder` / `hasNote` = “did the client send this field at all?”
- If yes → write the new value (even if `null`)
- If no → leave the column alone

| Lines | Meaning |
|-------|---------|
| 207–208 | Detect which fields were present in JSON |
| 210–218 | Moving to a real folder → look up `folders.path`, fail if folder missing |
| 219–220 | Moving to Uncategorized (`folder_id: null`) → `folder_path = ""` |
| 224–227 | Conditionally update note / folder / folder_path |
| 228–229 | Title/status: `COALESCE` is fine (you don’t send null to “clear” them the same way) |
| 247–248 | No matching row → 404 |

### Examples

```json
PATCH { "user_note": "Book flights first" }
```
→ only note changes; folder untouched.

```json
PATCH { "folder_id": "C" }
```
→ `folder_id=C`, `folder_path="Trips / Japan 2026 / Food"` (from folders table).

```json
PATCH { "folder_id": null }
```
→ Uncategorized; `folder_path=""`.

```json
PATCH { "status": "archived" }
```
→ disappears from Library lists (`status=understand_done,done` filters it out).

```json
PATCH { "status": "done" }
```
→ Mark Done from long-press / detail.

---

## Lines 251–262 — `DELETE /saves/:id`

```251:262:apps/api/src/routes/saves.ts
  app.delete("/saves/:id", async (req, reply) => {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };

    await cancelReminder(id, userId);
    await query(
      `UPDATE saves SET deleted_at = now(), status = 'deleted', updated_at = now()
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [id, userId],
    );
    return reply.code(204).send();
  });
});
```

| Lines | Meaning |
|-------|---------|
| 252–253 | Auth + id |
| 255 | Cancel any scheduled reminder for this save first |
| 256–260 | Soft-delete: set `deleted_at`, status `deleted` (row stays; unique URL index ignores deleted) |
| 261 | **204** empty success |

Long-press Delete or detail Delete → this. Soft-delete means sharing the same URL again is allowed as a “new” save.

---

## Whole-file map

```
GET    /saves              list (inbox / library / folder / uncategorized)
POST   /saves              create from share (+ 409 duplicate / replace)
GET    /saves/:id          detail (qa_pairs + reminder) → SaveDetailScreen
PATCH  /saves/:id          note / move folder / title / done / archive
DELETE /saves/:id          soft-delete + cancel reminder
```

```
Share URL
   → POST /saves  (preview title, understand_pending, session pending)
   → [Understand routes: start / answer / complete]  ← not in this file
   → complete sets folder_id, folder_path, understand_text, status understand_done
   → GET /saves?status=...  shows in Library
   → GET /saves/:id         open detail
   → PATCH / DELETE         organize or remove
```

---

## One-sentence summary

`saves.ts` creates saves from share (with duplicate Replace/Cancel and title preview), lists them with filters for Inbox/Library/folders, returns rich detail for one save, patches note/folder/status carefully so `null` can mean Uncategorized, and soft-deletes with reminder cleanup.