# Attention Span – MVP Scope

**Problem statement:** People who save recipes, places, articles, and videos across Instagram, Reddit, Substack, and YouTube spend ~21 minutes a week hunting for saves they can't find, because they never capture why they saved something before it disappears into a pile.

---

## 1. Problem

**Who:** people who save content across social apps but rarely act on it — the exact target user named in the product spec: *"People who save recipes, places, articles, and videos across social apps but rarely act on them."*

> "My 'read later' list was a graveyard... Saving was easy. Coming back was the part that never happened." — [r/SideProject](https://www.reddit.com/r/SideProject/comments/1vf86df/i_never_looked_back_at_the_stuff_i_saved_to_read/)

> "My bookmarks are basically a digital graveyard. Most tools help you save where something is. I wanted a tool that helps you remember why it mattered." — [r/SideProject](https://www.reddit.com/r/SideProject/comments/1t7ijjv/41_selftaught_just_shipped_my_first_saas_would/)

> "I share a link to myself and forget why" / "I save 50 articles but never read them." — [r/buildinpublic](https://www.reddit.com/r/buildinpublic/comments/1ptofox/here_is_the_bookmark_manager_i_created_for/)

---

## 2. Current State — today's workflow

1. See something interesting while scrolling Instagram/Reddit/Substack/YouTube.
2. Hit save/bookmark/screenshot — zero context captured.
3. Item lands in a platform-native tab with no tags or notes — *"scattered across platforms... no easy way to find what you need"* — [r/ProductivityApps](https://www.reddit.com/r/ProductivityApps/comments/1j5lp2v/the_bookmark_paradox_why_we_save_content_we_never/).
4. Saves pile up across disconnected apps — Instagram/LinkedIn saved tabs, screenshots, Notes, bookmarks, Notion — [r/ProductivityApps](https://www.reddit.com/r/ProductivityApps/comments/1mtj6nl/anyone_else_drowning_in_saved_posts_across/).
5. User tries to retrieve something and can't find it — *"846 reels staring back at you... 'Was it that guy with the beard?'"* — [r/SideProject](https://www.reddit.com/r/SideProject/comments/1oou8mt/how_i_solved_the_problem_of_never_finding_saved/).
6. Gives up; pile sits untouched, felt as guilt — [r/SideProject](https://www.reddit.com/r/SideProject/comments/1w6y6y8/i_kept_saving_links_and_never_looking_at_them/).

**Tools people stitch together today:** browser bookmarks, WhatsApp self-messages, Notion, Google Keep, Instagram Saved, Raindrop.io, Pocket, Obsidian, Pinboard, screenshots.

---

## 3. Opportunity

- **1,000+** bookmarks the average unmanaged user accumulates; retrieval can exceed **30 sec/link** — [Linkflare](https://linkflare.io/articles/best-bookmark-managers-2026/)
- **322 / 50 / 299** — users surveyed / bookmark archives analyzed / respondents in an academic bookmark-filing-habits study — [ResearchGate](https://www.researchgate.net/figure/Bookmark-filing-habits-of-299-respondents-showing-the-percentage-of-total-users-in-each_fig5_2586515)
- **137 / 63 upvotes** on independent founder posts describing this exact problem — engagement proxy, not a population size — [Stash Anything](https://www.reddit.com/r/SideProject/comments/1u3yu4x/i_built_an_app_that_changes_the_way_people_save/), [Bunklist](https://www.reddit.com/r/SideProject/comments/ks8u77/i_made_a_website_to_save_your_favorite_websites/)
- **GAP – needs research:** a "Bookmarks market" report cites $502.88M (2025) → $796.37M (2034) via [The Insight Partners](https://www.theinsightpartners.com/reports/bookmarks-market), but surrounding results (bookmark contests, Etsy paper bookmarks) suggest this may be the *physical* bookmark market, not software — don't cite as TAM unverified. "Bookmark app market size India" returned no on-topic result. Save/retrieval frequency per week is also unsourced.

---

## 4. Solution — future workflow

1. User shares content (Instagram/Reddit/Substack/YouTube/screenshot) → app opens immediately on the **Understand** screen — no "Saved ✓, reflect later" dead end.
2. Claude asks 2–4 short, adaptive questions — *"Why did you save this?"*, *"When do you want to act on it?"* — user answers freeform. **[NEW]**
3. From the user's own answers, Claude drafts a reminder time (and a map-pin suggestion only if the content is place-type) — user confirms or edits with one tap. **[NEW — AI-assisted, suggestion only]**
4. User picks or creates the folder themselves, from their own folder tree. **100% human — no AI involvement.** **[NEW]**
5. Item lands in that folder, fully searchable by the user's own words — ~~lands in a platform "Saved" tab with no tags~~ **[DISAPPEARS]**
6. ~~Saves pile up across disconnected apps with no single view~~ **[DISAPPEARS]** (all 5 v1 sources funnel through one app)
7. At the confirmed reminder time, the user is pushed back to the item with their own stated reason shown.
8. ~~User searches/scrolls trying to find it and can't~~ **[DISAPPEARS]** — search ranks the user's own Understand answers above title/URL.
9. User acts, marks Done/Archive — ~~pile sits untouched, guilt-scroll~~ **[DISAPPEARS]**

---

## 5. AI Thinking

| Step | AI or human? | Why |
|---|---|---|
| Ask 2–4 Understand questions | **AI (Claude)** | Questions must adapt to the specific content and prior answers — a fixed script feels like a survey and can't follow up intelligently. |
| Parse answer → draft reminder time | **AI (Claude), hybrid with rules** | Free-text time expressions ("2 weeks before my trip") aren't a fixed format; explicit dates can use a rule-based parser, vague ones need inference. |
| Detect place-type intent → suggest map pin | **AI extracts, script geocodes** | Deciding whether an answer describes "a place to visit" vs. "a recipe to cook at home" needs language understanding — a recipe that mentions a city shouldn't trigger a pin. |
| **Choose or create the folder** | **Human — always** | This is deliberately *not* AI. Folder organization is user-owned (Notion-style); auto-categorization was explicitly rejected — the product's own philosophy is "you understand why it matters," not "we file it for you." |
| Confirm/edit AI suggestions (reminder, pin) | **Human** | Nothing auto-creates without a user tap — avoids the exact failure pattern seen in G2 reviews (tools silently acting on the user's behalf). |
| Search & retrieval | **Script (Postgres weighted FTS)** | Ranking weights (Understand > note > folder path > title) are fixed and deterministic — no model call needed per query. |
| Mark Done / Archive / Delete | **Human** | Using the information stays the user's call. |

---

## 6. Architecture

```
INPUT                   AI/MODEL                  LOGIC                      ACTION/TOOLS                OUTPUT
─────                   ────────                  ─────                      ────────────                ──────
Share extension/     →  Claude                 →  n8n workflow            →  Write save + user-      →  App shows save
share target sends      - generates 2-4            - skip-quota check         chosen folder_id             filed in the
{url/text/image,          Understand Qs            - stop-condition           to Postgres                  user's own
 platform, title}         - parses answers for      check (max 4 Qs)       → Rebuild weighted            folder, with
 → webhook/API             time/place intent        - content_kind            search index                 reminder + pin
                           - drafts reminder +         decision             → Push scheduler               if confirmed,
                           pin suggestions           - duplicate-URL           (APNs/FCM)                   and intent-
                           (never touches folder)      check                → Geocoding (Mapbox/             weighted
                                                                                 Google) for                search across
                                                                                 confirmed pins               all saves
```

- **Claude** — Understand question generation, answer parsing for time/place intent, reminder + map-pin drafting. Never assigns folders.
- **n8n** — orchestrates the pipeline: webhook intake → Claude call → skip/stop-condition checks → content-kind decision → branches to DB write, scheduler, geocoder.
- **GitHub** — version control for app code, Understand prompt templates, and the n8n workflow JSON, so the question/suggestion logic is auditable, not a black box.
- **Vercel** — hosts the API/backend and any web companion; CI/CD deploys on merge from GitHub. (Mobile client itself is native/React Native per the full architecture doc.)

---

## 7. Impact

Sourced per-incident costs: a quick retrieval that works takes **~30 sec** ([Linkflare](https://linkflare.io/articles/best-bookmark-managers-2026/)); a failed/prolonged search runs **~20 min** — *"Three weeks later you're scrolling for 20 minutes trying to find that one recipe"* ([r/SideProject](https://www.reddit.com/r/SideProject/comments/1u3yu4x/i_built_an_app_that_changes_the_way_people_save/)). **GAP:** weekly attempt frequency isn't sourced — assumed 3/week below.

```
CURRENT STATE (assumed 3 retrieval attempts/week)
  2 quick attempts × 30 sec  =    60 sec
  1 failed attempt × 20 min  =  1,200 sec
                       total ≈ 1,260 sec ≈ 21 min/week

FUTURE STATE (reminder resurfaces the save; failed case → ~0)
  1 incidental lookup × 30 sec =   30 sec/week

TIME SAVED ≈ 20.5 min / user / week
```

**Quality:** retrieval success stops depending on memory or search skill — every save surfaces with the user's own stated reason attached, which is the exact gap found in Raindrop/Notion reviews (search/retrieval breaking down, not save friction).

**Scale:** not sized in the dataset — **GAP – needs research** on total addressable users; only directional signal from Reddit engagement (137/63 upvotes on same-problem posts).

---

## 8. Limitations

1. **Vague answer → no clear reminder time** (e.g. "check before trip," no date given). *Human checks:* reminder suggestions always require explicit confirmation before scheduling — nothing auto-creates.
2. **Ambiguous place mention → wrong/no map pin.** *Human checks:* the completion screen shows an editable "This looks like: [Place ▼]" chip the user can flip if Claude guessed wrong; pin only ever fires after explicit confirmation.
3. **Duplicate URL re-saved.** *Human checks:* app shows "Already saved on [date] — Replace or Cancel?" rather than silently duplicating or silently overwriting.

**Build next:** OCR for screenshot titles, a non-AI weekly "resurface" digest (based on reminders + stale saves), full offline/sync with conflict resolution. "Ask AI about your saves" is explicitly deferred — conflicts with the product's own philosophy of the user doing the understanding.

---

## 9. MVP Scope

**IN (build by Thu 12:30 PM)** — one journey: *share → reflect → get reminded.* Max 3 features:
1. Share → Understand Q&A (Claude asks 2–4 adaptive questions, user answers freeform)
2. User manually picks or creates a folder on the completion screen — no AI suggestion
3. Claude suggests a reminder time from the user's own answer; user confirms with one tap; reminder later reopens the save showing the original answer

**OUT (mention, don't build):** map pins/geocoding, all 5 source platforms (ship 1–2 for demo), offline sync/conflict resolution, screenshot OCR, calendar integration, skip-quota system.

**LATER (v2):** full 5-source import (Instagram/Reddit/Substack/YouTube/screenshots), map view for place-type saves, selective offline + Notion-style sync, skip quota, weekly non-AI resurface digest, Apple/Google Calendar reminders.

**Magic moment:** the reminder fires and shows the user their own saved item next to their own words for why they saved it — closing the loop every reviewed competitor (Raindrop, Notion) fails to close.

**Tech stack — Claude / n8n / GitHub / Vercel:** see §6 Architecture above.

---

## Sources

**Apify: trudax/reddit-scraper-lite**
- Broad search (3 phrases, all subreddits, 40 items) — surfaced r/SideProject, r/buildinpublic, r/ProductivityApps as relevant.
- r/ProductivityApps (40 items): [bookmark paradox](https://www.reddit.com/r/ProductivityApps/comments/1j5lp2v/the_bookmark_paradox_why_we_save_content_we_never/), [app to collect bookmarks](https://www.reddit.com/r/ProductivityApps/comments/1l6qxtq/app_to_collect_and_read_bookmarks_from_different/), [drowning in saved posts](https://www.reddit.com/r/ProductivityApps/comments/1mtj6nl/anyone_else_drowning_in_saved_posts_across/), [what's your actual system](https://www.reddit.com/r/ProductivityApps/comments/1rv3glm/whats_your_actual_system_for_managing_saved_posts/)
- r/SideProject (40 items): [kept bookmarking Reddit posts](https://www.reddit.com/r/SideProject/comments/1qbr46z/i_kept_bookmarking_reddit_posts_and_never/), [never looked back](https://www.reddit.com/r/SideProject/comments/1vf86df/i_never_looked_back_at_the_stuff_i_saved_to_read/), [Treasure Trove](https://www.reddit.com/r/SideProject/comments/1t7ijjv/41_selftaught_just_shipped_my_first_saas_would/), [saved IG reels](https://www.reddit.com/r/SideProject/comments/1oou8mt/how_i_solved_the_problem_of_never_finding_saved/), [Stash Anything](https://www.reddit.com/r/SideProject/comments/1u3yu4x/i_built_an_app_that_changes_the_way_people_save/), [Bunklist](https://www.reddit.com/r/SideProject/comments/ks8u77/i_made_a_website_to_save_your_favorite_websites/), [how do you organize things](https://www.reddit.com/r/SideProject/comments/1urstue/how_do_you_organize_things_you_want_to_remember/)
- r/buildinpublic (40 items): [RibbonLinks](https://www.reddit.com/r/buildinpublic/comments/1ptofox/here_is_the_bookmark_manager_i_created_for/), [FetchMark](https://www.reddit.com/r/buildinpublic/comments/1wzrr7r/building_an_offlinefirst_readlater_app_ai_browser/), [keep saving stuff Reddit/TikTok](https://www.reddit.com/r/buildinpublic/comments/1s1nyem/i_keep_saving_stuff_on_reddit_tiktok_reels_shorts/)

**Apify: apify/google-search-scraper**
- "how much time do people spend saving bookmarks survey" → [ResearchGate](https://www.researchgate.net/figure/Bookmark-filing-habits-of-299-respondents-showing-the-percentage-of-total-users-in-each_fig5_2586515)
- "bookmarking statistics 2026" → [Linkflare](https://linkflare.io/articles/best-bookmark-managers-2026/), [The Insight Partners](https://www.theinsightpartners.com/reports/bookmarks-market) (scope unverified)
- "bookmark app market size India" → no on-topic result (GAP)

**Apify: automation-lab/g2-scraper**
- product_search → slugs `raindrop-io`, `notion`
- product_reviews, raindrop-io (7 reviews, lowest-first): [review](https://www.g2.com/products/raindrop-io/reviews/4772162), [review](https://www.g2.com/products/raindrop-io/reviews/11629529), [review](https://www.g2.com/products/raindrop-io/reviews/12637311)
- product_reviews, notion (20 one-star reviews, lowest-first): [review](https://www.g2.com/products/notion/reviews/13163709), [review](https://www.g2.com/products/notion/reviews/11706891), [review](https://www.g2.com/products/notion/reviews/8106117), [review](https://www.g2.com/products/notion/reviews/12305820)
