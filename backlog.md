# Attention Span: backlog and decisions

What we agreed on and what we deferred, from the planning conversation (Nov 2026). Move items into "MVP" when they get scheduled.

## Decisions so far

- **Native mobile app only** (iOS + Android). The web build is not the product.
- **Instagram only** for now. The code also handles Reddit, YouTube and Substack; keep that code, hide those platforms in the UI.
- **Our app shows only your saves, with no feed.** Show the post inside the app where possible. If the user opens it in Instagram, nudge them back after a while.
- **Home screen depends on the user:**
  - New user (few decisions so far) → the sorting deck.
  - Established user → **Mirror**: progress, including the ratio, with a one-line realistic, optimistic next step (e.g. "Normal at the start. Sort a few a day for 3–4 days and you'll catch up.").
  - Under Mirror, an **inline card** shows the next 2–3 reminders with "View all reminders". If nothing is due, it shows "N saves waiting to be sorted".
- **Let-go saves are never shown.** Counts only.
- **Swipe deck (Bumble style):** left = let go, right = done, up = plan. Visible buttons for every action, undo toast after each swipe. Plan/distill open a bottom sheet over the deck, and closing it returns the user to the next card.
- **AI suggests the category; the user confirms it during the swipe.**
- **Expiry:** events use their own end date; everything else is a static 7 days for the MVP.
- **One grouped notification:** "X saves expire today", with an estimated sorting time computed from the actual saves (not a fixed number).
- **Trip detection:** v1 = notice the user has arrived (phone time zone / country change) and bring back saves for that place. v2 = notice a burst of 5+ saves on one topic in a week and ask "Planning a trip? When?"
- **Importing old saves is dropped.**
- **In-app post viewer:** "Open original" opens a floating, draggable, resizable window (Instagram embed) inside our app. It has a maximum size and **never goes full screen**, including for video. If a post can't be embedded, fall back to opening Instagram with a return nudge.
- **Swipe down = distill.** All four directions are explained in a first-run guide inside the app, with a "?" to see it again.
- **"Established" user** = at least one decision of any kind (done, planned, distilled, let go). Mirror shows the real ratio plus a pushy-but-honest one-liner. No made-up statistics.
- **Expiry by category:** place = never expires, comes back on arrival so the user decides there; event = event end date; everything else (incl. recipes) = 7 days.
- **Sorting-time estimate:** default per category on day one; after that, the median of the user's own recent decision times for that category.
- **Categories (MVP):** place, recipe, watch, read, learn, tool, buy, routine, quote, meme, event, other.
- **Users can rename categories.** The database keeps the fixed category keys (which drive expiry and estimates) and stores each user's own label for a key separately, so renaming never changes the rules.
- **MVP deadline:** ~2 days from 2026-11-13, including arrival detection.

## Later

### Next version
- [ ] **Voice save:** the user says where to save it, the category, when to be reminded and why. AI turns that into the same fields the swipe/plan flow fills, and saves without more taps.
- [ ] **Burst detection:** 5+ saves on one place/topic within a week → "Planning a trip? When?"
- [ ] **Reel transcription** to improve category, title and place detection. Needs the video file, which Instagram doesn't provide for other people's posts, so decide on the approach (and the Terms of Use risk) first.
- [ ] **Background location** for a real "you've arrived" push (MVP checks on app open).
- [ ] **Vector search** (semantic embeddings). Needs a proper design discussion first, including whether to combine it with the existing keyword search.

### Turn saves into next steps
- [ ] Recipe → grocery list
- [ ] Place → Google Maps list / calendar event
- [ ] Long video / article → short summary

### Platforms
- [ ] Pinterest
- [ ] Re-enable Reddit, YouTube, Substack in the UI

### Reminders
- [ ] "When I'm near it" reminders (native location, geocoded place)
- [ ] Apple / Google Calendar reminders
- [ ] Map view for place saves

### Notifications
- [ ] Test grouped-by-expiry vs fixed daily notification (alternate weeks)

### Earlier spec items still open
- [ ] OCR for screenshot saves
- [ ] Offline mode and multi-device sync
- [ ] Remove or archive the unused Understand Q&A code (`apps/api/src/routes/understand.ts`, `services/understandLlm.ts`)

### Research
- [ ] 8–10 user interviews with the "count your saves" exercise (saved vs actually used)

### Housekeeping
- [ ] Line-by-line walkthrough of the codebase (continue `file_explanations.md`)
- [ ] Keep `.env*` files out of anything shared or committed

## Open questions
- **Instagram post content:** can we reliably get the caption (Meta oEmbed, tokenless since June 2026)? The category suggestion, sorting-time estimate, arrival detection and search all depend on it.
