/**
 * A {@link LanguageModel} over the OpenAI Chat Completions shape.
 *
 * One adapter covers every provider that speaks `POST {baseURL}/chat/completions`
 * — OpenAI, OpenRouter, Groq, Together, Mistral, and local Ollama — parameterized
 * by `{ baseURL, apiKey?, model, extraHeaders? }`. The `fetchFn` seam lets tests
 * inject responses.
 *
 * Native Anthropic is intentionally NOT folded in here (it uses `x-api-key` +
 * `anthropic-version` and a different response shape) — see `claude.ts`.
 */
import type { LanguageModel, LMRequest, LMResponse } from "@coach/contract";

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal | undefined;
  },
) => Promise<FetchResponseLike>;

const defaultFetch: FetchLike = (url, init) => fetch(url, init);

/** Default request timeout (ms) for network adapters before we abort and fall back. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 90_000;

export interface OpenAICompatibleConfig {
  /** e.g. `https://api.openai.com/v1` (trailing slash tolerated). */
  baseURL: string;
  model: string;
  /** omitted for keyless endpoints such as Ollama. */
  apiKey?: string | undefined;
  /** e.g. OpenRouter's `HTTP-Referer` / `X-Title`. */
  extraHeaders?: Record<string, string> | undefined;
  /** set `response_format: json_object` when a request asks for JSON (default true). */
  jsonMode?: boolean | undefined;
  /** display label for {@link LanguageModel.id}, e.g. "openai". */
  label?: string | undefined;
  /** abort the request after this many ms (default {@link DEFAULT_REQUEST_TIMEOUT_MS}). */
  timeoutMs?: number | undefined;
  /** injectable for tests; defaults to the global `fetch`. */
  fetchFn?: FetchLike | undefined;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Build the Chat Completions request body. Pure — exported for tests. */
export function buildChatBody(
  messages: ChatMessage[],
  model: string,
  opts: { json?: boolean; jsonMode?: boolean; temperature?: number; maxTokens?: number },
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 1024,
  };
  if (opts.json && opts.jsonMode !== false) {
    body["response_format"] = { type: "json_object" };
  }
  return body;
}

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
}

/** Extract `choices[0].message.content`. Pure — exported for tests. */
export function parseChatContent(json: unknown): string {
  const content = (json as ChatResponse | null | undefined)?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

export class OpenAICompatibleModel implements LanguageModel {
  readonly id: string;
  private readonly cfg: OpenAICompatibleConfig;

  constructor(cfg: OpenAICompatibleConfig) {
    this.cfg = cfg;
    this.id = `${cfg.label ?? "openai-compatible"}:${cfg.model}`;
  }

  async complete(request: LMRequest): Promise<LMResponse> {
    const messages: ChatMessage[] = [];
    if (request.system) messages.push({ role: "system", content: request.system });
    messages.push({ role: "user", content: request.prompt });

    const body = buildChatBody(messages, this.cfg.model, {
      json: request.json,
      jsonMode: this.cfg.jsonMode,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
    });

    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...(this.cfg.extraHeaders ?? {}),
    };
    if (this.cfg.apiKey) headers["authorization"] = `Bearer ${this.cfg.apiKey}`;

    const doFetch = this.cfg.fetchFn ?? defaultFetch;
    const url = `${this.cfg.baseURL.replace(/\/$/, "")}/chat/completions`;

    const timeoutMs = this.cfg.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: FetchResponseLike;
    try {
      res = await doFetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      // A stalled endpoint aborts here; surface it so reviewWithFallback can
      // degrade to the deterministic coach instead of hanging forever.
      if (controller.signal.aborted) {
        throw new Error(`${this.id} timed out after ${timeoutMs}ms`, { cause: e });
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`${this.id} ${res.status}: ${detail.slice(0, 200)}`);
    }
    return { text: parseChatContent(await res.json()) };
  }
}
