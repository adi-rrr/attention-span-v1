# P0 build checklist

Vertical slice goal:

> Share / create save → preview → **dynamic Understand (LLM only)** → complete → search

## Done

- [x] Schema, API contracts, saves/folders/me
- [x] Understand routes + skip/revisit
- [x] Preview resolver — **title only** (YouTube oEmbed + OG); thumbnails deferred for P0
- [x] Intent search + mobile Search tab
- [x] **Dynamic Understand (LLM only)** — no static fallback; 503 on LLM failure
- [x] **Share handoff (Android + iOS)** — share → create save → Understand; duplicate URL popup on 409
- [x] **Library** — folder tree (exact-folder drill-down), create/rename/move/delete (cascade), save detail, long-press actions
- [x] **Reminders (in-app, local notification)** — set from Understand complete or save detail; one per save

## LLM setup (required)

In `apps/api/.env`:

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

Restart `npm run dev` after changing env.

## Share handoff (dev client required)

Share uses native modules — **Expo Go will not work**. Build a dev client once:

```bash
cd apps/mobile
npm run prebuild
npm run android   # or npm run ios
```

On a physical device, point the app at your machine (not `localhost`):

```bash
# apps/mobile/.env
EXPO_PUBLIC_API_URL=http://192.168.x.x:3001
```

**Flow:** Share URL/text/image from another app → Attention Span → POST `/saves` → Understand screen. If the URL was saved before, a **Replace / Cancel** modal appears (409).

**Deep link:** `attentionspan://understand/{saveId}` opens Understand for an existing save.

## Library

- Root: folders + Uncategorized + Recent
- Open a folder → only that folder’s children (not the whole subtree)
- `+` creates a folder (or subfolder when inside one; max depth 5)
- Long-press folder or ⚙ → Rename / Move / Delete
- Delete folder **cascades** (subfolders + saves) after confirm
- Tap save → detail (reflection, note, move, Done, Archive, Delete)
- Long-press save → same actions + Add reminder
- No auto thumbnails; Archive hides from Library (no Archived tab yet)

## Reminders

In-app only this pass. The phone schedules a local notification (no server push / calendar yet).

- Understand complete always has **Set a reminder** (LLM suggestion shown if present)
- Save detail + Library long-press: add / change / remove
- One scheduled reminder per save
- Tap the notification → save detail (`attentionspan://save/{id}`)

**Rebuild the dev client** after this change (`expo-notifications` + datetime picker are native):

```bash
cd apps/mobile
npx expo prebuild --clean
npm run android   # or npm run ios
```

Allow notifications when prompted. For a quick test, set a reminder a couple of minutes ahead.

## Try (API)

```bash
API=http://localhost:3001
DEV_USER=00000000-0000-4000-8000-000000000001

SAVE=$(curl -s -X POST "$API/saves" \
  -H "x-user-id: $DEV_USER" -H "Content-Type: application/json" \
  -d '{"platform":"youtube","source_url":"https://youtu.be/BwhRWpHxKdM","replace_existing":true}' | jq -r .id)

curl -s -X POST "$API/saves/$SAVE/understand/start" -H "x-user-id: $DEV_USER" | jq

curl -s -X POST "$API/saves/$SAVE/understand/answer" \
  -H "x-user-id: $DEV_USER" -H "Content-Type: application/json" \
  -d '{"answer":"Gym playlist — remind me Monday morning"}' | jq
```

## Next

1. Real auth (Clerk / Supabase)
2. Map pins
3. Calendar reminders (Apple / Google)
4. Nested folder picker on Understand (create still root-only there)
5. Drag-reorder folders / Archived tab
