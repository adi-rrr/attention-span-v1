// Step 1 test: what can we learn about an Instagram post from its link alone?
// For each URL it tries Meta's tokenless oEmbed, Instagram's embed page, and
// the Open Graph title the API uses today, then prints a summary table.
//
//   node scripts/instagram-probe.mjs <url> [<url> ...]
//   node scripts/instagram-probe.mjs --file links.txt
//   node scripts/instagram-probe.mjs --json ...   (full results as JSON)
import { readFileSync } from "node:fs";

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

function shortcodeOf(url) {
  return url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/)?.[1] ?? null;
}

async function getText(url, headers = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  return { status: res.status, body: await res.text() };
}

/** Meta's tokenless oEmbed (June 2026). Returns which useful fields it carries. */
async function probeOembed(url) {
  const api = `https://graph.facebook.com/v25.0/instagram_oembed?url=${encodeURIComponent(url)}`;
  const { status, body } = await getText(api);
  let data = {};
  try {
    data = JSON.parse(body);
  } catch {}
  return {
    status,
    error: data.error?.error_user_title ?? null,
    title: data.title ?? null,
    author: data.author_name ?? null,
    thumbnail: Boolean(data.thumbnail_url),
    html: Boolean(data.html),
  };
}

/** Instagram's embed page carries the post's data as JSON inside the page. */
async function probeEmbedPage(code) {
  const { status, body } = await getText(
    `https://www.instagram.com/p/${code}/embed/captioned/`,
    { "User-Agent": UA },
  );
  const raw = body.match(/"contextJSON":"((?:[^"\\]|\\.)*)"/)?.[1];
  if (!raw) return { status, found: false };

  let media = null;
  let context = {};
  try {
    const parsed = JSON.parse(JSON.parse(`"${raw}"`));
    context = parsed.context ?? {};
    media = parsed.gql_data?.shortcode_media ?? null;
  } catch {
    return { status, found: false };
  }
  if (!media) return { status, found: true, media: false, context };

  const caption = media.edge_media_to_caption?.edges?.[0]?.node?.text ?? "";
  return {
    status,
    found: true,
    media: true,
    type: media.__typename ?? null,
    isVideo: Boolean(media.is_video),
    owner: media.owner?.username ?? null,
    caption,
    location: media.location?.name ?? null,
    copyrightBlocked: Boolean(context.copyright_blocked),
    thumbnail: Boolean(media.display_url),
  };
}

/** What preview.ts does today: the og:title of the post page. */
async function probeOgTitle(url) {
  const { status, body } = await getText(url, {
    "User-Agent": "AttentionSpanPreview/0.1 (+https://attentionspan.local)",
    Accept: "text/html",
  });
  const title =
    body.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    null;
  return { status, title };
}

async function probe(url) {
  const code = shortcodeOf(url);
  const [oembed, embed, og] = await Promise.allSettled([
    probeOembed(url),
    code ? probeEmbedPage(code) : Promise.resolve({ found: false }),
    probeOgTitle(url),
  ]);
  const value = (r) => (r.status === "fulfilled" ? r.value : { error: String(r.reason) });
  return { url, code, oembed: value(oembed), embed: value(embed), og: value(og) };
}

function summarize(r) {
  const e = r.embed;
  return {
    code: r.code,
    kind: e.type?.replace("Graph", "") ?? "-",
    owner: e.owner ?? r.oembed.author ?? "-",
    captionChars: e.caption?.length ?? 0,
    location: e.location ?? "-",
    inlineVideo: e.isVideo ? (e.copyrightBlocked ? "blocked" : "yes") : "n/a",
    oembed: r.oembed.error ?? (r.oembed.html ? "ok" : `HTTP ${r.oembed.status}`),
    oembedTitle: r.oembed.title ? "yes" : "no",
    ogTitle: r.og.title ? "yes" : "no",
  };
}

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const fileIdx = args.indexOf("--file");
const urls = (
  fileIdx >= 0
    ? readFileSync(args[fileIdx + 1], "utf8").split(/\s+/)
    : args.filter((a) => !a.startsWith("--"))
).filter((u) => shortcodeOf(u));

if (urls.length === 0) {
  console.error("Pass Instagram post/reel URLs, or --file <path>.");
  process.exit(1);
}

const results = [];
for (const url of urls) {
  results.push(await probe(url));
  // Be gentle: one post at a time with a short pause.
  await new Promise((r) => setTimeout(r, 800));
}

if (asJson) {
  console.log(JSON.stringify(results, null, 2));
} else {
  const rows = results.map(summarize);
  console.table(rows);
  const n = rows.length;
  const count = (f) => rows.filter(f).length;
  console.log(
    [
      `posts: ${n}`,
      `caption found: ${count((r) => r.captionChars > 0)}`,
      `location tag: ${count((r) => r.location !== "-")}`,
      `videos playable inline: ${count((r) => r.inlineVideo === "yes")} of ${count((r) => r.inlineVideo !== "n/a")}`,
      `oEmbed ok: ${count((r) => r.oembed === "ok")}`,
      `og:title (today's method): ${count((r) => r.ogTitle === "yes")}`,
    ].join("\n"),
  );
}
