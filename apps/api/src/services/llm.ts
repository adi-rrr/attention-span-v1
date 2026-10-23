export function llmError(
  message: string,
  statusCode = 503,
): Error & { statusCode: number; code: string } {
  const err = new Error(message) as Error & { statusCode: number; code: string };
  err.statusCode = statusCode;
  err.code = "LLM_UNAVAILABLE";
  return err;
}

/** One JSON-mode chat completion; returns the raw message content. */
export async function openAiChatJson(
  system: string,
  userPrompt: string,
  opts: { temperature?: number; timeoutMs?: number; label?: string } = {},
): Promise<string> {
  const label = opts.label ?? "llm";
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw llmError("OPENAI_API_KEY is required for AI features", 503);
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const base =
    process.env.OPENAI_BASE_URL?.replace(/\/$/, "") ??
    "https://api.openai.com/v1";

  let res: Response;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: opts.temperature ?? 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 20000),
    });
  } catch (e) {
    console.error(`[${label}] fetch failed`, e);
    throw llmError("AI request failed or timed out");
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[${label}] OpenAI error`, res.status, text.slice(0, 300));
    throw llmError(`AI error (${res.status})`);
  }

  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw llmError("AI returned an empty response");
  return content;
}

/** Parse model JSON, tolerating stray ```json fences. */
export function parseLooseJson<T>(raw: string): T | null {
  try {
    const cleaned = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}
