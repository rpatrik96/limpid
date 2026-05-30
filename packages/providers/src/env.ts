/**
 * Build an OpenAI-compatible model from environment variables — used by the eval
 * (`npm run eval` with LIMPID_EVAL_BASE_URL / _API_KEY / _MODEL). The env map is
 * passed in so this stays free of a `process` dependency.
 */
import type { LanguageModel } from "@coach/contract";

import { OpenAICompatibleModel } from "./openaiCompatible.js";

export function fromEnv(env: Record<string, string | undefined>): LanguageModel | null {
  const baseURL = env["LIMPID_EVAL_BASE_URL"];
  if (!baseURL) return null;
  const apiKey = env["LIMPID_EVAL_API_KEY"];
  return new OpenAICompatibleModel({
    baseURL,
    model: env["LIMPID_EVAL_MODEL"] ?? "gpt-4o-mini",
    label: "eval",
    ...(apiKey ? { apiKey } : {}),
  });
}
