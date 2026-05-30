/**
 * Language-model selection for the host: prefer Copilot (VS Code LM API), fall
 * back to Claude when an API key is configured, else `null` so the coach degrades
 * to a deterministic-only report. The @coach core never sees this — it only takes
 * a `LanguageModel` (or none) through the contract.
 */
import type { LanguageModel } from "@coach/contract";

import { tryVsCodeModel } from "./vscodeModel.js";
import { tryClaudeModel } from "./claude.js";

export interface ModelOptions {
  anthropicApiKey?: string | undefined;
}

/** Pick the best available model, or null for the deterministic-only path. */
export async function pickLanguageModel(
  options: ModelOptions = {},
): Promise<LanguageModel | null> {
  const copilot = await tryVsCodeModel();
  if (copilot) return copilot;
  return tryClaudeModel(options.anthropicApiKey);
}
