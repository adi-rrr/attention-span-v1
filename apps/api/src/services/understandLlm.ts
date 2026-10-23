import type { QaPair } from "./understand.js";
import { llmError, openAiChatJson } from "./llm.js";

export type ContentKind = "place" | "content" | "other";

export type LlmSuggestions = {
  reminder: {
    suggested_fire_at: string;
    label: string;
  } | null;
  map_pin: {
    label: string;
    lat: number | null;
    lng: number | null;
  } | null;
};

export type LlmTurnResult = {
  done: boolean;
  next_question: string | null;
  content_kind: ContentKind;
  suggestions: LlmSuggestions;
};

export type SaveContext = {
  platform: string;
  title: string;
  source_url: string | null;
};

const MAX_TURNS = 4;

const SYSTEM = `You help users briefly reflect on why they saved something online.
You are a curious friend, not a productivity coach or survey.

Rules:
- Ask the MINIMUM number of questions. Prefer 1. Hard max ${MAX_TURNS} total turns.
- Questions are short (one sentence), open-ended, freeform — never multiple-choice only.
- Start from turn 1 with a question tailored to the save (title, platform, URL domain). Fully dynamic — do NOT always ask "Why did you save this?" if a sharper opener fits.
- After each answer: if purpose is clear AND (timing/when OR they said no specific time) are clear enough to rediscover later, set done=true and next_question=null.
- If the answer is vague, ask ONE focused follow-up. Do not nag.
- Never scrape or invent post body details you were not given.
- content_kind: "place" only for real-world places to visit (food, hangouts, hotels, travel spots). "content" for things to read/watch/rewatch/learn. Otherwise "other".
- Suggest map_pin ONLY when content_kind is place and a place name/area is implied. Otherwise map_pin=null.
- Suggest reminder only if they mentioned timing or asked to be reminded.
- Return ONLY valid JSON matching the schema. No markdown.`;

function parseJsonResult(raw: string): LlmTurnResult | null {
  try {
    const cleaned = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const data = JSON.parse(cleaned) as {
      done?: boolean;
      next_question?: string | null;
      content_kind?: string;
      suggestions?: {
        reminder?: {
          suggested_fire_at?: string;
          label?: string;
        } | null;
        map_pin?: {
          label?: string;
          lat?: number | null;
          lng?: number | null;
        } | null;
      };
    };

    const kind =
      data.content_kind === "place" ||
      data.content_kind === "content" ||
      data.content_kind === "other"
        ? data.content_kind
        : "other";

    const rem = data.suggestions?.reminder;
    const pin = data.suggestions?.map_pin;

    return {
      done: Boolean(data.done),
      next_question:
        data.done || !data.next_question
          ? null
          : String(data.next_question).trim() || null,
      content_kind: kind,
      suggestions: {
        reminder:
          rem && rem.label
            ? {
                suggested_fire_at:
                  rem.suggested_fire_at ||
                  new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                label: rem.label,
              }
            : null,
        map_pin:
          kind === "place" && pin && pin.label
            ? {
                label: pin.label,
                lat: pin.lat ?? null,
                lng: pin.lng ?? null,
              }
            : null,
      },
    };
  } catch {
    return null;
  }
}

async function callOpenAiJson(userPrompt: string): Promise<LlmTurnResult> {
  const content = await openAiChatJson(SYSTEM, userPrompt, {
    label: "understandLlm",
  });
  const parsed = parseJsonResult(content);
  if (!parsed) {
    throw llmError("Understand LLM returned invalid JSON");
  }
  return parsed;
}

function buildPrompt(
  ctx: SaveContext,
  qa: QaPair[],
  mode: "first" | "followup" | "finalize",
): string {
  const answered = qa.filter((p) => p.answer);
  const turn = answered.length + (mode === "first" ? 1 : 1);
  return JSON.stringify(
    {
      mode,
      turn_number: Math.min(turn, MAX_TURNS),
      max_turns: MAX_TURNS,
      save: {
        platform: ctx.platform,
        title: ctx.title || null,
        source_url: ctx.source_url,
      },
      prior_qa: answered.map((p) => ({
        question: p.question,
        answer: p.answer,
      })),
      schema: {
        done: "boolean — true if no more questions needed",
        next_question: "string|null — next short question if done=false",
        content_kind: "place|content|other",
        suggestions: {
          reminder: "{ suggested_fire_at ISO string, label } or null",
          map_pin: "{ label, lat:null, lng:null } or null — place only",
        },
      },
      instruction:
        mode === "first"
          ? "Generate the first tailored question. done must be false. next_question required."
          : mode === "finalize"
            ? "Turn limit reached or user finished. Set done=true, next_question=null. Fill content_kind and suggestions from prior Q&A."
            : "Given prior Q&A, either set done=true or ask one more minimal follow-up.",
    },
    null,
    2,
  );
}

/** First question — always asks something; never done on turn 1. */
export async function generateFirstQuestion(
  ctx: SaveContext,
): Promise<LlmTurnResult> {
  const parsed = await callOpenAiJson(buildPrompt(ctx, [], "first"));
  if (!parsed.next_question) {
    throw llmError("Understand LLM did not return a first question");
  }
  return {
    ...parsed,
    done: false,
    next_question: parsed.next_question,
  };
}

/** After an answer — may stop early or ask a follow-up. */
export async function generateFollowUp(
  ctx: SaveContext,
  qa: QaPair[],
  aiTurnCount: number,
): Promise<LlmTurnResult> {
  const answeredCount = qa.filter((p) => p.answer).length;

  const last = qa
    .filter((p) => p.answer)
    .at(-1)
    ?.answer.trim()
    .toLowerCase();

  if (
    aiTurnCount >= MAX_TURNS ||
    answeredCount >= MAX_TURNS ||
    last === "done reflecting"
  ) {
    const parsed = await callOpenAiJson(buildPrompt(ctx, qa, "finalize"));
    return { ...parsed, done: true, next_question: null };
  }

  const parsed = await callOpenAiJson(buildPrompt(ctx, qa, "followup"));

  if (aiTurnCount + 1 >= MAX_TURNS) {
    return { ...parsed, done: true, next_question: null };
  }
  if (!parsed.done && !parsed.next_question) {
    return { ...parsed, done: true, next_question: null };
  }
  return parsed;
}

export { MAX_TURNS };
