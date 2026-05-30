/**
 * A {@link LanguageModel} backed by the Anthropic Messages API.
 *
 * Used when the user configures an Anthropic key. Network I/O lives here (the host
 * layer) so the @coach core stays pure. Uses the global `fetch` (Node 18+ / the
 * extension host).
 */
import type { LanguageModel, LMRequest, LMResponse } from "@coach/contract";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-6";

interface AnthropicContentBlock {
  type: string;
  text?: string;
}
interface AnthropicResponse {
  content?: AnthropicContentBlock[];
}

/** Adapter over the Anthropic Messages API. */
export class ClaudeLanguageModel implements LanguageModel {
  readonly id: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model: string = DEFAULT_MODEL) {
    this.apiKey = apiKey;
    this.model = model;
    this.id = `anthropic:${model}`;
  }

  async complete(request: LMRequest): Promise<LMResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: request.maxTokens ?? 2048,
      messages: [{ role: "user", content: request.prompt }],
    };
    if (request.system) body["system"] = request.system;
    if (request.temperature !== undefined) body["temperature"] = request.temperature;

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

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
