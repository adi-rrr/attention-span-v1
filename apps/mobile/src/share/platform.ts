export type SavePlatform =
  | "instagram"
  | "reddit"
  | "substack"
  | "youtube"
  | "screenshot";

const URL_IN_TEXT =
  /https?:\/\/[^\s<>"{}|\\^`[\]]+/i;

/** Pull the first http(s) URL from shared text. */
export function extractUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(URL_IN_TEXT);
  if (!match) return null;
  return match[0].replace(/[)\],.!?]+$/, "");
}

export function detectPlatform(url: string): SavePlatform {
  const u = url.toLowerCase();
  if (u.includes("instagram.com")) return "instagram";
  if (u.includes("reddit.com") || u.includes("redd.it")) return "reddit";
  if (u.includes("substack.com")) return "substack";
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  // Unknown link — still save; preview may fill title via OG
  return "youtube";
}

export type SharePayload = {
  platform: SavePlatform;
  source_url: string | null;
  title?: string;
};

/** Normalize expo-share-intent / deep-link payload into a save request. */
export function parseShareIntent(input: {
  text?: string | null;
  webUrl?: string | null;
  hasImage?: boolean;
}): SharePayload | null {
  const url =
    (input.webUrl && extractUrl(input.webUrl)) ||
    extractUrl(input.text ?? "") ||
    (input.webUrl?.startsWith("http") ? input.webUrl : null);

  if (url) {
    return {
      platform: detectPlatform(url),
      source_url: url,
    };
  }

  if (input.hasImage) {
    return {
      platform: "screenshot",
      source_url: null,
      title: `Screenshot · ${new Date().toLocaleDateString()}`,
    };
  }

  const trimmed = input.text?.trim();
  if (trimmed) {
    return {
      platform: "youtube",
      source_url: null,
      title: trimmed.slice(0, 120),
    };
  }

  return null;
}

/** Deep link: attentionspan://understand/{saveId} or attentionspan://save/{saveId} */
export function parseAppDeepLink(
  url: string,
): { kind: "understand" | "save"; id: string } | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "attentionspan:") return null;
    const parts = parsed.pathname.replace(/^\//, "").split("/");
    const kind =
      parsed.hostname === "understand" || parts[0] === "understand"
        ? "understand"
        : parsed.hostname === "save" || parts[0] === "save"
          ? "save"
          : null;
    if (!kind) return null;
    const id =
      parsed.hostname === kind ? parts[0] : parts[1];
    return id ? { kind, id } : null;
  } catch {
    return null;
  }
}

export function parseUnderstandDeepLink(url: string): string | null {
  const parsed = parseAppDeepLink(url);
  return parsed?.kind === "understand" ? parsed.id : null;
}

export function parseSaveDeepLink(url: string): string | null {
  const parsed = parseAppDeepLink(url);
  return parsed?.kind === "save" ? parsed.id : null;
}
