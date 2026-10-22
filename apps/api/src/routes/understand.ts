import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireUserId } from "../auth.js";
import { query } from "../db.js";
import { getSkipsRemaining, type QaPair } from "../services/understand.js";
import {
  generateFirstQuestion,
  generateFollowUp,
  MAX_TURNS,
} from "../services/understandLlm.js";
import { upsertReminder } from "../services/reminders.js";

const answerBody = z.object({
  answer: z.string().min(1),
});

const completeBody = z.object({
  folder_id: z.string().uuid().nullable().optional(),
  content_kind: z.enum(["place", "content", "other"]).optional(),
  user_note: z.string().nullable().optional(),
  reminder: z
    .object({
      fire_at: z.string().datetime(),
      timezone: z.string().min(1).max(80).optional(),
      delivery: z.enum(["in_app", "calendar", "both"]).default("in_app"),
      calendar_provider: z.enum(["apple", "google"]).nullable().optional(),
    })
    .nullable()
    .optional(),
  map_pin: z
    .object({
      lat: z.number(),
      lng: z.number(),
      label: z.string().optional(),
    })
    .nullable()
    .optional(),
});

async function getOwnedSave(saveId: string, userId: string) {
  const { rows } = await query<{
    id: string;
    title: string;
    platform: string;
    status: string;
    source_url: string | null;
  }>(
    `SELECT id, title, platform, status, source_url
     FROM saves
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [saveId, userId],
  );
  if (!rows[0]) {
    const err = new Error("Save not found") as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }
  return rows[0];
}

async function getOrCreateSession(saveId: string) {
  const { rows } = await query(
    `SELECT id, save_id, status, qa_pairs, ai_turn_count, completed_at, skipped_at
     FROM understand_sessions WHERE save_id = $1`,
    [saveId],
  );
  if (rows[0]) return rows[0];

  const { rows: created } = await query(
    `INSERT INTO understand_sessions (save_id, status)
     VALUES ($1, 'pending')
     RETURNING id, save_id, status, qa_pairs, ai_turn_count, completed_at, skipped_at`,
    [saveId],
  );
  return created[0];
}

function asQaPairs(raw: unknown): QaPair[] {
  if (!Array.isArray(raw)) return [];
  return raw as QaPair[];
}

export const understandRoutes: FastifyPluginAsync = async (app) => {
  app.post("/saves/:id/understand/start", async (req) => {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    const save = await getOwnedSave(id, userId);

    const session = await getOrCreateSession(id);
    if (session.status === "completed") {
      if (save.status === "understand_pending") {
        // Recover stale session state (e.g. save recreated for same id).
        await query(
          `UPDATE understand_sessions
           SET status = 'pending',
               qa_pairs = '[]'::jsonb,
               ai_turn_count = 0,
               completed_at = NULL,
               skipped_at = NULL,
               updated_at = now()
           WHERE save_id = $1`,
          [id],
        );
        session.status = "pending";
        session.qa_pairs = [];
        session.ai_turn_count = 0;
      } else {
        const skips_remaining = await getSkipsRemaining(userId);
        return {
          session_id: session.id,
          status: "completed",
          question: "Ready to finish — add a folder on the next step.",
          ai_turn_count: Number(session.ai_turn_count) || 0,
          skips_remaining,
          can_skip: false,
          ready_to_complete: true,
        };
      }
    }

    const qa = asQaPairs(session.qa_pairs);
    const open = qa.find((p) => !p.answer);
    const answered = qa.filter((p) => p.answer).length;
    const now = new Date().toISOString();

    let nextQa = qa;
    let question: string;
    let turn = Number(session.ai_turn_count) || 0;
    let readyToComplete = false;
    let inferredContentKind:
      | "place"
      | "content"
      | "other"
      | undefined;

    const ctx = {
      platform: save.platform,
      title: save.title ?? "",
      source_url: save.source_url,
    };

    if (open?.question) {
      question = open.question;
      turn = Math.max(turn, answered + 1);
    } else if (answered >= MAX_TURNS) {
      question = "Ready to finish — add a folder on the next step.";
      readyToComplete = true;
      const fin = await generateFollowUp(ctx, qa, MAX_TURNS);
      inferredContentKind = fin.content_kind;
    } else if (answered === 0) {
      const gen = await generateFirstQuestion(ctx);
      question = gen.next_question!;
      turn = 1;
      nextQa = [
        {
          question,
          answer: "",
          asked_at: now,
          answered_at: null,
        },
      ];
    } else {
      const follow = await generateFollowUp(
        ctx,
        qa,
        Math.max(turn, answered),
      );
      if (follow.done || !follow.next_question) {
        question = "Ready to finish — add a folder on the next step.";
        readyToComplete = true;
        inferredContentKind = follow.content_kind;
        turn = Math.max(turn, answered);
      } else {
        question = follow.next_question;
        turn = Math.min(Math.max(turn, answered) + 1, MAX_TURNS);
        nextQa = [
          ...qa,
          {
            question,
            answer: "",
            asked_at: now,
            answered_at: null,
          },
        ];
      }
    }

    await query(
      `UPDATE understand_sessions
       SET status = 'in_progress',
           qa_pairs = $2::jsonb,
           ai_turn_count = $3,
           updated_at = now(),
           skipped_at = NULL
       WHERE id = $1`,
      [session.id, JSON.stringify(nextQa), turn],
    );

    const skips_remaining = await getSkipsRemaining(userId);

    return {
      session_id: session.id,
      status: "in_progress",
      question,
      ai_turn_count: turn,
      skips_remaining,
      can_skip: skips_remaining > 0,
      ready_to_complete: readyToComplete,
      inferred_content_kind: inferredContentKind,
    };
  });

  app.post("/saves/:id/understand/answer", async (req) => {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    const body = answerBody.parse(req.body);
    const save = await getOwnedSave(id, userId);

    const session = await getOrCreateSession(id);
    if (session.status === "completed") {
      const err = new Error("Understand already completed") as Error & {
        statusCode: number;
      };
      err.statusCode = 400;
      throw err;
    }

    const qa = asQaPairs(session.qa_pairs);
    const openIdx = qa.findIndex((p) => !p.answer);
    const now = new Date().toISOString();

    if (openIdx >= 0) {
      qa[openIdx] = {
        ...qa[openIdx]!,
        answer: body.answer.trim(),
        answered_at: now,
      };
    } else {
      const err = new Error(
        "No open question — call POST /understand/start first",
      ) as Error & { statusCode: number };
      err.statusCode = 400;
      throw err;
    }

    let ai_turn_count = Math.max(
      Number(session.ai_turn_count) || 1,
      qa.filter((p) => p.answer).length,
    );

    const follow = await generateFollowUp(
      {
        platform: save.platform,
        title: save.title ?? "",
        source_url: save.source_url,
      },
      qa,
      ai_turn_count,
    );

    let done = follow.done || !follow.next_question;
    let next_question = done ? null : follow.next_question;

    if (!done && next_question) {
      ai_turn_count = Math.min(ai_turn_count + 1, MAX_TURNS);
      if (ai_turn_count > MAX_TURNS) {
        done = true;
        next_question = null;
      } else {
        qa.push({
          question: next_question,
          answer: "",
          asked_at: now,
          answered_at: null,
        });
      }
    }

    await query(
      `UPDATE understand_sessions
       SET qa_pairs = $2::jsonb,
           ai_turn_count = $3,
           status = 'in_progress',
           updated_at = now()
       WHERE id = $1`,
      [session.id, JSON.stringify(qa), ai_turn_count],
    );

    return {
      done,
      next_question: done ? null : next_question,
      ai_turn_count,
      suggestions: done ? follow.suggestions : undefined,
      inferred_content_kind: follow.content_kind,
    };
  });

  app.post("/saves/:id/understand/complete", async (req) => {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    const body = completeBody.parse(req.body ?? {});
    const save = await getOwnedSave(id, userId);

    const session = await getOrCreateSession(id);
    const qa = asQaPairs(session.qa_pairs).filter((p) => p.answer);
    if (qa.length === 0) {
      const err = new Error("Answer at least one question first") as Error & {
        statusCode: number;
      };
      err.statusCode = 400;
      throw err;
    }

    const understandText = qa.map((p) => p.answer).join("\n");
    let contentKind = body.content_kind;
    if (!contentKind) {
      const fin = await generateFollowUp(
        {
          platform: save.platform,
          title: save.title ?? "",
          source_url: save.source_url,
        },
        qa,
        MAX_TURNS,
      );
      contentKind = fin.content_kind;
    }
    const offlinePolicy = contentKind === "content" ? "full" : "light";

    let folderPath = "";
    let folderId: string | null = body.folder_id ?? null;
    if (folderId) {
      const { rows: folders } = await query(
        `SELECT path FROM folders
         WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
        [folderId, userId],
      );
      if (!folders[0]) {
        const err = new Error("Folder not found") as Error & {
          statusCode: number;
        };
        err.statusCode = 400;
        throw err;
      }
      folderPath = folders[0].path;
    }

    const { rows: saves } = await query(
      `UPDATE saves SET
         status = 'understand_done',
         understand_text = $3,
         content_kind = $4,
         offline_policy = $5,
         folder_id = $6,
         folder_path = $7,
         user_note = COALESCE($8, user_note),
         updated_at = now()
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       RETURNING id, platform, status, source_url, title, user_note,
                 folder_id, folder_path, content_kind, offline_policy,
                 created_at, updated_at`,
      [
        id,
        userId,
        understandText,
        contentKind,
        offlinePolicy,
        folderId,
        folderPath,
        body.user_note ?? null,
      ],
    );

    await query(
      `UPDATE understand_sessions
       SET status = 'completed',
           qa_pairs = $2::jsonb,
           completed_at = now(),
           skipped_at = NULL,
           updated_at = now()
       WHERE id = $1`,
      [session.id, JSON.stringify(qa)],
    );

    if (body.reminder) {
      await upsertReminder({
        saveId: id,
        userId,
        fireAt: body.reminder.fire_at,
        timezone: body.reminder.timezone,
        createdFrom: "understand_answer",
        delivery: body.reminder.delivery,
      });
    }

    if (body.map_pin && contentKind === "place") {
      await query(
        `INSERT INTO map_pins (save_id, lat, lng, label, source)
         VALUES ($1, $2, $3, $4, 'user_answer')
         ON CONFLICT (save_id) DO UPDATE SET
           lat = EXCLUDED.lat,
           lng = EXCLUDED.lng,
           label = EXCLUDED.label,
           source = EXCLUDED.source,
           deleted_at = NULL,
           updated_at = now()`,
        [
          id,
          body.map_pin.lat,
          body.map_pin.lng,
          body.map_pin.label ?? "",
        ],
      );
    }

    return saves[0];
  });

  app.post("/saves/:id/understand/skip", async (req, reply) => {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    await getOwnedSave(id, userId);

    const skips_remaining = await getSkipsRemaining(userId);
    if (skips_remaining <= 0) {
      return reply.code(403).send({
        error: "Skip quota exhausted",
        code: "SKIP_QUOTA_EXCEEDED",
        skips_remaining: 0,
      });
    }

    const session = await getOrCreateSession(id);
    if (session.status === "completed") {
      const err = new Error("Understand already completed") as Error & {
        statusCode: number;
      };
      err.statusCode = 400;
      throw err;
    }

    await query(
      `UPDATE understand_sessions
       SET status = 'skipped', skipped_at = now(), updated_at = now()
       WHERE id = $1`,
      [session.id],
    );

    await query(
      `UPDATE saves SET status = 'understand_pending', updated_at = now()
       WHERE id = $1`,
      [id],
    );

    await query(
      `INSERT INTO skip_events (user_id, save_id) VALUES ($1, $2)`,
      [userId, id],
    );

    const { rows } = await query(
      `SELECT id, platform, status, source_url, title, user_note,
              folder_id, folder_path, content_kind, offline_policy,
              created_at, updated_at
       FROM saves WHERE id = $1`,
      [id],
    );

    return {
      skips_remaining: skips_remaining - 1,
      save: rows[0],
    };
  });
};
