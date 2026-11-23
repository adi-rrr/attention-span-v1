import { openAiChatJson, parseLooseJson } from "./llm.js";

const SCREENSHOT_SYSTEM = `You read a screenshot someone saved to come back to later.
Return JSON: {"title": string, "summary": string, "text": string}
- title: a one-line card title for what it's about, max 70 chars, e.g. "Ramen spot in Shibuya worth trying".
- summary: one sentence on what the screenshot shows, e.g. "An Instagram post recommending a ramen shop in Shibuya, Tokyo."
- text: the readable words in the image in reading order, max 1500 chars. Keep names, places, dates and prices. Skip app chrome like buttons, clocks and battery icons.
Never invent anything that isn't visible. If nothing is readable, use empty strings.
Return ONLY JSON.`;

export type ScreenshotRead = { title: string; summary: string; text: string };

/** What a screenshot says and shows. Never throws: an empty read on failure. */
export async function readScreenshot(imageDataUrl: string): Promise<ScreenshotRead> {
  try {
    const content = await openAiChatJson(SCREENSHOT_SYSTEM, "Read this screenshot.", {
      label: "screenshot",
      temperature: 0.1,
      timeoutMs: 25000,
      imageDataUrl,
    });
    const parsed = parseLooseJson<Partial<ScreenshotRead>>(content);
    return {
      title: parsed?.title?.trim().slice(0, 80) ?? "",
      summary: parsed?.summary?.trim().slice(0, 300) ?? "",
      text: parsed?.text?.trim().slice(0, 1500) ?? "",
    };
  } catch (err) {
    console.error("[screenshot] read failed", err);
    return { title: "", summary: "", text: "" };
  }
}
