/**
 * API-key storage via VS Code SecretStorage (OS keychain) — never settings.json,
 * which is plaintext and syncs/leaks. Keys are namespaced `limpid.apiKey.<provider>`.
 *
 * The set of key slots (Anthropic, the OpenAI-compatible presets, and a dedicated
 * slot for a user's own OpenAI-compatible endpoint) is the canonical {@link
 * SECRET_SLOTS} from `@coach/providers`, so the picker can never drift from the
 * providers actually wired up.
 */
import * as vscode from "vscode";

import { SECRET_SLOTS } from "@coach/providers";

const PREFIX = "limpid.apiKey.";

/** Key slots offered by the Set/Clear API Key commands (re-exported for callers). */
export const SECRET_PROVIDERS = SECRET_SLOTS;

/** A friendly one-liner per slot for the picker. */
const SLOT_DESCRIPTION: Record<string, string> = {
  anthropic: "Anthropic (Claude) API",
  openai: "OpenAI API",
  openrouter: "OpenRouter",
  groq: "Groq",
  together: "Together",
  mistral: "Mistral",
  "openai-compatible": "your own OpenAI-compatible endpoint (limpid.openaiCompatible.baseURL)",
};

export function getApiKey(
  context: vscode.ExtensionContext,
  provider: string,
): Thenable<string | undefined> {
  return context.secrets.get(PREFIX + provider);
}

/** Show the key-slot picker, annotating each with its purpose + whether a key is stored. */
async function pickSlot(
  context: vscode.ExtensionContext,
  placeHolder: string,
): Promise<string | undefined> {
  const items = await Promise.all(
    SECRET_SLOTS.map(async (slot) => {
      const stored = await getApiKey(context, slot);
      const purpose = SLOT_DESCRIPTION[slot] ?? slot;
      return { label: slot, description: stored ? `${purpose} — stored` : purpose };
    }),
  );
  const picked = await vscode.window.showQuickPick(items, { placeHolder });
  return picked?.label;
}

/** Command: pick a provider, enter a key (masked), store it in the keychain. */
export async function setApiKeyCommand(context: vscode.ExtensionContext): Promise<void> {
  const provider = await pickSlot(context, "Which provider's API key do you want to store?");
  if (!provider) return;

  const key = await vscode.window.showInputBox({
    prompt: `Enter your ${provider} API key — stored in the OS keychain, never in settings`,
    password: true,
    ignoreFocusOut: true,
  });
  if (!key) return;

  await context.secrets.store(PREFIX + provider, key.trim());
  void vscode.window.showInformationMessage(`Limpid: stored the ${provider} API key.`);
}

/** Command: pick a provider and delete its stored key. */
export async function clearApiKeyCommand(context: vscode.ExtensionContext): Promise<void> {
  const provider = await pickSlot(context, "Which provider's API key do you want to clear?");
  if (!provider) return;

  await context.secrets.delete(PREFIX + provider);
  void vscode.window.showInformationMessage(`Limpid: cleared the ${provider} API key.`);
}
