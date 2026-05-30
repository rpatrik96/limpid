/**
 * Language-model selection for the host. `limpid.provider` chooses an explicit
 * provider, or "auto" tries, in order: Copilot (free, no key) → Anthropic key →
 * any configured OpenAI-compatible key. Claude Code (CLI) and Ollama are opt-in
 * (they need a local install), so "auto" never spawns them. Returns `null` for
 * the deterministic-only path. The @coach core only ever sees a `LanguageModel`.
 *
 * The adapters live in `@coach/providers` (pure, shared with the eval); only the
 * Copilot adapter (`vscodeModel`) stays here because it needs `vscode`.
 */
import * as vscode from "vscode";

import type { LanguageModel } from "@coach/contract";
import {
  OPENAI_PRESETS,
  buildPresetModel,
  OpenAICompatibleModel,
  ClaudeLanguageModel,
  ClaudeCliModel,
} from "@coach/providers";

import { tryVsCodeModel } from "./vscodeModel.js";
import { getApiKey } from "./secrets.js";

export type ProviderId =
  | "auto"
  | "copilot"
  | "claude-code"
  | "anthropic"
  | "openai"
  | "openrouter"
  | "groq"
  | "together"
  | "mistral"
  | "ollama"
  | "openai-compatible";

function cfg<T>(key: string): T | undefined {
  return vscode.workspace.getConfiguration("limpid").get<T>(key);
}

function modelOverride(): string | undefined {
  const m = cfg<string>("model")?.trim();
  return m ? m : undefined;
}

async function buildOpenAIPreset(
  context: vscode.ExtensionContext,
  id: string,
): Promise<LanguageModel | null> {
  const preset = OPENAI_PRESETS[id];
  if (!preset) return null;
  const apiKey = await getApiKey(context, preset.secret);
  if (!apiKey) return null;
  return buildPresetModel(preset, { apiKey, model: modelOverride() });
}

function buildOllama(): LanguageModel {
  const baseURL = cfg<string>("ollama.baseURL")?.trim() || "http://localhost:11434/v1";
  return new OpenAICompatibleModel({ baseURL, model: modelOverride() ?? "llama3.1", label: "ollama" });
}

function buildClaudeCode(): LanguageModel {
  const model = modelOverride();
  return new ClaudeCliModel({
    command: cfg<string>("claudeCode.command")?.trim() || "claude",
    ...(model ? { model } : {}),
  });
}

async function buildAnthropic(context: vscode.ExtensionContext): Promise<LanguageModel | null> {
  const apiKey = await getApiKey(context, "anthropic");
  if (!apiKey) return null;
  return new ClaudeLanguageModel(apiKey, modelOverride() ?? "claude-sonnet-4-6");
}

async function buildCustom(context: vscode.ExtensionContext): Promise<LanguageModel | null> {
  const baseURL = cfg<string>("openaiCompatible.baseURL")?.trim();
  if (!baseURL) return null;
  const apiKey = await getApiKey(context, "openai"); // reuse the openai key slot for a custom endpoint
  const model = modelOverride() ?? (cfg<string>("openaiCompatible.model")?.trim() || "gpt-4o-mini");
  return new OpenAICompatibleModel({
    baseURL,
    model,
    label: "openai-compatible",
    ...(apiKey ? { apiKey } : {}),
  });
}

/** Pick the configured (or auto-detected) model, or null for deterministic-only. */
export async function pickLanguageModel(
  context: vscode.ExtensionContext,
): Promise<LanguageModel | null> {
  const choice = (cfg<string>("provider") as ProviderId | undefined) ?? "auto";

  switch (choice) {
    case "copilot":
      return tryVsCodeModel();
    case "claude-code":
      return buildClaudeCode();
    case "anthropic":
      return buildAnthropic(context);
    case "openai":
    case "openrouter":
    case "groq":
    case "together":
    case "mistral":
      return buildOpenAIPreset(context, choice);
    case "ollama":
      return buildOllama();
    case "openai-compatible":
      return buildCustom(context);
    case "auto":
    default: {
      const copilot = await tryVsCodeModel();
      if (copilot) return copilot;
      const anthropic = await buildAnthropic(context);
      if (anthropic) return anthropic;
      for (const id of ["openai", "openrouter", "groq", "together", "mistral"]) {
        const model = await buildOpenAIPreset(context, id);
        if (model) return model;
      }
      return null;
    }
  }
}
