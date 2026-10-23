import { ApiError } from "../api";

export type SaveOutcome = { ok: boolean; message: string };

function shortDate(iso: string | undefined) {
  if (!iso) return "earlier";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

export function savedMessage(lifespanDays: number | null): SaveOutcome {
  const days = lifespanDays ?? 7;
  return { ok: true, message: `Saved · fades in ${days} days unless you act on it` };
}

/** One plain-English line for why a share didn't save, and what to do next. */
export function failedMessage(err: unknown): SaveOutcome {
  if (err instanceof ApiError) {
    const body = (err.body ?? {}) as {
      code?: string;
      saved_at?: string;
      status?: string;
    };
    if (err.status === 409) {
      const when = shortDate(body.saved_at);
      switch (body.status) {
        case "planned":
          return { ok: true, message: `Already in your plans (saved ${when}).` };
        case "distilled":
          return { ok: true, message: `Already in your journal (saved ${when}).` };
        case "done":
          return { ok: true, message: `You already did this one (saved ${when}).` };
        default:
          return { ok: true, message: `Already saved on ${when}. It's in your inbox.` };
      }
    }
    if (body.code === "PASSCODE_REQUIRED") {
      return {
        ok: false,
        message: "Not saved: open Attention Span, enter your passcode, then share again.",
      };
    }
    if (err.status === 400) {
      return {
        ok: false,
        message: "Not saved: we couldn't read that link. Try sharing the post link.",
      };
    }
    if (err.status >= 500) {
      return {
        ok: false,
        message: "Not saved: Attention Span had a hiccup. Share again in a moment.",
      };
    }
    return { ok: false, message: `Not saved (error ${err.status}). Share again.` };
  }
  if (err instanceof Error && err.name === "AbortError") {
    return { ok: false, message: "Not saved: it took too long. Share again." };
  }
  return {
    ok: false,
    message: "Not saved: couldn't reach Attention Span. Check your internet and share again.",
  };
}

export const NOTHING_TO_SAVE: SaveOutcome = {
  ok: false,
  message: "Not saved: there was no link or text to save. Share the post itself.",
};
