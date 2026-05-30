/**
 * A {@link LanguageModel} backed by VS Code's Language Model API (Copilot).
 *
 * This adapter is the bridge between the host's `vscode.lm` and the core's
 * provider-agnostic `@coach/contract` interface. It is the only file besides
 * `extension.ts` that touches `vscode`, keeping the @coach core free of host APIs.
 *
 * Absence of a chat model (no Copilot / no consent) is reported as `null` by
 * {@link tryVsCodeModel}; the `providers` picker then falls back to Claude or to
 * a deterministic-only run.
 */
import type { LanguageModel, LMRequest, LMResponse } from "@coach/contract";
import * as vscode from "vscode";

/** Wraps a `vscode.LanguageModelChat` as a contract {@link LanguageModel}. */
export class VsCodeLanguageModel implements LanguageModel {
  readonly id: string;
  private readonly chat: vscode.LanguageModelChat;

  constructor(chat: vscode.LanguageModelChat) {
    this.chat = chat;
    this.id = `vscode:${chat.vendor}/${chat.family}`;
  }

  async complete(request: LMRequest): Promise<LMResponse> {
    const messages: vscode.LanguageModelChatMessage[] = [];
    if (request.system) {
      // The LM API has no dedicated system role; prepend it as a user turn.
      messages.push(vscode.LanguageModelChatMessage.User(request.system));
    }
    messages.push(vscode.LanguageModelChatMessage.User(request.prompt));

    const response = await this.chat.sendRequest(
      messages,
      {},
      new vscode.CancellationTokenSource().token,
    );

    let text = "";
    for await (const fragment of response.text) {
      text += fragment;
    }
    return { text };
  }
}

/**
 * Select a chat model from the host, preferring Copilot. Returns `null` when no
 * model is available so the caller can fall back to Claude or a deterministic run.
 */
export async function tryVsCodeModel(): Promise<LanguageModel | null> {
  let models: readonly vscode.LanguageModelChat[] = [];
  try {
    models = await vscode.lm.selectChatModels({ vendor: "copilot" });
    if (models.length === 0) {
      models = await vscode.lm.selectChatModels();
    }
  } catch {
    return null;
  }
  const chat = models[0];
  if (!chat) return null;
  return new VsCodeLanguageModel(chat);
}
