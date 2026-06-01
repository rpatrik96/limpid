/**
 * A {@link LanguageModel} backed by VS Code's Language Model API (Copilot).
 *
 * Works on Copilot **Free** — no paid plan required — but the first use triggers a
 * per-extension consent dialog (so it must run from a user command, which the
 * coach run is), and the shared monthly quota can be exhausted. We pass a
 * `justification`, prefer a cheap model, and surface `LanguageModelError` codes
 * (`NoPermissions` / `Blocked` / `NotFound`) so the caller can degrade gracefully.
 *
 * This and `extension.ts`/`providers.ts` are the only files that touch `vscode`,
 * keeping the @coach core free of host APIs.
 */
import type { LanguageModel, LMRequest, LMResponse } from "@coach/contract";
import * as vscode from "vscode";

const JUSTIFICATION = "Limpid coaches your writing using this model (one request per run).";

/** Cheap-first family preferences to conserve the Copilot Free quota. */
const PREFERRED_FAMILIES = ["gpt-4o-mini", "gpt-4o"];

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

    try {
      const response = await this.chat.sendRequest(
        messages,
        { justification: JUSTIFICATION },
        new vscode.CancellationTokenSource().token,
      );
      let text = "";
      for await (const fragment of response.text) {
        text += fragment;
      }
      return { text };
    } catch (err) {
      throw asReadableError(err);
    }
  }
}

/** Turn a `LanguageModelError` (or anything) into a clear, fall-back-friendly error. */
function asReadableError(err: unknown): Error {
  if (err instanceof vscode.LanguageModelError) {
    if (err.code === vscode.LanguageModelError.NoPermissions.name) {
      return new Error("Copilot access not granted (consent denied).");
    }
    if (err.code === vscode.LanguageModelError.Blocked.name) {
      return new Error(
        "Copilot request blocked — likely the monthly Free quota or a content filter.",
      );
    }
    if (err.code === vscode.LanguageModelError.NotFound.name) {
      return new Error("The requested Copilot model is unavailable on this plan.");
    }
  }
  const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : "";
  if (cause.includes("off_topic"))
    return new Error("Copilot declined the request (off-topic filter).");
  return err instanceof Error ? err : new Error(String(err));
}

/**
 * Select a Copilot chat model, cheapest-first. Returns `null` when none is
 * available (not signed in / no Copilot / family unavailable) so the caller can
 * fall back. The actual quota/consent errors surface later, from `complete()`.
 */
export async function tryVsCodeModel(): Promise<LanguageModel | null> {
  const configured = vscode.workspace.getConfiguration("limpid").get<string>("model")?.trim();
  const families = configured ? [configured, ...PREFERRED_FAMILIES] : PREFERRED_FAMILIES;

  try {
    for (const family of families) {
      const models = await vscode.lm.selectChatModels({ vendor: "copilot", family });
      const chat = models[0];
      if (chat) return new VsCodeLanguageModel(chat);
    }
    // No preferred family matched — take any Copilot model the plan offers.
    const any = await vscode.lm.selectChatModels({ vendor: "copilot" });
    const chat = any[0];
    if (chat) return new VsCodeLanguageModel(chat);
  } catch {
    return null;
  }
  return null;
}
