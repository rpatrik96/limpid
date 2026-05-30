/**
 * OpenAI-compatible provider presets, shared by the extension picker and the eval.
 *
 * `jsonMode` is the per-provider capability flag: OpenAI/OpenRouter/Mistral honour
 * `response_format: json_object` reliably; Groq/Together support it only on some
 * models, so we default them to prompt-instructed JSON (the coach validates either
 * way). Ollama is keyless and handled by the caller via OpenAICompatibleModel.
 */
import type { LanguageModel } from "@coach/contract";

import { OpenAICompatibleModel } from "./openaiCompatible.js";

export interface ProviderPreset {
  id: string;
  baseURL: string;
  /** secret slot name for the API key (see @coach/extension secrets). */
  secret: string;
  defaultModel: string;
  label: string;
  extraHeaders?: Record<string, string>;
  /** whether to request response_format json_object (else prompt-only JSON). */
  jsonMode: boolean;
}

export const OPENAI_PRESETS: Record<string, ProviderPreset> = {
  openai: {
    id: "openai",
    baseURL: "https://api.openai.com/v1",
    secret: "openai",
    defaultModel: "gpt-4o-mini",
    label: "openai",
    jsonMode: true,
  },
  openrouter: {
    id: "openrouter",
    baseURL: "https://openrouter.ai/api/v1",
    secret: "openrouter",
    defaultModel: "openai/gpt-4o-mini",
    label: "openrouter",
    extraHeaders: { "HTTP-Referer": "https://github.com/rpatrik96/limpid", "X-Title": "Limpid" },
    jsonMode: true,
  },
  groq: {
    id: "groq",
    baseURL: "https://api.groq.com/openai/v1",
    secret: "groq",
    defaultModel: "llama-3.3-70b-versatile",
    label: "groq",
    jsonMode: false,
  },
  together: {
    id: "together",
    baseURL: "https://api.together.xyz/v1",
    secret: "together",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    label: "together",
    jsonMode: false,
  },
  mistral: {
    id: "mistral",
    baseURL: "https://api.mistral.ai/v1",
    secret: "mistral",
    defaultModel: "mistral-large-latest",
    label: "mistral",
    jsonMode: true,
  },
};

/** Build a model from a preset, with an optional API key and model override. */
export function buildPresetModel(
  preset: ProviderPreset,
  opts: { apiKey?: string | undefined; model?: string | undefined },
): LanguageModel {
  return new OpenAICompatibleModel({
    baseURL: preset.baseURL,
    model: opts.model ?? preset.defaultModel,
    label: preset.label,
    jsonMode: preset.jsonMode,
    ...(opts.apiKey ? { apiKey: opts.apiKey } : {}),
    ...(preset.extraHeaders ? { extraHeaders: preset.extraHeaders } : {}),
  });
}
