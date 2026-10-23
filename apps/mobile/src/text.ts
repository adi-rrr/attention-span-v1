const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Older saves stored HTML-escaped titles ("&quot;", "&#x2019;"); show them as plain text. */
export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n =
        code[1] === "x" || code[1] === "X"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

export function displayTitle(save: {
  title?: string | null;
  short_title?: string | null;
  source_url?: string | null;
}): string {
  const raw = save.short_title || save.title || save.source_url || "Untitled";
  return decodeHtmlEntities(raw);
}
