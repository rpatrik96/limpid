/**
 * A {@link LanguageModel} backed by the Anthropic Messages API.
 *
 * Used when the user configures an Anthropic key. Network I/O lives here (the host
 * layer) so the @coach core stays pure. Uses the global `fetch` (Node 18+ / the
 * extension host).
 */
import type { LanguageModel, LMRequest, LMResponse } from "@coach/contract";

import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  type FetchLike,
  type FetchResponseLike,
} from "./openaiCompatible.js";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-6";

interface AnthropicContentBlock {
  type: string;
  text?: string;
}
interface AnthropicResponse {
  content?: AnthropicContentBlock[];
}

const defaultFetch: FetchLike = (url, init) => fetch(url, init);

export interface ClaudeModelConfig {
  /** abort the request after this many ms (default {@link DEFAULT_REQUEST_TIMEOUT_MS}). */
  timeoutMs?: number | undefined;
  /** injectable for tests; defaults to the global `fetch`. */
  fetchFn?: FetchLike | undefined;
}

/** Adapter over the Anthropic Messages API. */
export class ClaudeLanguageModel implements LanguageModel {
  readonly id: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: FetchLike;

  constructor(apiKey: string, model: string = DEFAULT_MODEL, cfg: ClaudeModelConfig = {}) {
    this.apiKey = apiKey;
    this.model = model;
    this.id = `anthropic:${model}`;
    this.timeoutMs = cfg.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.fetchFn = cfg.fetchFn ?? defaultFetch;
  }

  async complete(request: LMRequest): Promise<LMResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: request.maxTokens ?? 2048,
      messages: [{ role: "user", content: request.prompt }],
    };
    if (request.system) body["system"] = request.system;
    if (request.temperature !== undefined) body["temperature"] = request.temperature;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: FetchResponseLike;
    try {
      res = await this.fetchFn(ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      // A stalled endpoint aborts here; surface it so reviewWithFallback can
      // degrade to the deterministic coach instead of hanging forever.
      if (controller.signal.aborted) {
        throw new Error(`Anthropic API timed out after ${this.timeoutMs}ms`, { cause: e });
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Anthropic API ${res.status}: ${detail.slice(0, 200)}`);
    }

    const data = (await res.json()) as AnthropicResponse;
    const text = (data.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("");
    return { text };
  }
}

/** Build a Claude model from a configured key, or null when no key is set. */
export function tryClaudeModel(apiKey: string | undefined): LanguageModel | null {
  const key = apiKey?.trim();
  if (!key) return null;
  return new ClaudeLanguageModel(key);
}
