/**
 * @coach/providers — host-side LanguageModel adapters shared by the VS Code
 * extension and the eval harness. NOT a pure core package: it uses `fetch` and
 * `child_process`. The Copilot adapter stays in the extension (it needs `vscode`).
 */
export {
  OpenAICompatibleModel,
  buildChatBody,
  parseChatContent,
  DEFAULT_REQUEST_TIMEOUT_MS,
} from "./openaiCompatible.js";
export type { OpenAICompatibleConfig, FetchLike, FetchResponseLike } from "./openaiCompatible.js";

export { ClaudeLanguageModel, tryClaudeModel } from "./claude.js";
export type { ClaudeModelConfig } from "./claude.js";

export { ClaudeCliModel, parseClaudeResult, defaultRunner } from "./cliModel.js";
export type { CliRunner, ClaudeCliConfig } from "./cliModel.js";

export { OPENAI_PRESETS, buildPresetModel, SECRET_SLOTS } from "./presets.js";
export type { ProviderPreset } from "./presets.js";

export { fromEnv } from "./env.js";
