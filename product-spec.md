# Product Spec — Intentional Save App (v1)

Working name: **Attention Span** (placeholder).

Companion doc: [architecture.md](./architecture.md)

---

## 1. Vision & positioning

### One-liner

A save-for-later app that helps you **actually do** the things you save — by making you pause, reflect, and capture *why* before it disappears into a digital pile.

### vs Albo


|            | Albo                                 | Us                                         |
| ---------- | ------------------------------------ | ------------------------------------------ |
| Understand | AI reads content, extracts structure | AI asks *you* why you saved it             |
| Organize   | AI auto-categorizes                  | You build folders (Notion-style)           |
| Search     | Parsed content + metadata            | **Intent-based** — your words at save time |
| Philosophy | “We understand the link for you”     | “You understand why it matters”            |


### Target user

People who save recipes, places, articles, and videos across social apps but rarely act on them — and want a system that supports **intentional consumption**, not more hoarding.

---

## 2. v1 scope summary

### In scope

- Save from: **Instagram, Reddit, Substack, YouTube, screenshots**
- Share opens the **main app** → Understand → folder (after last question)
- **Understand** step: AI-generated questions, user freeform answers, rare skip with later revisit
- **Manual organization**: nested folders (max **5 levels** in v1; create, rename, delete, move)
- **Intent-based search** with ranking: Understand > note > folder > title
- **Reminders**: in-app push and/or **Apple / Google Calendar**
- **Map view** for **place-type** saves only (food, hangouts, hotels, etc.)
- **Selective offline**: full for content-like saves; light (Understand + note) for place-like
- **Notion-style sync** + user Confirm/Discard on multi-device conflicts
- Mark saves **Done** / **Archive** / **Delete**
- iOS + Android

### Out of scope (v1)

- “Ask AI about your saves”
- AI content extraction (ingredients, hours, prices)
- Auto-organization / smart tags
- Shared collections / friends
- Web app, browser extension
- Import from TikTok, Pinterest, etc.
- Social features, public profiles

---

## 3. Core user journeys

### Journey A — Happy path: save → understand → organize → rediscover

```
1. User sees Instagram reel (ramen spot in Shibuya)
2. Share → Attention Span
3. App opens immediately on Understand screen (not a “open later” toast)
4. AI asks 2–3 short questions; user answers freely
5. After last question → completion screen:
   - content kind chip (“Place to visit”)
   - reminder suggestion (in-app and/or calendar)
   - map pin suggestion (place-type only)
   - Add to folder: Trips → Japan 2026 → Food
6. Done → Library; searchable immediately
7. Three weeks later: reminder fires → user opens save → visits restaurant
8. User marks save Done (acted on it); can Archive or Delete later
```

### Journey B — Search rediscovery

```
1. User remembers "that cheap dinner spot for Tokyo"
2. Opens Search, types "cheap dinner Tokyo"
3. Top result: ramen save — snippet from Understand answer
   "…casual, not too expensive, Tokyo trip in April…"
4. Tap → save detail → map pin, reminder, original link
```

### Journey C — Emergency skip → revisit later

```
1. User saves link while running to meeting
2. Understand screen appears (app opened from share)
3. Taps "Answer later" → skip quota check (2 per 7 days)
4. If allowed: save goes to Inbox with “Finish reflection” badge
5. Searchable at reduced rank until completed
6. Later (when they have time): open from Inbox → full Understand
   → completion (folder etc.) → UNDERSTAND_DONE
7. Revisit does NOT consume another skip
```

### Journey D — Screenshot save

```
1. User screenshots a Substack headline or Reddit thread
2. Share image → Attention Span → app opens Understand
3. Preview: image thumbnail; title optional/manual if OCR not in v1
4. Understand → after last Q → folder → Done
5. Searches later by their answers
```

### Journey E — Offline place vs content

```
Place save offline: can search/read Understand + note;
  map / open link / thumbnail hidden until online
Content save offline: full local re-read / search available
```

---

## 4. Information architecture

### App structure

```
Attention Span
├── Inbox                    ← pending Understand + skipped items
├── Library                  ← folder tree + all completed saves
│   └── [Folder]             ← nested navigation
│       └── Save detail
├── Map                      ← geographic view of pinned saves
├── Search                   ← global (also accessible from header)
└── Settings
    ├── Skip quota status
    ├── Notification prefs
    ├── Account
    └── Export / delete data
```

### Save states (user-visible)


| State                  | User sees                     | Primary action                |
| ---------------------- | ----------------------------- | ----------------------------- |
| Pending reflection     | Yellow "Reflect" badge        | Complete Understand           |
| Skipped (finish later) | Orange "Finish later" badge   | Complete Understand (revisit) |
| Ready                  | No badge                      | View, search, remind          |
| Done                   | Check / “Done” mark           | Archive or keep               |
| Archived               | In Archived view only         | Restore or delete             |
| Deleted                | Soft-deleted; gone from lists | —                             |
| Has reminder           | Bell icon                     | Edit reminder                 |
| Has map pin            | Pin icon                      | View on map                   |


---

## 5. Screen-by-screen spec

### 5.1 Share → open app (iOS / Android)

**Purpose:** Capture then immediately reflect. Same product flow on both platforms.

**Flow:**

```
Share → receive url/text/image
     → create save locally (+ upload)
     → open main app on Understand screen
     → Q&A → completion (folder after last question) → Done
```


| Platform | Plumbing                                                              | Product result     |
| -------- | --------------------------------------------------------------------- | ------------------ |
| iOS      | Share Extension writes App Group queue, then deep-links into main app | Same Understand UI |
| Android  | Share Target opens main Activity with Intent                          | Same Understand UI |


**No** dead-end “Saved ✓ — Open app to reflect” screen. Extension/capture only hands off; Understand runs in the main app.

---

### 5.2 Inbox

**Purpose:** Surface saves that need Understand; prevent forgotten skips.

**Layout:**

```
┌──────────────────────────────────────┐
│  Inbox                          [⚙]  │
├──────────────────────────────────────┤
│  🔔 Complete your reflections (3)    │  ← dismissible banner if skips exist
├──────────────────────────────────────┤
│  [thumb] Best ramen in Shibuya       │
│          Instagram · 2 min ago       │
│          [ Reflect now ]             │
├──────────────────────────────────────┤
│  [thumb] 48 hours in Lisbon          │
│          YouTube · 1 hr ago            │
│          [ Finish reflection ]  ← skip│
└──────────────────────────────────────┘
```

**Rules:**

- Sorted: pending first, then skipped (oldest first)
- Swipe left: Delete
- Cannot hide Inbox badge count until all reflections complete or user deletes

---

### 5.3 Understand flow (core differentiator)

**Purpose:** Capture intent at moment of save; enable intentional consumption.

**Entry:** Opens immediately after share (main app). Also: tap unfinished save from Inbox (including skipped → revisit).

**Layout — conversational, not form-like:**

```
┌──────────────────────────────────────┐
│  ←                          Skip (1) │  ← shows remaining skips
├──────────────────────────────────────┤
│  [preview card: thumb, title, platform]
│                                      │
│  Why did you save this?              │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ Want to try on our Tokyo trip  │  │
│  │ in April with friends          │  │
│  └────────────────────────────────┘  │
│                          [ Continue ]│
├──────────────────────────────────────┤
│  Want a reminder about this?         │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ Yes — 2 weeks before the trip  │  │
│  └────────────────────────────────┘  │
│                          [ Continue ]│
└──────────────────────────────────────┘
```

**AI question rules (product):**

- **2–4 questions max** per session
- Questions adapt to prior answers (not a fixed script)
- Always **freeform text**; optional quick-reply chips as hints, never required
- AI must **not** feel like a survey — one question per screen preferred
- If user gives a rich first answer (purpose + timing + vibe), **stop early**

**Suggested question types (AI picks relevant subset):**

1. Why are you saving this?
2. When do you want to act on it?
3. Want a reminder? When?
4. Anything else worth remembering? (vibe, context, who with)
5. (If location detected in answer) Want to pin this on the map?

**Skip behavior:**

- Button: “Answer later” (not “Skip” — softer copy)
- Shows remaining skips: e.g. “1 of 2 left this week”
- If quota exhausted: button hidden; copy explains why reflection matters
- Skipped save: reduced search weight until completed
- **Revisit:** Inbox → same Understand flow → complete; does not consume another skip

**Completion screen (only after the last Understand question):**

Order is fixed — folder is never shown during Q&A:

```
1. Last Understand answer submitted
2. Completion screen:
   - content_kind chip
   - reminder / map suggestions
   - Add to folder (pick or create)
3. Done → Library
```

```
┌──────────────────────────────────────┐
│  ✓ Reflection saved                  │
│                                      │
│  This looks like: [ Place ▼ ]        │
│  [ Suggested: Mar 15 reminder ] [✓]  │
│    └ in-app ☑  calendar ☐            │
│  [ Suggested: Pin in Shibuya   ] [✓]  │  ← place-type only
│                                      │
│  Add to folder                       │
│  [ Trips › Japan 2026 › Food    ▼ ]  │
│  [ + New folder ]                    │
│                                      │
│              [ Done ]                │
└──────────────────────────────────────┘
```

User can accept/reject suggestions; folder optional but encouraged (null → Uncategorized).

---

### 5.4 Library (folder tree)

**Purpose:** User-owned organization — Notion-like, not AI-driven.

**Layout:**

```
┌──────────────────────────────────────┐
│  Library                      [ + ]  │  ← new folder at root
├──────────────────────────────────────┤
│  📁 Trips                        >   │
│  📁 Recipes                      >   │
│  📁 Read later                   >   │
│  📁 Uncategorized (4)            >   │
├──────────────────────────────────────┤
│  Recent                              │
│  [save cards...]                     │
└──────────────────────────────────────┘
```

**Folder drill-down:**

```
Trips › Japan 2026 › Food
├── [save cards]
└── [ + subfolder ] [ ⚙ folder settings ]
```

**Folder actions:**

- Create (name, optional parent)
- Rename
- Move (change parent)
- Delete → confirm, then **delete folder + subfolders + saves inside** (cascade)
- Reorder (drag siblings)
- **Max nesting depth: 5 levels** (v1 free tier; future plans may raise)

**Save card (list item):**

- Thumbnail, title, platform icon
- Folder path (breadcrumb if searching from root)
- Icons: 🔔 reminder, 📍 pin (place-type only)
- Snippet from Understand (one line, truncated)

**Long-press save:** Move to folder, Edit note, Mark Done, Archive, Delete, Add reminder

---

### 5.5 Save detail

**Purpose:** Single save hub — link back to source, edit metadata, act.

```
┌──────────────────────────────────────┐
│  ←                          ···      │
├──────────────────────────────────────┤
│  [ large preview / open in app ]     │
│  Best ramen in Shibuya               │
│  Instagram · saved Mar 1             │
├──────────────────────────────────────┤
│  Your reflection                     │
│  "Want to try on Tokyo trip in       │
│   April — casual, not expensive"     │
│  [ Edit reflection ]                 │
├──────────────────────────────────────┤
│  Note                                │
│  [ optional user note field ]        │
├──────────────────────────────────────┤
│  Folder: Trips › Japan 2026 › Food   │
│  Reminder: Mar 15, 9:00 AM      [✎]  │
│  Map: Shibuya, Tokyo            [✎]  │
├──────────────────────────────────────┤
│  [ Open original ]  [ View on map ]  │
└──────────────────────────────────────┘
```

**Edit reflection:** Re-opens Understand Q&A as editable transcript (not re-run AI from scratch unless user taps “Re-reflect”).

---

### 5.6 Search

**Purpose:** Intent-first rediscovery — match how users remember saves.

**Entry:** Search tab + persistent search icon in Library/Inbox header.

```
┌──────────────────────────────────────┐
│  🔍 cheap dinner tokyo               │
├──────────────────────────────────────┤
│  Best ramen in Shibuya               │
│  Instagram · Trips › Japan 2026      │
│  "…casual, not too expensive,        │
│   Tokyo trip in April…"                │  ← Understand snippet
│                              📍 🔔   │
├──────────────────────────────────────┤
│  Tokyo street food guide             │
│  YouTube · Trips › Japan 2026        │
│  "…cheap eats, dinner spots…"          │  ← lower rank if only title match
└──────────────────────────────────────┘
```

**Ranking rules (user-visible behavior, not UI copy):**

1. Match in **Understand answers** → top
2. Match in **user note**
3. Match in **folder path**
4. Match in **title / URL** only → lower

**Empty state:** “Try words you’d use to remember why you saved it — ‘May trip’, ‘cheap dinner’, ‘read before bed’.”

**Filters (v1 nice-to-have, else v1.1):**

- Platform
- Has reminder
- Has map pin
- Folder

---

### 5.7 Map

**Purpose:** Spatial rediscovery for places saved with location intent.

```
┌──────────────────────────────────────┐
│  Map                          [ ≡ ]  │  ← filter by folder (v1.1)
├──────────────────────────────────────┤
│                                      │
│         [ interactive map ]          │
│              📍 📍                   │
│                   📍                 │
│                                      │
├──────────────────────────────────────┤
│  Tap pin → bottom sheet:             │
│  [thumb] Best ramen in Shibuya       │
│  "Tokyo trip, casual dinner"         │
│  [ Open save ]                       │
└──────────────────────────────────────┘
```

**Pin sources:**

- Place-type save + user mentioned a place in Understand → geocoded → user confirmed
- User manually placed/adjusted on map from save detail

**Place-type only:** auto map suggestions only for food places, hangouts, hotels, neighborhoods, travel spots — **not** recipes, workouts, articles, books, products.

**No pin:** Non-place saves never get auto pin prompts. Offline: map UI hidden for place saves until online.

---

### 5.8 Reminders

**Creation:**

1. Suggested during Understand (primary path)
2. Manual from save detail
3. Optional: also add to **Apple Calendar** or **Google Calendar**

**Delivery (user chooses one or both):**

```
┌─────────────────────────────────────┐
│  Reminder: Mar 15, 9:00 AM          │
│  ☑ Notify in Attention Span         │
│  ☐ Add to Apple / Google Calendar   │
└─────────────────────────────────────┘
```

**In-app notification:**

```
Attention Span
Reminder: Best ramen in Shibuya
"You wanted to try this on your Tokyo trip"
[ Open ]
```

**Actions:** Open save, Snooze (1 day / 1 week), Dismiss

**Settings:** Default reminder time (e.g. 9:00 AM), quiet hours, calendar connect

---

### 5.9 Settings


| Setting               | Default                       |
| --------------------- | ----------------------------- |
| Skip quota display    | “1 of 2 skips left this week” |
| Default reminder time | 9:00 AM local                 |
| Notifications         | On                            |
| Timezone              | Auto                          |


**Account:** Export data (JSON), Delete account

---

## 6. Platform-specific save behavior


| Platform       | Share input          | Preview                 | Notes                               |
| -------------- | -------------------- | ----------------------- | ----------------------------------- |
| **Instagram**  | URL from share sheet | OG title + thumb        | Fallback: user edits title          |
| **Reddit**     | Post URL             | Reddit oEmbed           | Works for posts + comments          |
| **Substack**   | Article URL          | OG tags                 | Newsletter posts                    |
| **YouTube**    | Video URL            | oEmbed title + thumb    |                                     |
| **Screenshot** | Image                | Uploaded image as thumb | Title manual or “Screenshot · date” |


---

## 7. Understand AI — product rules

### Personality

- Curious friend, not productivity coach
- Short sentences
- Never guilt-trip skipped reflections

### Question generation inputs

- Platform
- Title (if available)
- URL (domain only shown to user; full URL to AI)
- Optional: first word of user note if added at save time

### Hard limits


| Rule                              | Value               |
| --------------------------------- | ------------------- |
| Max questions                     | 4                   |
| Max follow-ups after vague answer | 1                   |
| Max session length                | ~90 seconds typical |


### Stop conditions (complete early)

- User answer includes purpose + timeframe
- User writes “just bookmarking for later” → one clarifying question max, then done
- User taps “Done reflecting” (always available after Q1)

### Location & reminder detection

- Map pin offer **only** for place-type intent (food, hangouts, hotels, travel) — never for recipes/articles/workouts/etc.
- If answer mentions time → offer reminder (confirm); user can pick in-app and/or calendar
- Never auto-create without user tap

### Content kind (at Understand end)

After Q&A, set `content_kind` (user can flip chip):

- **Place** → light offline (Understand + note); map eligible
- **Content** (lecture, essay, writing, rewatch) → full offline
- **Other** → light offline; no map

---

## 8. Skip quota spec


| Parameter | Value              |
| --------- | ------------------ |
| Max skips | 2                  |
| Window    | 7 rolling days     |
| Reset     | Per skip timestamp |


**Default path:** always Understand (`start` → `answer` → `complete`). Skip is optional escape hatch.

**When quota exceeded:**

- “Answer later” hidden
- Copy: “You’ve used your skips this week. A quick reflection helps you find this later.”
- User must complete Understand or delete save

**Revisit after skip (required):**

- Skipped saves stay in Inbox until Understand is completed
- Opening later runs the full Understand flow again
- Completing later does **not** consume another skip

**Emergency framing:** Skips are for genuine urgency, not convenience.

---

## 9. Search spec (detailed)

### Indexed fields


| Field              | Example                     | Search weight   |
| ------------------ | --------------------------- | --------------- |
| Understand answers | “casual, not too expensive” | **A (highest)** |
| User note          | “check with Sarah first”    | B               |
| Folder path        | “Trips / Japan 2026 / Food” | C               |
| Title              | “Best ramen in Shibuya”     | D               |
| URL                | instagram.com/...           | D               |


### Example ranking scenario

**Query:** `cheap dinner`


| Save | Understand                  | Title                   | Rank                   |
| ---- | --------------------------- | ----------------------- | ---------------------- |
| A    | “casual, not too expensive” | “Best ramen in Shibuya” | **1st**                |
| B    | “fancy tasting menu”        | “cheap dinner hacks”    | 2nd (title match only) |
| C    | (skipped, no Understand)    | “Dinner in Tokyo”       | 3rd (reduced weight)   |


### Snippet display

Always prefer the highest-weight matched field for the result subtitle.

---

## 10. Offline, sync & edge cases

### Selective offline


| Kind             | Offline                                             | Offline search           |
| ---------------- | --------------------------------------------------- | ------------------------ |
| Content-like     | Full (title, Understand, note, folder, preview)     | Full intent search       |
| Place-like       | Light: title stub + Understand + note               | Search Understand + note |
| Place UI offline | Hide map, open link, thumbnail — “Needs connection” | —                        |


### Sync (Notion-style)

1. **Online:** change → local → immediate server push
2. **Offline, app open:** pending → sync when network returns
3. **Offline, app closed:** pending on disk → sync on next open
4. **Background:** best-effort if OS allows (bonus, not promised — especially iOS)
5. **Multi-device:** each device queues → server reconciles → others pull

**Conflicts:** show text preview of local vs server → **Confirm mine** or **Discard mine**. No silent overwrite.

### Other edge cases


| Scenario                       | Behavior                                                           |
| ------------------------------ | ------------------------------------------------------------------ |
| Preview fetch fails            | Save still created; title = domain or “Untitled”; user can edit    |
| Offline share                  | Queue locally; open Understand; sync when online                   |
| Offline Understand             | Full flow works; sync Q&A later                                    |
| User deletes folder with saves | Confirm, then cascade-delete folder, subfolders, and saves inside  |
| Duplicate URL save             | Popup: “Already saved on [date]. Replace it?” → **Replace** (overwrite existing + restart Understand) or **Cancel** (keep existing, discard new share). No silent duplicates. |
| LLM timeout / unavailable      | **503** `LLM_UNAVAILABLE` — client shows error; user retries or completes later |
| Geocode fails                  | “Couldn’t find location — pin manually?”                           |


---

## 11. Success metrics (v1)


| Metric                           | Why                    |
| -------------------------------- | ---------------------- |
| Share → Understand complete rate | Core funnel            |
| Skip rate                        | Should stay low (<15%) |
| Search → open save rate          | Search utility         |
| Reminder → open save rate        | Action loop            |
| Saves with folder assigned       | Organization adoption  |
| 7-day return visit               | Retention              |


**North star:** % of saves that user **reopens** within 30 days (proves intentional save → actual revisit).

---

## 12. Copy & tone guidelines

- **Reflect**, not “interrogate” or “survey”
- **Answer later**, not “Skip”
- **Your reflection**, not “Metadata” or “Tags”
- Search placeholder: *“How would you remember this?”*
- Empty Inbox: *“You’re all caught up. Save something that inspires you.”*

---

## 13. v1 release checklist

### Must ship

- [ ] Share → open main app → Understand (iOS + Android)
- [ ] Understand flow with AI questions + skip quota + revisit
- [ ] Folder pick after last Understand question (max 5 nest levels)
- [ ] Intent-weighted search
- [ ] Reminders: in-app push + Apple/Google Calendar option
- [ ] Map for place-type pins only
- [ ] Selective offline + Notion-style sync + Confirm/Discard conflicts
- [ ] Done / Archive / Delete states

### Should ship

- [ ] Edit reflection after complete
- [ ] Duplicate URL popup: Replace / Cancel
- [ ] Content-kind chip flip on completion

### Can wait (v1.1)

- [ ] Search filters
- [ ] Map filter by folder
- [ ] OCR for screenshot titles
- [ ] Widget (“Reflect on 2 saves”)
- [ ] Deeper folder nesting via paid plan

---

## 14. Future roadmap (post-v1)

1. **Ask AI about saves** (RAG) — explicitly deferred
2. Shared folders / trip planning with friends
3. More platforms (TikTok, Pinterest)
4. Web clipper
5. Weekly “resurface” digest (non-AI: based on reminders + stale saves)
6. Optional AI summarize — only if user opts in (conflicts with philosophy)

---

## 15. Open product decisions


| #   | Question                          | Decision                                               |
| --- | --------------------------------- | ------------------------------------------------------ |
| 1   | Auto-open Understand after share? | **Yes — open main app immediately** (locked)           |
| 2   | Duplicate URLs?                   | Popup: already saved — **Replace** or **Cancel** (locked) |
| 3   | Require folder on complete?       | Encourage, don’t require (Uncategorized OK)            |
| 3b  | When does folder pick appear?     | **After last Understand question** (locked)            |
| 4   | “Re-reflect” re-runs AI?          | v1.1; v1 = edit transcript only                        |
| 5   | App name final?                   | TBD — see name shortlist below                         |
| 6   | Offline for places?               | Light: Understand + note; hide map/link/thumb (locked) |
| 7   | Multi-device conflict?            | Confirm / Discard preview (locked)                     |
| 8   | Calendar reminders?               | Optional Apple / Google alongside in-app (locked)      |



### Duplicate URL popup (locked)

```
┌─────────────────────────────────────┐
│  Already saved                      │
│                                     │
│  You saved this on Mar 1.           │
│  Replace it with this new save?     │
│                                     │
│  [ Cancel ]           [ Replace ]   │
└─────────────────────────────────────┘
```

- **Replace** → overwrite the existing save (new preview/timestamp); restart Understand for fresh intent.
- **Cancel** → keep the old save; discard the new share attempt.

---

*Document version: v1.2 — duplicate Replace/Cancel popup locked*
