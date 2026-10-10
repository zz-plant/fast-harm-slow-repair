/**
 * Minimal Cloudflare Workers AI REST client for the FHSR pilot runner.
 *
 * Authentication comes from the environment (CLOUDFLARE_ACCOUNT_ID,
 * CLOUDFLARE_API_TOKEN); nothing is stored in the repo. Workers AI bills by
 * neurons, which the API reports per call — recorded as the cost measure
 * instead of a token-dollar conversion.
 *
 * Model response shapes vary across model families on the /ai/run endpoint:
 * most return an OpenAI-compatible `choices[0].message`, with the plain
 * `response` field also populated; thinking models can leave `content` empty
 * and put the reply in a `reasoning` field. The client normalizes all of it
 * and records which channel the text came from.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCallOptions {
  temperature?: number;
  maxTokens?: number;
  retries?: number;
  timeoutMs?: number;
}

export interface ChatResult {
  model: string;
  /** The model's reply: content when present, reasoning text otherwise. */
  text: string;
  rawContent: string;
  reasoningText: string | null;
  /** Which channel `text` came from: "content" or "reasoning" ("none" if empty). */
  channel: "content" | "reasoning" | "none";
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Workers AI cost unit for this call. */
  neurons: number;
}

export type WorkersAiChat = (
  model: string,
  messages: ChatMessage[],
  options?: ChatCallOptions
) => Promise<ChatResult>;

export function makeWorkersAiClient(config: {
  accountId: string;
  apiToken: string;
  fetchImpl?: typeof fetch;
}): WorkersAiChat {
  const doFetch = config.fetchImpl ?? fetch;

  return async (model, messages, options = {}) => {
    const url =
      `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/run/${model}`;
    const body: Record<string, unknown> = { messages };
    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;

    let lastError = "";
    let wasRateLimited = false;
    const attempts = (options.retries ?? 3) + 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0) {
        // Rate limits are per-minute: short backoffs just burn the retries.
        await sleep(
          wasRateLimited ? RATE_LIMIT_WAITS[Math.min(attempt - 1, RATE_LIMIT_WAITS.length - 1)]! : 1000 * attempt
        );
        wasRateLimited = false;
      }
      let response: Response;
      try {
        response = await doFetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(options.timeoutMs ?? 120_000),
        });
      } catch (error) {
        lastError = `network error: ${(error as Error).message}`;
        continue;
      }
      let payload: any;
      try {
        payload = await response.json();
      } catch {
        lastError = `non-JSON response (HTTP ${response.status})`;
        continue;
      }
      if (!response.ok || payload?.success === false) {
        const errors = (payload?.errors ?? [])
          .map((error: any) => `${error.code}: ${error.message}`)
          .join("; ");
        lastError = errors || `HTTP ${response.status}`;
        const rateLimited =
          response.status === 429 ||
          (payload?.errors ?? []).some((error: any) => error?.code === 3021);
        if (rateLimited) {
          wasRateLimited = true;
          continue;
        }
        if (response.status >= 500) continue;
        throw new Error(`Workers AI call failed (${model}): ${lastError}`);
      }
      return parseChatResult(model, payload);
    }
    throw new Error(`Workers AI call failed after retries (${model}): ${lastError}`);
  };
}

/** Per-minute limits need most of a minute of waiting, not seconds. */
const RATE_LIMIT_WAITS = [20_000, 45_000, 60_000];

function parseChatResult(model: string, payload: any): ChatResult {
  const result = payload?.result ?? {};
  const message = result?.choices?.[0]?.message;
  const rawContent =
    (typeof message?.content === "string" ? message.content : "") ||
    (typeof result?.response === "string" ? result.response : "") ||
    (typeof message?.text === "string" ? message.text : "");
  const reasoningText =
    typeof message?.reasoning === "string" && message.reasoning !== ""
      ? message.reasoning
      : typeof message?.reasoning_content === "string" && message.reasoning_content !== ""
        ? message.reasoning_content
        : null;
  const usage = result?.usage ?? payload?.usage ?? {};
  const channel: ChatResult["channel"] =
    rawContent !== "" ? "content" : reasoningText !== null ? "reasoning" : "none";
  return {
    model,
    text: rawContent !== "" ? rawContent : (reasoningText ?? ""),
    rawContent,
    reasoningText,
    channel,
    inputTokens: usage.prompt_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0,
    neurons: typeof usage.neurons === "number" ? usage.neurons : 0,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
