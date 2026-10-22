import { Client } from "@upstash/qstash";
import webpush from "web-push";
import { query } from "../db.js";
import { httpError } from "../httpError.js";

/**
 * Web Push for the hosted PWA. A reminder is scheduled as a QStash message
 * that calls POST /push/fire at its fire time; the fire handler sends the
 * push to every device the user subscribed. Native builds keep using local
 * notifications, so all of this is optional and off without env vars.
 */

export type PushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

let vapidReady = false;

function ensureVapid(): boolean {
  if (vapidReady) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:hello@attentionspan.app",
    publicKey,
    privateKey,
  );
  vapidReady = true;
  return true;
}

export function vapidPublicKey(): string {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) throw httpError(503, "Push is not configured");
  return key;
}

export async function saveSubscription(
  userId: string,
  sub: PushSubscriptionInput,
): Promise<void> {
  await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth,
       updated_at = now()`,
    [userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth],
  );
}

/** Public origin the scheduler calls back to (e.g. https://attention-span-green.vercel.app). */
function publicBaseUrl(): string | null {
  const explicit = process.env.PUBLIC_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return prod ? `https://${prod}` : null;
}

/** Best effort: a failure here must not fail saving the reminder itself. */
export async function scheduleReminderPush(reminder: {
  id: string;
  fire_at: Date | string;
}): Promise<void> {
  const token = process.env.QSTASH_TOKEN;
  const base = publicBaseUrl();
  if (!token || !base) return;

  // QStash is regional (EU / US); the console shows the matching QSTASH_URL.
  const client = new Client({ token, baseUrl: process.env.QSTASH_URL });
  await client.publishJSON({
    url: `${base}/api/push/fire`,
    body: { reminder_id: reminder.id },
    notBefore: Math.floor(new Date(reminder.fire_at).getTime() / 1000),
    retries: 3,
  });
}

type FireRow = {
  id: string;
  user_id: string;
  save_id: string;
  title: string | null;
  source_url: string | null;
  qa_pairs: { question?: string; answer?: string }[] | null;
};

/** Sends the push for one reminder if it is still scheduled. Returns devices reached. */
export async function fireReminder(reminderId: string): Promise<number> {
  if (!ensureVapid()) throw httpError(503, "Push is not configured");

  const { rows } = await query<FireRow>(
    `SELECT r.id, r.user_id, r.save_id, s.title, s.source_url, us.qa_pairs
     FROM reminders r
     JOIN saves s ON s.id = r.save_id AND s.deleted_at IS NULL
     LEFT JOIN understand_sessions us ON us.save_id = r.save_id
     WHERE r.id = $1 AND r.status = 'scheduled' AND r.deleted_at IS NULL
     LIMIT 1`,
    [reminderId],
  );
  const reminder = rows[0];
  // Cancelled, rescheduled (new row) or already sent: nothing to do.
  if (!reminder) return 0;

  const firstAnswer = reminder.qa_pairs?.find((p) => p.answer?.trim())?.answer;
  const payload = JSON.stringify({
    title: reminder.title || reminder.source_url || "Attention Span",
    body: firstAnswer
      ? `You saved this because: “${firstAnswer.trim()}”`
      : "You wanted to come back to this.",
    saveId: reminder.save_id,
  });

  const { rows: subs } = await query<{
    id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }>(
    `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`,
    [reminder.user_id],
  );

  let reached = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
      reached++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // The browser dropped this subscription; forget it.
      if (status === 404 || status === 410) {
        await query(`DELETE FROM push_subscriptions WHERE id = $1`, [sub.id]);
      }
    }
  }

  await query(
    `UPDATE reminders SET status = 'sent', updated_at = now() WHERE id = $1`,
    [reminder.id],
  );
  return reached;
}
