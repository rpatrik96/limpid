/**
 * The Learning Center host glue: persist one entry per coach run to
 * `.limpid/history.json`, and a "Learn" webview view that shows the recurring-
 * pattern insight + the pattern library. Pure shaping lives in @coach/history and
 * renderLearn; this file only does the VS Code I/O.
 */
import { basename } from "node:path";

import * as vscode from "vscode";

import type { CoachReport } from "@coach/contract";
import { defaultRubric } from "@coach/rubric";
import {
  appendEntry,
  entryFromReport,
  parseHistory,
  summarize,
  type HistoryEntry,
} from "@coach/history";

import { renderLearn } from "./renderLearn.js";

const VIEW_TYPE = "limpid.learnView";
const HISTORY_CAP = 500;

function historyUri(): vscode.Uri | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder ? vscode.Uri.joinPath(folder.uri, ".limpid", "history.json") : undefined;
}

function historyEnabled(): boolean {
  return vscode.workspace.getConfiguration("limpid").get<boolean>("history.enabled") ?? true;
}

async function loadEntries(): Promise<HistoryEntry[]> {
  const uri = historyUri();
  if (!uri) return [];
  try {
    const raw = await vscode.workspace.fs.readFile(uri);
    return parseHistory(JSON.parse(new TextDecoder().decode(raw)));
  } catch {
    return []; // no file yet, or unreadable
  }
}

let provider: LearnViewProvider | undefined;

/** Append a run to history (if enabled) and refresh the Learn view. */
export async function recordRun(report: CoachReport, file: string): Promise<void> {
  if (!historyEnabled()) return;
  const uri = historyUri();
  if (!uri) return;
  const entry = entryFromReport(report, Date.now(), basename(file));
  const next = appendEntry(await loadEntries(), entry, HISTORY_CAP);
  try {
    await vscode.workspace.fs.writeFile(
      uri,
      new TextEncoder().encode(JSON.stringify(next, null, 2) + "\n"),
    );
  } catch {
    return; // read-only workspace — skip persistence
  }
  await provider?.refresh();
}

class LearnViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: false };
    view.onDidDispose(
      () => {
        this.view = undefined;
      },
      null,
      this.context.subscriptions,
    );
    void this.render();
  }

  async refresh(): Promise<void> {
    await this.render();
  }

  private async render(): Promise<void> {
    if (!this.view) return;
    const summary = summarize(await loadEntries());
    this.view.webview.html = renderLearn(defaultRubric.patterns, summary, { nonce: makeNonce() });
  }
}

export function registerLearnView(context: vscode.ExtensionContext): void {
  provider = new LearnViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_TYPE, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );
}

function makeNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}
