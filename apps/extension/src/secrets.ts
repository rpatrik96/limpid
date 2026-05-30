/**
 * API-key storage via VS Code SecretStorage (OS keychain) — never settings.json,
 * which is plaintext and syncs/leaks. Keys are namespaced `limpid.apiKey.<provider>`.
 */
import * as vscode from "vscode";

const PREFIX = "limpid.apiKey.";

/** Providers that authenticate with an API key (Copilot/Claude-CLI/Ollama need none). */
export const SECRET_PROVIDERS = [
  "anthropic",
  "openai",
  "openrouter",
  "groq",
  "together",
  "mistral",
] as const;

export type SecretProvider = (typeof SECRET_PROVIDERS)[number];

export function getApiKey(
  context: vscode.ExtensionContext,
  provider: string,
): Thenable<string | undefined> {
  return context.secrets.get(PREFIX + provider);
}

/** Command: pick a provider, enter a key (masked), store it in the keychain. */
export async function setApiKeyCommand(context: vscode.ExtensionContext): Promise<void> {
  const provider = await vscode.window.showQuickPick([...SECRET_PROVIDERS], {
    placeHolder: "Which provider's API key do you want to store?",
  });
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
  const provider = await vscode.window.showQuickPick([...SECRET_PROVIDERS], {
    placeHolder: "Which provider's API key do you want to clear?",
  });
  if (!provider) return;

  await context.secrets.delete(PREFIX + provider);
  void vscode.window.showInformationMessage(`Limpid: cleared the ${provider} API key.`);
}
