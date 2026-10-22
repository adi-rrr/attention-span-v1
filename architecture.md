# Architecture — Intentional Save App (v1)

Working name: **Attention Span** (placeholder).

This document defines the technical architecture for a save-for-later app modeled after Albo, with intentional capture (Understand Q&A), user-driven organization, intent-based search, reminders, and map view.

---

## 1. Product constraints (architecture drivers)

| Driver | Implication |
|--------|-------------|
| Save friction must stay low | Share extension completes in <2s; Understand runs in-app after save |
| Understand friction is intentional | Blocking Q&A after save; rare skip with threshold |
| No AI content extraction | We store preview metadata only; AI reads title/URL/platform for questions, not page body |
| Intent-based search is core | Dedicated search index with weighted ranking (Understand > note > folder > title) |
| User-owned organization | Nested folders are user CRUD; no auto-categorization |
| v1 sources | Instagram, Reddit, Substack, YouTube, screenshots |
| v1 rediscover | Search, reminders, map pins — no “Ask AI about saves” |

---

## 2. High-level system diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         MOBILE CLIENTS                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │ iOS Share    │  │ Android      │  │ Main App     │  │ Push        │ │
│  │ Extension    │  │ Share Target │  │ (RN/Native)  │  │ (APNs/FCM)  │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────▲──────┘ │
│         │                  │                  │                  │       │
│         └──────────────────┴──────────────────┘                  │       │
│                            │                                     │       │
│                     Local SQLite + FTS5                          │       │
│                     (offline queue, cache)                       │       │
└────────────────────────────┼─────────────────────────────────────┼───────┘
                             │ HTTPS (sync)                        │
                             ▼                                     │
┌─────────────────────────────────────────────────────────────────────────┐
│                           BACKEND API                                    │
│  Auth · Saves · Folders · Understand sessions · Reminders · Map pins    │
│  Search sync · Preview resolver · Notification scheduler                 │
└────────────┬───────────────────────────────┬────────────────────────────┘
             │                               │
             ▼                               ▼
┌────────────────────────┐    ┌────────────────────────┐    ┌──────────────┐
│ PostgreSQL             │    │ Object storage (S3)    │    │ LLM API      │
│ + pg_trgm / tsvector   │    │ thumbnails, screenshots│    │ Understand   │
│ weighted search        │    │                        │    │ questions    │
└────────────────────────┘    └────────────────────────┘    └──────────────┘
             │
             ▼
┌────────────────────────┐
│ Job queue (Redis/Bull) │
│ reminders, preview     │
│ fetch, geocode         │
└────────────────────────┘
```

---

## 3. Recommended tech stack (v1)

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Mobile | **React Native (Expo dev client)** + native share modules | One codebase; share extensions need thin native targets on iOS/Android |
| Local DB | **SQLite + FTS5** (expo-sqlite / op-sqlite) | Fast offline search; sync when online |
| Backend | **Node.js (Fastify) or Python (FastAPI)** | Simple REST; good LLM SDK support |
| Database | **PostgreSQL 16** | Relational folders, FTS, triggers for search doc |
| Auth | **Clerk** or **Supabase Auth** | Social login + JWT; low build cost |
| Storage | **S3-compatible** (R2/S3) | Screenshots + cached thumbnails |
| LLM | **OpenAI / Anthropic** (configurable) | Understand question generation only |
| Push | **FCM + APNs** via Expo Notifications or OneSignal | Reminder delivery |
| Maps | **Mapbox** or **Google Maps SDK** | Pin saved places |
| Geocoding | **Mapbox Geocoding** or **Google Places** (optional v1) | Resolve location strings from Understand answers |
| Hosting | **Fly.io / Railway / Render** | API + worker on same repo |

Stack is swappable; the boundaries below matter more than the specific vendor.

---

## 4. Core domain model

### 4.1 Entity relationship (logical)

```
User
 ├── Folder (tree, self-referential parent_id)
 ├── Save
 │    ├── PreviewMetadata (title, source_url, platform, thumbnail_url)
 │    ├── UnderstandSession (status, qa_pairs[], skip_used)
 │    ├── UserNote (optional)
 │    ├── folder_id (nullable until organized — see 4.1.1)
 │    ├── MapPin (optional: only for place-type intent)
 │    └── Reminder (optional: fire_at)
 └── UserSettings (skip_quota, notification prefs)
```

#### 4.1.1 `folder_id` — nullable until organized

A save does **not** need a folder at creation time.

| Moment | `folder_id` | Where it lives in UI |
|--------|-------------|----------------------|
| Just shared | `null` | Inbox (Uncategorized) |
| Understand done, no folder picked | `null` | Library → Uncategorized |
| User assigns / creates folder | uuid of folder | Library under that folder path |

Flow:

```
Share → save created with folder_id = NULL
     → Understand completes
     → User optionally picks folder (or skips folder for now)
     → PATCH save: folder_id = <chosen folder>
     → Later: user can move save → folder_id updates again
```

**Why nullable:** organization is user-driven and happens *after* Understand. Forcing a folder at share time would add friction and slow the share extension. Uncategorized saves are valid and searchable; they just sit under a virtual “Uncategorized” bucket until the user places them.

---

### 4.2 Save lifecycle states

```
CREATED             → share received; preview fetching
PREVIEW_READY       → title / thumbnail / platform stored
UNDERSTAND_PENDING  → user must complete Q&A (or rare skip)
UNDERSTAND_DONE     → searchable; can organize + set reminder
DONE                → user marked the action as completed (“I did this”)
ARCHIVED            → soft-hidden from default views (kept, not deleted)
DELETED             → soft-deleted (deleted_at set; excluded from all lists/search)
```

**State transitions (allowed):**

```
CREATED → PREVIEW_READY → UNDERSTAND_PENDING
                              ├─→ UNDERSTAND_DONE → DONE → ARCHIVED
                              │         │              │
                              │         └──────────────┴─→ DELETED
                              └─→ (skipped) still UNDERSTAND_PENDING-ish
                                  with skip flag; then same paths
```

| State | Meaning | User action |
|-------|---------|-------------|
| `DONE` | “I acted on this” (cooked the recipe, visited the place) | Mark complete from save detail |
| `ARCHIVED` | Keep for history but hide from Library / Inbox | Archive |
| `DELETED` | Soft delete — set `deleted_at`; purge from search | Delete (with confirm) |

**Rules:**
- Full-weight search only after `UNDERSTAND_DONE` (and still while `DONE` / until `ARCHIVED` or `DELETED`).
- `ARCHIVED` saves: optional “Archived” view; excluded from default Library.
- `DELETED` saves: soft delete via `deleted_at`; hard purge later via retention job (or never).
- Skipped saves stay searchable at reduced weight until Understand is completed.

---

### 4.3 Folder model (Notion-like tree)

```sql
folders (
  id            uuid PK,
  user_id       uuid FK,
  parent_id     uuid FK nullable,  -- null = root
  name          text,
  depth         int NOT NULL,      -- 1 = root; enforced ≤ max_depth
  sort_order    int,
  created_at    timestamptz,
  updated_at    timestamptz,
  deleted_at    timestamptz nullable  -- soft delete
)
```

**Nesting depth (v1 + future plans):**

| Plan | Max nesting depth |
|------|-------------------|
| Free (v1) | **5 levels** (hard cap) |
| Future paid / storage tiers | Raise via `UserSettings.max_folder_depth` |

- Server rejects `POST /folders` if `parent.depth + 1 > max_folder_depth`.
- `folder_path` materialized as `Trips / Europe / Lisbon` for search indexing.
- Moving a folder updates `depth` + `folder_path` for all descendants (async job).

---

### 4.4 Save record

```sql
saves (
  id              uuid PK,
  user_id         uuid FK,
  folder_id       uuid FK nullable,   -- null = Uncategorized
  platform        enum('instagram','reddit','substack','youtube','screenshot'),
  source_url      text nullable,      -- original post / page link
  title           text,
  thumbnail_url   text nullable,      -- image preview URL (S3 or CDN), NOT the post
  user_note       text nullable,
  status          enum(
                    'created',
                    'preview_ready',
                    'understand_pending',
                    'understand_done',
                    'done',
                    'archived',
                    'deleted'
                  ),
  content_kind    enum('place','content','other') nullable, -- set at Understand complete (§7.5)
  offline_policy  enum('full','light') NOT NULL DEFAULT 'light',
  search_document tsvector,           -- maintained by trigger
  created_at      timestamptz,
  updated_at      timestamptz,
  deleted_at      timestamptz nullable -- soft delete; set when status = deleted
)
```

#### `source_url` vs `thumbnail_url`

| Field | What it is | Example |
|-------|------------|---------|
| `source_url` | Link back to the original post/page | `https://www.instagram.com/p/ABC123/` |
| `thumbnail_url` | URL of a **preview image** we store/cache so the Library shows a picture without reloading Instagram | `https://cdn.ourapp.com/thumbs/{save_id}.jpg` |

**How thumbnail is created:**
1. User shares a post → we get `source_url`.
2. Preview job fetches Open Graph / oEmbed metadata from that URL.
3. Job downloads the preview image (or for screenshots: the shared image itself).
4. Image is uploaded to S3/R2 → `thumbnail_url` points at our CDN copy.

Why our copy: Instagram/Reddit thumbnails expire or block hotlinking; our CDN stays stable in the app UI. Tapping “Open original” still uses `source_url`.

#### `status` column — what it’s for

`status` is the **lifecycle gate** for the whole save. It drives:

| Consumer | Uses status to… |
|----------|------------------|
| Inbox | Show only `understand_pending` (+ skipped) |
| Library | Show `understand_done` + `done` (exclude archived/deleted) |
| Search | Full weight only if `understand_done` or `done`; exclude `deleted` / optionally `archived` |
| Reminders worker | Skip firing if save is `deleted` or `archived` |
| Map | Only pins for non-deleted, place-intent saves |

Without `status`, every query would reinvent “is this reflected / done / gone?” from scattered flags.

---

### 4.5 Understand session

```sql
understand_sessions (
  id              uuid PK,
  save_id         uuid FK unique,
  status          enum('pending','in_progress','completed','skipped'),
  qa_pairs        jsonb,  -- [{ question, answer, asked_at, answered_at }]
  ai_turn_count   int DEFAULT 0,
  completed_at    timestamptz nullable,
  skipped_at      timestamptz nullable
)
```

**qa_pairs** is the primary source for intent search. Store verbatim user answers.

#### `ai_turn_count` — explained

Counts how many times the **LLM has been called** in this Understand session (each call = one “turn”). Enforces the hard cap of ≤4 questions.

**Example:**

| Turn | What happens | `ai_turn_count` |
|------|--------------|-----------------|
| Start | AI generates Q1: “Why did you save this?” | 1 |
| User answers: “Tokyo trip ramen in April” | — | 1 |
| AI generates Q2: “Want a reminder before the trip?” | 2 |
| User answers: “Yes, 2 weeks before” | — | 2 |
| AI detects place intent → suggests map pin; no more questions | session complete | 2 |

If the first answer is rich (“Tokyo trip April, remind me 2 weeks before, casual dinner”), AI may stop at turn **1**. If answers stay vague, AI can ask up to turn **4**, then forced complete. `ai_turn_count` is the server-side counter that prevents runaway questioning.

---

### 4.6 Reminder

```sql
reminders (
  id           uuid PK,
  save_id      uuid FK,
  user_id      uuid FK,
  fire_at      timestamptz,
  timezone     text,
  status       enum('scheduled','sent','cancelled'),
  created_from enum('understand_answer','manual'),
  delivery     enum('in_app','calendar','both') NOT NULL DEFAULT 'in_app',
  calendar_provider enum('apple','google') nullable,
  external_event_id text nullable,
  created_at   timestamptz,
  deleted_at   timestamptz nullable
)
```

#### `created_from` — explained

Tracks **how** the reminder was created (for analytics + UI, not behavior):

| Value | Meaning | Example |
|-------|---------|---------|
| `understand_answer` | Suggested during Understand from the user’s answer, then confirmed | User said “remind me 2 weeks before trip” → AI offered reminder → user tapped ✓ |
| `manual` | User set it later from save detail | Opened save → “Add reminder” → picked Mar 15 |

Same reminder delivery either way; this field tells us whether Understand is driving the action loop.

---

### 4.7 Map pin (place-intent only)

```sql
map_pins (
  id          uuid PK,
  save_id     uuid FK unique,
  lat         double,
  lng         double,
  label       text,
  source      enum('user_answer','geocoded','manual_adjust'),
  created_at  timestamptz,
  deleted_at  timestamptz nullable
)
```

**Scope rule (important):** location / map-pin suggestion is **only** for place-type saves — food places, hangout spots, hotels, neighborhoods, travel destinations, etc.

| Save type | Suggest map pin? |
|-----------|------------------|
| Restaurant / cafe / hangout / hotel / city guide | Yes (if user mentions a place) |
| Recipe to cook at home | No |
| Workout video | No |
| Book / article / Substack essay | No |
| Product / tool to try | No |

Detection inputs: title + Understand answers. If the content is clearly non-place, **never** ask “want to pin this?” Manual pin from save detail remains available as an escape hatch if the user insists.

---

## 5. Search architecture (intent-first)

### 5.1 Search document composition

On every save update, rebuild `search_document`:

| Field | Weight | tsvector weight |
|-------|--------|-----------------|
| Understand Q&A (all answers) | **Highest** | `A` |
| User note | High | `B` |
| Folder path (ancestors + self) | Medium | `C` |
| Title + URL | Lower | `D` |

PostgreSQL example:

```sql
search_document :=
  setweight(to_tsvector('english', coalesce(understand_text,'')), 'A') ||
  setweight(to_tsvector('english', coalesce(user_note,'')), 'B') ||
  setweight(to_tsvector('english', coalesce(folder_path,'')), 'C') ||
  setweight(to_tsvector('english', coalesce(title,'') || ' ' || coalesce(source_url,'')), 'D');
```

Query ranking:

```sql
ORDER BY ts_rank_cd(search_document, plainto_tsquery('english', :q), 32) DESC,
         saves.updated_at DESC
```

**Example:** query `"cheap dinner"` ranks a save with Understand answer *“casual, not too expensive”* above a save whose YouTube title only contains *“dinner”*.

### 5.2 Local + remote search (selective offline)

Offline is **not** a full mirror of every save. Storage and searchability depend on content kind (set at Understand end — see §7.5).

| Content kind | Local (offline) store | Offline search indexes |
|--------------|----------------------|------------------------|
| **Content-like** (lecture, history, essay, writing worth re-reading) | Full local copy: title, Understand Q&A, note, folder path, preview meta | Full FTS: understand + note + folder + title |
| **Place-like** (food spot, hangout, hotel, travel destination) | **Light stub only:** id, title, Understand Q&A, user_note, folder path | FTS on **Understand + note** (+ title stub). No thumbnail / map / open-link offline |

| Mode | Behavior |
|------|----------|
| Offline search | Query local SQLite FTS only (selective fields above) |
| Online search | Server authoritative; merge pending local changes into results |
| Sync | Notion-style pending queue (§13); on sync-down, place-like saves pull light stub only; content-like pull full local row |

**Offline UI for place-like saves:** show title + Understand reflection + note. **Hide / disable** map pin, “Open original,” and thumbnail (need connection). Show a quiet “Needs connection for map & link” hint.

**Hybrid rule:** if primary intent is “read/watch this” → content-like (full offline). If primary intent is “go here” → place-like (light offline). Decided at Understand end (§7.5).

### 5.3 Search result payload

Return snippet from **best-matching field** (prefer Understand excerpt):

```json
{
  "save_id": "...",
  "title": "Best ramen in Shibuya",
  "platform": "instagram",
  "folder_path": "Trips / Japan 2026 / Food",
  "match_snippet": "…casual, not too expensive…",
  "match_field": "understand",
  "has_reminder": true,
  "has_map_pin": true,
  "content_kind": "place",
  "offline_available": "light"
}
```

---

## 6. Save ingress (share flow)

### 6.0 Unified UX (both platforms)

Product flow is identical on iOS and Android:

```
User taps Share → our app
  → receive url / text / image
  → create save in local queue (+ upload when possible)
  → open main app immediately
  → Understand Q&A (or rare skip if quota allows)
  → pick / create folder on the same screen
  → Done → Library
```

**No** “Saved ✓ — Open app to reflect” dead-end. Understand + folder assignment happen in the same session as the share.

### 6.1 Why native plumbing differs (but UX does not)

iOS and Android force different *mechanics* for receiving a share. The UI destination is the same.

| | iOS | Android |
|---|-----|---------|
| System surface | **Share Extension** — a separate mini-process (sandboxed, short-lived, limited memory) | **Share Target** — can launch your main Activity directly with an Intent |
| Why not run Understand inside the share UI? | Extensions are not the full app — no reliable long LLM session, limited nav, OS may kill them | Android *can* land in the main app immediately |
| Our pattern | Extension only **captures** data → writes App Group SQLite → **opens main app** via URL scheme (`attentionspan://understand/{saveId}`) | Intent lands on main **ShareReceive** screen → same Understand + folder UI |
| Upload | Background `URLSession` from App Group | WorkManager / foreground upload from main process |

So the docs looked different because of OS constraints, not because the product flow differs. Both end on the same screen: **Understand → folder → done**.

### 6.2 iOS Share Extension (capture → handoff)

1. User taps Share → Attention Span.
2. Extension receives `url`, `text`, `image`.
3. Writes save to **App Group** shared SQLite (`status = understand_pending`).
4. Enqueues background `URLSession` upload of payload / screenshot.
5. Extension calls open URL → **main app launches** on Understand screen for that `save_id`.
6. Extension dismisses. Main app owns Understand + folder UI.

### 6.3 Android Share Target (direct into main app)

1. User taps Share → Attention Span (`SEND` / `SEND_MULTIPLE` for `text/plain`, `image/*`).
2. Main Activity opens with Intent extras (url / text / image URI).
3. App creates save in local SQLite + enqueues upload (WorkManager).
4. Navigates straight to **same** Understand + folder screen as iOS.

### 6.4 Post-share screen (shared RN screen)

**Order is fixed:**

```
1. Understand questions (one at a time)
2. After last question → completion step:
     - content_kind chip
     - reminder / map suggestions (if any)
     - Add to folder (pick or create)
3. Done → Library
```

Folder picker appears **only after the last Understand question** — not during Q&A, not before.

```
┌──────────────────────────────────────┐
│  Reflection saved                    │
│  [preview: thumb / title / platform] │
├──────────────────────────────────────┤
│  This looks like: [ Place ▼ ]        │
│  [ Suggested reminder ] [✓]          │
│  [ Suggested map pin ]  [✓]          │
├──────────────────────────────────────┤
│  Add to folder                       │
│  [ Trips › Japan 2026 › Food    ▼ ]  │
│  [ + New folder ]                    │
├──────────────────────────────────────┤
│              [ Done ]                │
└──────────────────────────────────────┘
```

Folder is encouraged but optional (null → Uncategorized). User can move later from Library.

### 6.5 Preview resolution (no AI body parse)

| Platform | Preview strategy |
|----------|------------------|
| YouTube | oEmbed / YouTube Data API (title, thumb) |
| Instagram | Open Graph / meta scrape (best-effort; may need proxy if blocked) |
| Reddit | Reddit oEmbed / JSON `.json` suffix |
| Substack | OG tags from post URL |
| Screenshot | Upload image → store in S3 → optional OCR for title hint only (not v1 requirement) |

Preview job runs async; save exists immediately with `CREATED` → `PREVIEW_READY` → user is already on Understand (title may fill in as preview arrives).

---

## 7. Understand service (AI questions only)

### 7.1 Responsibility boundary

**AI does:**
- Generate 2–4 short, contextual questions from `{ platform, title, url, optional user_note }`.
- Optionally one follow-up if user answer is very vague (max 1 follow-up per session).
- Parse **time intent** in answers → suggest reminder (user confirms).
- Detect **place intent** only when the save is about a location-type thing (restaurants, hangouts, hotels, travel spots, etc.) → suggest map pin (user confirms). Never suggest pins for recipes, workouts, articles, books, products, etc.

**AI does not:**
- Scrape or summarize post body.
- Auto-assign folders.
- Auto-extract recipe ingredients, hours, etc.
- Ask about location for non-place content.

### 7.2 Session flow (API)

Understand is the **default** path after share. Skip is a rare escape hatch, not the first check that bypasses everything.

```
After share → open Understand screen

GET  /me/settings  (or include in start response)
  → { skips_remaining, window_days }

POST /saves/{id}/understand/start
  → returns first question(s)
  → session status = in_progress

POST /saves/{id}/understand/answer
  body: { answer: string }
  → next question | suggestions { reminder?, map_pin? } | ready_to_complete

POST /saves/{id}/understand/complete
  body: { folder_id?, content_kind?, reminder?, map_pin? }
  → rebuild search index
  → status UNDERSTAND_DONE
  → assign folder if provided

POST /saves/{id}/understand/skip   ← only if skips_remaining > 0
  → consume 1 skip
  → session status = skipped
  → save stays UNDERSTAND_PENDING (Inbox badge)
  → reduced search weight until completed later
```

**Skip does not delete the Understand obligation.** It only postpones it.

#### Revisit after skip (required)

| When | What happens |
|------|----------------|
| User skipped earlier | Save sits in Inbox with “Finish reflection” |
| User opens it later | Same `start` → `answer` → `complete` APIs (fresh or resumed session) |
| Quota was used on skip | Revisit does **not** need quota — they are completing, not skipping again |
| Quota exhausted at share time | “Answer later” hidden; must complete Understand or delete save now |

```
Skip path:
  share → skip (quota OK) → Inbox
       → later: tap save → understand/start → answer… → complete → UNDERSTAND_DONE

Normal path:
  share → start → answer… → complete (+ folder) → UNDERSTAND_DONE
```

### 7.3 LLM prompt guardrails

- Max **4 questions** per session (hard cap).
- Tone: curious, not interrogative.
- Always allow freeform; never force multiple-choice only.
- Stop early if user gives rich answer covering purpose + timing + reminder.
- Never nag if user says “done” / skips follow-up.

### 7.4 Skip threshold (server-enforced)

```json
{
  "skip_quota": {
    "max_skips": 2,
    "window_days": 7
  }
}
```

Skip denied → user must complete Understand or delete save.

### 7.5 Content kind — decided at Understand end

**“Decide at Understand end”** means: after the Q&A finishes (or on the completion screen), the app assigns a `content_kind` that drives offline policy and map suggestions. It is **not** decided at share time.

```
Share → preview only (no kind yet)
     → Understand Q&A (user explains why they saved it)
     → On complete: set content_kind + offline_policy
     → Sync-down / local store follows that policy
```

| `content_kind` | How it’s decided | Offline | Map suggest |
|----------------|------------------|---------|-------------|
| `place` | Title + answers point to a place to visit (food, hangout, hotel, neighborhood) | Light: Understand + note (+ title stub) | Yes |
| `content` | Lecture, essay, history, writing, video to rewatch | Full local index | No |
| `other` | Ambiguous / tools / products / workouts | Light stub (no map) unless user upgrades | No |

**UI:** on completion screen, show a soft confirmation chip the user can flip if AI guessed wrong:

```
This looks like: [ Place to visit ▼ ]   ← user can change to “Something to read/watch”
```

Hybrid example: Substack *about* Tokyo restaurants → if user said “read for trip research” → `content`; if “go to these spots” → `place`.

Add to `saves`:

```sql
content_kind   enum('place','content','other') nullable,  -- set at Understand complete
offline_policy enum('full','light') NOT NULL DEFAULT 'light'
```

---

## 8. Organization service

- CRUD folders with `parent_id`.
- Move save between folders (updates search doc path).
- Reorder folders (`sort_order` sibling scope).
- Soft delete folder → prompt: move saves to parent / uncategorized / delete saves.

No AI involvement.

---

## 9. Reminders & notifications

### 9.1 Creation sources

1. **Understand suggestion** — AI detects “remind me 2 weeks before trip” → user confirms datetime.
2. **Manual in-app** — from save detail / post-share screen.
3. **External calendar (optional)** — user can also push the reminder into **Apple Calendar** or **Google Calendar**.

### 9.2 Delivery targets

When creating/confirming a reminder, user picks one or both:

| Target | How it works |
|--------|----------------|
| **In-app** (default) | Store in `reminders` table → our worker → push (APNs/FCM) → deep link to save |
| **Apple Calendar** | iOS: EventKit creates a calendar event/alarm linked to the save (store `external_event_id`) |
| **Google Calendar** | Android / cross-platform: Google Calendar API (OAuth) creates event; store `external_event_id` |

```
┌─────────────────────────────────────┐
│  Reminder: Mar 15, 9:00 AM          │
│  ☑ Notify in Attention Span         │
│  ☐ Add to Apple / Google Calendar   │
└─────────────────────────────────────┘
```

User can use **only in-app**, **only calendar**, or **both**.

### 9.3 Schema addition

```sql
reminders (
  ...
  delivery        enum('in_app','calendar','both') NOT NULL DEFAULT 'in_app',
  calendar_provider enum('apple','google') nullable,
  external_event_id text nullable,  -- EventKit / Google event id for edit/delete sync
  ...
)
```

### 9.4 Scheduler (in-app path)

- Worker cron every minute: `SELECT * FROM reminders WHERE fire_at <= now() AND status = 'scheduled' AND delivery IN ('in_app','both')`.
- Send push with deep link to save.
- Mark `sent`; optional “snooze” action on notification.

Calendar-only reminders are owned by Apple/Google (their notifications fire); we still keep a row for deep-link metadata and cleanup if the save is deleted.

### 9.5 Timezone

Store user timezone on profile; parse relative phrases (“before May trip”) only when user also supplied anchor date in Understand answer, else ask clarifying question.

---

## 10. Map service

### 10.1 Pin creation

| Source | Flow |
|--------|------|
| User answer (place-type only) | “Ramen in Shibuya” on a restaurant save → geocode → pin preview → user confirms/adjusts |
| Manual | Long-press on map → attach to save (escape hatch for any save) |
| Non-place save | No auto suggestion — recipe / workout / article never prompts for a pin |

**Place-intent gate:** only auto-suggest map pins when title + Understand answers indicate a real-world place to visit (food spots, hangouts, hotels, neighborhoods). Everything else skips map logic entirely.

### 10.2 Map queries

- `GET /map/pins?bbox=...` — clustered pins in viewport.
- Tap pin → save detail.
- Filter by folder subtree optional (v1.1).

Geocoding is **best-effort** from user text, not from scraped post content.

---

## 11. API surface (v1)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/auth/*` | Login (delegated to auth provider) |
| GET | `/saves` | List saves (filter: status, folder, platform) |
| POST | `/saves` | Create from share (internal/extension) |
| GET | `/saves/:id` | Detail |
| PATCH | `/saves/:id` | Note, folder, archive |
| DELETE | `/saves/:id` | Delete |
| POST | `/saves/:id/understand/*` | Understand flow |
| GET | `/search?q=` | Intent-weighted search |
| GET/POST/PATCH/DELETE | `/folders` | Folder tree CRUD |
| POST | `/saves/:id/reminder` | Create/update reminder |
| GET | `/map/pins` | Map viewport pins |
| POST | `/saves/:id/map-pin` | Create/adjust pin |
| GET | `/me/settings` | Skip quota, prefs |

---

## 12. Mobile app modules

```
apps/mobile/
├── src/
│   ├── share/           # deep link handler, pending queue drain
│   ├── understand/      # Q&A UI, skip gate
│   ├── library/         # folder tree, save list
│   ├── search/          # search bar + ranked results
│   ├── save-detail/     # note, reminder, map, move folder
│   ├── map/             # map tab
│   ├── folders/         # create/rename/nest/delete
│   └── sync/            # offline queue, conflict resolution
├── ios/ShareExtension/
└── android/share/
```

### 12.1 Navigation (tabs)

1. **Inbox** — saves pending Understand + recent
2. **Library** — folder tree + saves
3. **Map** — pins
4. **Search** — dedicated tab or omnipresent header (product decision; spec recommends header + tab)

### 12.2 Offline behavior

| Action | Offline |
|--------|---------|
| Share save | ✅ queued locally |
| Complete Understand | ✅ local; sets `content_kind`; sync later |
| Search | ✅ selective — full for `content`, Understand+note for `place` |
| Place save detail | Show title + Understand + note; **hide** map / open link / thumbnail |
| Content save detail | Full local fields available |
| Reminder schedule | ✅ local; server confirms on sync |
| Map tiles / geocode | ❌ needs connection |

---

## 13. Sync & conflict resolution (Notion-style)

### 13.1 Pending queue rules

Offline changes are always written **locally first**, then sync when the app gets a chance.

| Case | Behavior |
|------|----------|
| **1. Online** | Change → save locally → immediately push to server → server updates |
| **2. Offline, app open** | Change → local pending → when network returns, app detects and syncs |
| **3. Offline, then close app** | Pending stays on disk → sync on **next open** (when online) |
| **4. Offline, OS allows background** | Best-effort background sync if OS grants it (**bonus, not promised** — especially limited on iOS). Product copy: “Changes sync when you open the app.” |
| **5. Multi-device** | Each device has its own pending queue → server reconciles → other devices pull |

### 13.2 Sync-down (selective)

| Kind | What lands on device |
|------|----------------------|
| `content` + `offline_policy=full` | Full row for offline use + FTS |
| `place` / `light` | Stub only: id, title, Understand Q&A, note, folder — **not** thumbnail blob, map geometry cache, or link-preview assets |

Full place assets load when online.

### 13.3 Multi-device conflicts — user confirms (not silent LWW)

When the same save was changed on two devices and both have pending/divergent versions:

1. On sync, show a **conflict preview**:
   - **Your local changes** (text preview of note / Understand / folder)
   - **Server version** (what’s already online)
2. User chooses:
   - **Confirm** → keep local version, push to server (overwrite remote)
   - **Discard** → drop local pending, keep server version
3. No silent last-write-wins for user-visible fields (note, Understand, folder).

```
┌─────────────────────────────────────────┐
│  This save changed on another device    │
├─────────────────────────────────────────┤
│  Your version (offline)                 │
│  Note: "meet at 7, outdoor seats"       │
│                                         │
│  On server                              │
│  Note: "ask Sarah first"                │
├─────────────────────────────────────────┤
│  [ Discard mine ]    [ Confirm mine ]   │
└─────────────────────────────────────────┘
```

- **Primary key:** UUID client-generated for saves (share extension can create ID before upload).
- **Understand session:** append-only `qa_pairs` where possible; if both sides edited reflection, use same Confirm / Discard preview.
- **Folder tree:** server version counter; client pulls on app foreground; structural conflicts rare — same Confirm / Discard if needed.

---

## 14. Security & privacy

- Auth: JWT short-lived + refresh; extension uses app group token vault.
- Understand Q&A and notes encrypted at rest (DB + S3 SSE).
- LLM calls: send **only** title, platform, URL, user answers — never require post body.
- User data export + delete account (GDPR-ready).
- Rate limits on search and LLM endpoints.

---

## 15. Observability

- Events: `save_created`, `understand_completed`, `understand_skipped`, `search_query`, `reminder_fired`, `map_pin_added`.
- Funnel metric: **share → understand complete → revisit within 7d** (core product health).

---

## 16. v1 non-goals (architecture)

- Ask AI about your library (RAG over saves)
- AI auto-organization / auto-tags
- AI content extraction (recipes, hours, prices)
- Shared collections / social
- Web app / browser extension
- Import from 13+ platforms (only 5 sources)
- OCR on screenshots (optional later)

---

## 17. Build sequence

| Phase | Deliverable |
|-------|-------------|
| **P0** | Auth, Save CRUD, preview resolver, share extension (URL only) |
| **P1** | Understand flow + LLM + skip quota |
| **P2** | Folders (nested) + search index with weights |
| **P3** | Reminders + push |
| **P4** | Map pins + geocoding |
| **P5** | Screenshot share + offline sync polish |
| **P6** | Platform hardening (Instagram OG reliability) |

---

## 18. Open technical decisions

| Decision | Options | Recommendation |
|----------|---------|----------------|
| Cross-platform vs native | RN vs Swift+Kotlin | RN + native share targets for v1 speed |
| Search engine | Postgres FTS vs Typesense | Postgres v1; Typesense if >100k saves/user (unlikely) |
| Understand model | GPT-4o-mini vs Claude Haiku | Haiku/GPT-4o-mini — cheap, fast, short outputs |
| Instagram preview | Scrape vs manual paste fallback | Scrape + graceful “add title manually” fallback |

---

*Next document: [product-spec.md](./product-spec.md)*
