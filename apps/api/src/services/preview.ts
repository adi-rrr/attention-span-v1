export type PreviewResult = {
  title: string | null;
};

function youtubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.replace(/^\//, "").split("/")[0] || null;
    }
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname.startsWith("/shorts/")) {
        return u.pathname.split("/")[2] || null;
      }
      return u.searchParams.get("v");
    }
  } catch {
    return null;
  }
  return null;
}

async function fetchYoutubeTitle(url: string): Promise<PreviewResult> {
  const id = youtubeVideoId(url);
  if (!id) return { title: null };

  const oembed = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${id}`,
  )}&format=json`;

  const res = await fetch(oembed, {
    signal: AbortSignal.timeout(8500),
  });
  if (!res.ok) return { title: null };

  const data = (await res.json()) as { title?: string };
  return { title: data.title ?? null };
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Meta tags carry HTML-escaped text ("&quot;", "&#x2019;") — turn it back into plain text. */
function decodeHtmlEntities(text: string): string {
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

/** Best-effort Open Graph title scrape for Reddit / Substack / generic links */
async function fetchOpenGraphTitle(url: string): Promise<PreviewResult> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent": "AttentionSpanPreview/0.1 (+https://attentionspan.local)",
        Accept: "text/html",
      },
      redirect: "follow",
    });
    if (!res.ok) return { title: null };
    const html = await res.text();

    const meta = (prop: string) => {
      const re = new RegExp(
        `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
        "i",
      );
      const re2 = new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
        "i",
      );
      return html.match(re)?.[1] ?? html.match(re2)?.[1] ?? null;
    };

    const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
    const title = meta("og:title") ?? titleTag ?? null;

    return {
      title: title ? decodeHtmlEntities(title) : null,
    };
  } catch {
    return { title: null };
  }
}

/**
 * Resolve display title for a shared URL.
 * P0: title only — no thumbnail fetch or storage.
 * Does not scrape post body / AI extract.
 */
export async function resolvePreview(
  platform: string,
  sourceUrl: string | null | undefined,
): Promise<PreviewResult> {
  if (!sourceUrl) return { title: null };

  try {
    if (platform === "youtube" || youtubeVideoId(sourceUrl)) {
      return await fetchYoutubeTitle(sourceUrl);
    }
    if (
      platform === "reddit" ||
      platform === "substack" ||
      platform === "instagram"
    ) {
      return await fetchOpenGraphTitle(sourceUrl);
    }
    return await fetchOpenGraphTitle(sourceUrl);
  } catch {
    return { title: null };
  }
}
