/**
 * Minimal provider-agnostic chat client (no SDK). Supports OpenAI and Anthropic
 * over plain fetch. Everything AI-shaped in Land Stack goes through here so a key
 * swap is the only change.
 *
 * Config (env):
 *   LLM_PROVIDER   openai | anthropic        (default: openai if a key is present)
 *   OPENAI_API_KEY / ANTHROPIC_API_KEY
 *   LLM_MODEL      model id (defaults per provider)
 */
type Provider = "openai" | "anthropic";

function provider(): Provider | null {
  const p = (process.env.LLM_PROVIDER ?? "").toLowerCase();
  if (p === "anthropic" && process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (p === "openai" && process.env.OPENAI_API_KEY) return "openai";
  if (!p && process.env.OPENAI_API_KEY) return "openai";
  if (!p && process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

export function isLlmConfigured(): boolean {
  return provider() !== null;
}

export function llmInfo(): { configured: boolean; provider: string | null; model: string | null } {
  const pr = provider();
  return { configured: pr !== null, provider: pr, model: pr ? modelFor(pr) : null };
}

function modelFor(p: Provider): string {
  if (process.env.LLM_MODEL) return process.env.LLM_MODEL;
  return p === "anthropic" ? "claude-3-5-haiku-latest" : "gpt-4o-mini";
}

export interface ChatOptions {
  system: string;
  user: string;
  /** ask the model to return strict JSON */
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface ChatResult {
  text: string;
  provider: Provider;
  model: string;
  ms: number;
}

export async function chat(opts: ChatOptions): Promise<ChatResult> {
  const pr = provider();
  if (!pr) throw new Error("No LLM provider configured");
  const model = modelFor(pr);
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 12_000);

  try {
    let text: string;
    if (pr === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          temperature: opts.temperature ?? 0,
          max_tokens: opts.maxTokens ?? 400,
          ...(opts.json ? { response_format: { type: "json_object" } } : {}),
          messages: [
            { role: "system", content: opts.system },
            { role: "user", content: opts.user },
          ],
        }),
      });
      if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = (await res.json()) as { choices: { message: { content: string } }[] };
      text = data.choices?.[0]?.message?.content ?? "";
    } else {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY as string,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: opts.maxTokens ?? 400,
          temperature: opts.temperature ?? 0,
          system: opts.system + (opts.json ? "\nRespond with a single JSON object and nothing else." : ""),
          messages: [{ role: "user", content: opts.user }],
        }),
      });
      if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = (await res.json()) as { content: { type: string; text: string }[] };
      text = data.content?.find((c) => c.type === "text")?.text ?? "";
    }
    return { text: text.trim(), provider: pr, model, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

/** Extract the first JSON object from a model response (handles code fences). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("no JSON object in response");
  return JSON.parse(body.slice(start, end + 1));
}
