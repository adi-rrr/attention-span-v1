import type { QueryFn } from "../db.js";
import { query, withTransaction } from "../db.js";
import { httpError } from "../httpError.js";
import { openAiChatJson, parseLooseJson } from "./llm.js";
import { cancelReminder, upsertReminder } from "./reminders.js";

/**
 * Save lifecycle. A shared post lands in the inbox and expires after the
 * user's lifespan (7 days by default). Before then the user acts on it
 * (done), keeps it as a plan or a distilled takeaway, or lets it go.
 * Untouched saves are hard-deleted at expiry ("faded").
 */

export const INTENTS = ["try", "go", "buy", "learn", "inspo", "other"] as const;
export type Intent = (typeof INTENTS)[number];

export type EventKind =
  | "saved"
  | "done"
  | "planned"
  | "distilled"
  | "let_go"
  | "faded";

export type LifecycleSettings = {
  lifespanDays: number;
  shelfLimit: number;
  digestHour: number;
};

export async function getLifecycleSettings(
  userId: string,
  q: QueryFn = query,
): Promise<LifecycleSettings> {
  const { rows } = await q<{
    save_lifespan_days: number;
    shelf_limit: number;
    digest_hour: number;
  }>(
    `SELECT save_lifespan_days, shelf_limit, digest_hour
     FROM user_settings WHERE user_id = $1`,
    [userId],
  );
  return {
    lifespanDays: rows[0]?.save_lifespan_days ?? 7,
    shelfLimit: rows[0]?.shelf_limit ?? 20,
    digestHour: rows[0]?.digest_hour ?? 19,
  };
}

export async function logSaveEvent(
  userId: string,
  kind: EventKind,
  platform: string | null,
  q: QueryFn = query,
): Promise<void> {
  await q(
    `INSERT INTO save_events (user_id, kind, platform) VALUES ($1, $2, $3)`,
    [userId, kind, platform],
  );
}

// ---------------------------------------------------------------------------
// Expiry. There is no always-on worker on Vercel, so expired saves are
// deleted lazily whenever the user's data is read (throttled per user).

const lastSweepAt = new Map<string, number>();
const SWEEP_EVERY_MS = 30_000;

export async function sweepExpiredSaves(
  userId: string,
  opts: { force?: boolean } = {},
): Promise<number> {
  const now = Date.now();
  if (!opts.force && now - (lastSweepAt.get(userId) ?? 0) < SWEEP_EVERY_MS) {
    return 0;
  }
  lastSweepAt.set(userId, now);
  const { rowCount } = await query(
    `WITH gone AS (
       DELETE FROM saves
       WHERE user_id = $1 AND status = 'inbox'
         AND expires_at IS NOT NULL AND expires_at <= now()
       RETURNING platform
     )
     INSERT INTO save_events (user_id, kind, platform)
     SELECT $1, 'faded', platform FROM gone`,
    [userId],
  );
  return rowCount ?? 0;
}

// ---------------------------------------------------------------------------
// Triage: the AI's quiet guess at why something was saved.

const TRIAGE_SYSTEM = `You look at one thing a person just saved from social media and guess why they saved it.
You get the save (platform, title, url) and a short list of their other recent saves with what they did with them.
Return JSON: {"intent": "try"|"go"|"buy"|"learn"|"inspo"|"other", "reason": string}.
- intent: try = a recipe, workout, technique or activity to do; go = a real place to visit; buy = a product; learn = an article, video or idea to understand; inspo = aesthetic, mood or inspiration; other = anything else.
- reason: ONE short line (max 90 characters), second person, phrased as a gentle guess the user can confirm, e.g. "A ramen spot for your Japan trip?".
- Use their history only when it clearly connects (same trip, topic or goal). Never invent details the title or history don't imply.
- Return ONLY JSON.`;

type TriageResult = { intent: Intent; reason: string };

export async function triageSave(
  userId: string,
  saveId: string,
): Promise<TriageResult | null> {
  try {
    const { rows } = await query<{
      platform: string;
      title: string;
      source_url: string | null;
    }>(
      `SELECT platform, title, source_url FROM saves
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
         AND ai_intent IS NULL`,
      [saveId, userId],
    );
    const save = rows[0];
    if (!save) return null;

    const { rows: history } = await query<{
      title: string;
      ai_intent: string | null;
      status: string;
      plan_text: string | null;
      takeaway: string | null;
    }>(
      `SELECT title, ai_intent, status::text AS status, plan_text, takeaway
       FROM saves
       WHERE user_id = $1 AND id <> $2 AND deleted_at IS NULL AND title <> ''
       ORDER BY created_at DESC
       LIMIT 15`,
      [userId, saveId],
    );

    const content = await openAiChatJson(
      TRIAGE_SYSTEM,
      JSON.stringify({
        save,
        recent_saves: history.map((h) => ({
          title: h.title,
          intent: h.ai_intent,
          outcome: h.status,
          plan: h.plan_text,
          takeaway: h.takeaway,
        })),
      }),
      { label: "triage", temperature: 0.3, timeoutMs: 12000 },
    );
    const parsed = parseLooseJson<{ intent?: string; reason?: string }>(content);
    const intent = INTENTS.includes(parsed?.intent as Intent)
      ? (parsed!.intent as Intent)
      : "other";
    const reason = (parsed?.reason ?? "").trim().slice(0, 140) || null;

    await query(
      `UPDATE saves SET ai_intent = $3, ai_reason = $4
       WHERE id = $1 AND user_id = $2 AND ai_intent IS NULL`,
      [saveId, userId, intent, reason],
    );
    return { intent, reason: reason ?? "" };
  } catch (err) {
    console.error("[triage] failed", err);
    return null;
  }
}

/** Fill in guesses for inbox saves that don't have one yet, within a time budget. */
export async function triageMissing(
  userId: string,
  opts: { limit?: number; budgetMs?: number } = {},
): Promise<void> {
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM saves
     WHERE user_id = $1 AND status = 'inbox' AND deleted_at IS NULL
       AND ai_intent IS NULL
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, opts.limit ?? 5],
  );
  if (rows.length === 0) return;
  const work = Promise.all(rows.map((r) => triageSave(userId, r.id)));
  await Promise.race([
    work,
    new Promise((resolve) => setTimeout(resolve, opts.budgetMs ?? 9000)),
  ]);
}

// ---------------------------------------------------------------------------
// Decisions

type DecidableSave = {
  id: string;
  platform: string;
  status: string;
  title: string;
  source_url: string | null;
  ai_intent: string | null;
  ai_reason: string | null;
};

async function loadSave(
  userId: string,
  saveId: string,
  q: QueryFn = query,
  lock = false,
): Promise<DecidableSave> {
  const { rows } = await q<DecidableSave>(
    `SELECT id, platform::text AS platform, status::text AS status, title,
            source_url, ai_intent, ai_reason
     FROM saves
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
     ${lock ? "FOR UPDATE" : ""}`,
    [saveId, userId],
  );
  if (!rows[0]) throw httpError(404, "This save is gone — it may have expired.");
  return rows[0];
}

export async function markDone(userId: string, saveId: string) {
  return withTransaction(async (q) => {
    const save = await loadSave(userId, saveId, q, true);
    if (save.status === "done") return { id: save.id, status: "done" };
    await q(
      `UPDATE saves
       SET status = 'done', expires_at = NULL, decided_at = now(), updated_at = now()
       WHERE id = $1`,
      [saveId],
    );
    await cancelReminder(saveId, userId, q);
    await logSaveEvent(userId, "done", save.platform, q);
    return { id: save.id, status: "done" };
  });
}

/** Let go = deliberate, permanent delete. Works from the inbox or the shelf. */
export async function letGo(userId: string, saveId: string) {
  await withTransaction(async (q) => {
    const save = await loadSave(userId, saveId, q, true);
    await q(`DELETE FROM saves WHERE id = $1 AND user_id = $2`, [saveId, userId]);
    await logSaveEvent(userId, "let_go", save.platform, q);
  });
}

const KEEP_SYSTEM = `You help a person keep one saved post by turning it into either a PLAN or a TAKEAWAY.
You get the save (platform, title, url), the AI's earlier guess at why they saved it, the mode, and the current time.
Return JSON.
For mode "plan": {"question": string, "draft": string, "suggested_at": string|null}
- question: one short, friendly question about the concrete next step and when (max 80 chars).
- draft: a concrete next step in the user's voice, starting with a verb, max 80 chars, e.g. "Cook the 15-minute miso ramen".
- suggested_at: an ISO 8601 datetime in the future that fits the step (e.g. a weekend morning for cooking), or null.
For mode "distill": {"question": string, "draft": string}
- question: one short question asking what they want to remember from it (max 80 chars).
- draft: a one-line takeaway in first person, max 120 chars, built ONLY from what the title implies. If the title is too thin, start it as "What stuck with me: " and stop.
Never invent facts the title doesn't support. Return ONLY JSON.`;

export type KeepMode = "plan" | "distill";

export async function draftKeep(
  userId: string,
  saveId: string,
  mode: KeepMode,
  timezone: string,
) {
  const save = await loadSave(userId, saveId);
  const content = await openAiChatJson(
    KEEP_SYSTEM,
    JSON.stringify({
      mode,
      now: new Date().toISOString(),
      user_timezone: timezone,
      save: {
        platform: save.platform,
        title: save.title || null,
        source_url: save.source_url,
      },
      ai_guess: save.ai_reason,
    }),
    { label: "keepDraft", temperature: 0.5 },
  );
  const parsed = parseLooseJson<{
    question?: string;
    draft?: string;
    suggested_at?: string | null;
  }>(content);

  const suggested = parsed?.suggested_at ? new Date(parsed.suggested_at) : null;
  return {
    mode,
    question:
      parsed?.question?.trim() ||
      (mode === "plan"
        ? "What's the next step, and when?"
        : "What do you want to remember from this?"),
    draft: parsed?.draft?.trim() ?? "",
    suggested_at:
      mode === "plan" && suggested && suggested.getTime() > Date.now()
        ? suggested.toISOString()
        : null,
  };
}

export type KeepInput = {
  mode: KeepMode;
  plan_text?: string;
  plan_at?: string;
  takeaway?: string;
  folder_id?: string | null;
  timezone?: string;
};

export async function keepSave(userId: string, saveId: string, input: KeepInput) {
  const settings = await getLifecycleSettings(userId);

  const kept = await withTransaction(async (q) => {
    const save = await loadSave(userId, saveId, q, true);
    if (save.status !== "inbox") {
      throw httpError(409, "This save has already been decided.");
    }

    const { rows: shelf } = await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM saves
       WHERE user_id = $1 AND deleted_at IS NULL
         AND status IN ('planned', 'distilled')`,
      [userId],
    );
    if ((shelf[0]?.n ?? 0) >= settings.shelfLimit) {
      const err = httpError(
        409,
        `Your shelf is full (${settings.shelfLimit}). Let one go to keep this.`,
      ) as Error & { statusCode: number; code: string };
      err.code = "SHELF_FULL";
      throw err;
    }

    let folderPath = "";
    if (input.folder_id) {
      const { rows } = await q<{ path: string }>(
        `SELECT path FROM folders
         WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
        [input.folder_id, userId],
      );
      if (!rows[0]) throw httpError(400, "Folder not found");
      folderPath = rows[0].path;
    }

    const isPlan = input.mode === "plan";
    const planText = isPlan ? input.plan_text?.trim() : null;
    const takeaway = isPlan ? null : input.takeaway?.trim();
    if (isPlan && !planText) throw httpError(400, "Add a next step to plan it.");
    if (isPlan && !input.plan_at) throw httpError(400, "Pick when you'll do it.");
    if (!isPlan && !takeaway) throw httpError(400, "Write the one thing to remember.");

    const { rows } = await q(
      `UPDATE saves SET
         status = $3::save_status,
         expires_at = NULL,
         decided_at = now(),
         plan_text = $4,
         plan_at = $5,
         takeaway = $6,
         folder_id = $7,
         folder_path = $8,
         understand_text = $9,
         updated_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING id, status, plan_text, plan_at, takeaway, folder_id, folder_path`,
      [
        saveId,
        userId,
        isPlan ? "planned" : "distilled",
        planText,
        isPlan ? input.plan_at : null,
        takeaway,
        input.folder_id ?? null,
        folderPath,
        (planText ?? takeaway ?? "").slice(0, 2000),
      ],
    );

    if (isPlan) {
      await upsertReminder(
        {
          saveId,
          userId,
          fireAt: input.plan_at!,
          timezone: input.timezone,
          createdFrom: "manual",
        },
        q,
      );
    }
    await logSaveEvent(userId, isPlan ? "planned" : "distilled", save.platform, q);
    return rows[0];
  });

  return kept;
}

// ---------------------------------------------------------------------------
// Reads

export const INBOX_FIELDS = `id, platform, status, source_url, title, ai_intent, ai_reason,
  created_at, expires_at`;

export async function inboxSummary(userId: string) {
  const settings = await getLifecycleSettings(userId);
  const { rows } = await query<{ total: number; fading_24h: number }>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE expires_at <= now() + interval '24 hours')::int
              AS fading_24h
     FROM saves
     WHERE user_id = $1 AND status = 'inbox' AND deleted_at IS NULL`,
    [userId],
  );
  return {
    total: rows[0]?.total ?? 0,
    fading_24h: rows[0]?.fading_24h ?? 0,
    lifespan_days: settings.lifespanDays,
    digest_hour: settings.digestHour,
  };
}

export async function mirror(userId: string) {
  const settings = await getLifecycleSettings(userId);
  const { rows: counts } = await query<{ kind: EventKind; n: number }>(
    `SELECT kind, count(*)::int AS n
     FROM save_events
     WHERE user_id = $1 AND created_at >= date_trunc('month', now())
     GROUP BY kind`,
    [userId],
  );
  const byKind = Object.fromEntries(counts.map((c) => [c.kind, c.n])) as Partial<
    Record<EventKind, number>
  >;
  const { rows: shelf } = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM saves
     WHERE user_id = $1 AND deleted_at IS NULL
       AND status IN ('planned', 'distilled')`,
    [userId],
  );
  return {
    month_start: new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
    ).toISOString(),
    saved: byKind.saved ?? 0,
    done: byKind.done ?? 0,
    planned: byKind.planned ?? 0,
    distilled: byKind.distilled ?? 0,
    let_go: byKind.let_go ?? 0,
    faded: byKind.faded ?? 0,
    shelf_used: shelf[0]?.n ?? 0,
    shelf_limit: settings.shelfLimit,
    inbox: await inboxSummary(userId),
  };
}
