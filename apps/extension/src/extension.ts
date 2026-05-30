/**
 * Limpid — VS Code extension entry point.
 *
 * The one package allowed to import `vscode`. It wires the host to the pure
 * @coach core through the documented data flow:
 *
 *   latex.extract(tex) → engine.analyze(text) → coach.review({…}) → CoachReport
 *
 * then renders the report into a webview panel. A model is chosen by `providers`
 * (Copilot, Claude, OpenAI/OpenRouter/Groq/Together/Mistral, Ollama, or the Claude
 * Code CLI; "auto" prefers free Copilot). Without one — or if the model errors —
 * the coach returns a deterministic-only report. The panel is interactive: changing
 * the audience re-runs the review at a new altitude, and a finding's "reveal"
 * button selects the offending span back in the editor.
 */
import * as vscode from "vscode";

import type { CoachInput, CoachReport, Extraction, LanguageModel } from "@coach/contract";
import { extract } from "@coach/latex";
import { analyze } from "@coach/engine";
import { defaultRubric } from "@coach/rubric";
import { createCoach } from "@coach/coach";

import { renderReport, DEFAULT_AUDIENCES } from "./render.js";
import { pickLanguageModel } from "./providers.js";
import { setApiKeyCommand, clearApiKeyCommand } from "./secrets.js";

const COMMAND_ID = "limpid.coach";
const PANEL_VIEW_TYPE = "limpid.panel";
const CONFIG_SECTION = "limpid";

/** Per-document session so audience re-runs and deltas have context to reuse. */
interface Session {
  tex: string;
  fileName: string;
  docUri: vscode.Uri;
  report: CoachReport;
  audience: string | undefined;
}

let coach = createCoach();
let extContext: vscode.ExtensionContext | undefined;
let activePanel: vscode.WebviewPanel | undefined;
let session: Session | undefined;
/** Last report per document URI, so the next run fills a GradeDelta. */
const lastReportByDoc = new Map<string, CoachReport>();

export function activate(context: vscode.ExtensionContext): void {
  coach = createCoach();
  extContext = context;
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_ID, () => runCommand(context)),
    vscode.commands.registerCommand("limpid.setApiKey", () => setApiKeyCommand(context)),
    vscode.commands.registerCommand("limpid.clearApiKey", () => clearApiKeyCommand(context)),
  );
}

export function deactivate(): void {
  lastReportByDoc.clear();
  session = undefined;
  extContext = undefined;
}

async function runCommand(context: vscode.ExtensionContext): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage("Limpid: open a document first.");
    return;
  }

  const { tex, fileName } = readTarget(editor);
  if (tex.trim().length === 0) {
    void vscode.window.showWarningMessage("Limpid: nothing to coach (empty selection).");
    return;
  }

  const docUri = editor.document.uri;
  const audience = configString("audience");
  const previous = lastReportByDoc.get(docUri.toString());

  const report = await runReview(tex, fileName, audience, previous);
  session = { tex, fileName, docUri, report, audience };
  lastReportByDoc.set(docUri.toString(), report);
  showPanel(context, report);
}

/** Read the selection if non-empty, else the whole document. */
function readTarget(editor: vscode.TextEditor): { tex: string; fileName: string } {
  const doc = editor.document;
  const selection = editor.selection;
  const tex = selection.isEmpty ? doc.getText() : doc.getText(selection);
  return { tex, fileName: doc.fileName };
}

/** Read a trimmed string setting, returning undefined when empty. */
function configString(key: string): string | undefined {
  const raw = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>(key);
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

/** The documented pipeline (extract → analyze → review), with progress UI. */
async function runReview(
  tex: string,
  fileName: string,
  audience: string | undefined,
  previous: CoachReport | undefined,
): Promise<CoachReport> {
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Limpid: analyzing…" },
    async () => {
      const extraction: Extraction = extract(tex);
      const engine = analyze(extraction.text);

      const base: CoachInput = {
        extraction,
        engine,
        rubric: defaultRubric,
        ...(audience ? { audience } : {}),
        ...(previous ? { previous } : {}),
      };

      const model = extContext ? await pickLanguageModel(extContext) : null;
      const report = model ? await reviewWithFallback(base, model) : await coach.review(base);
      return { ...report, target: { ...report.target, file: fileName } };
    },
  );
}

/** Review with the model; on any model error, fall back to a deterministic report. */
async function reviewWithFallback(base: CoachInput, model: LanguageModel): Promise<CoachReport> {
  try {
    return await coach.review({ ...base, model });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    void vscode.window.showInformationMessage(
      `Limpid: language model unavailable — showing a deterministic-only report. (${msg})`,
    );
    const det = await coach.review(base);
    return { ...det, meta: { ...det.meta, note: `LLM unavailable: ${msg}` } };
  }
}

/** Open (or reuse) the coach webview panel; wire its message handler once. */
function showPanel(context: vscode.ExtensionContext, report: CoachReport): void {
  if (!activePanel) {
    activePanel = vscode.window.createWebviewPanel(
      PANEL_VIEW_TYPE,
      "Limpid",
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    activePanel.onDidDispose(
      () => {
        activePanel = undefined;
      },
      null,
      context.subscriptions,
    );
    activePanel.webview.onDidReceiveMessage(handleMessage, undefined, context.subscriptions);
  }
  update(report);
}

/** Render the current report into the panel. */
function update(report: CoachReport): void {
  if (!activePanel) return;
  activePanel.webview.html = renderReport(report, {
    nonce: makeNonce(),
    audiences: DEFAULT_AUDIENCES,
    currentAudience: session?.audience ?? "",
  });
  activePanel.reveal(vscode.ViewColumn.Beside, true);
}

/** Handle webview → host messages: re-run at a new audience, or reveal a span. */
async function handleMessage(message: unknown): Promise<void> {
  if (!message || typeof message !== "object" || !session) return;
  const msg = message as { type?: string; audience?: string; finding?: number };

  if (msg.type === "setAudience") {
    const audience = msg.audience?.trim() || undefined;
    const report = await runReview(session.tex, session.fileName, audience, session.report);
    session = { ...session, report, audience };
    lastReportByDoc.set(session.docUri.toString(), report);
    update(report);
  } else if (msg.type === "reveal" && typeof msg.finding === "number") {
    await revealFinding(session, msg.finding);
  }
}

/** Best-effort: find the finding's snippet in the source and select it. */
async function revealFinding(s: Session, index: number): Promise<void> {
  const finding = s.report.findings[index];
  const span = finding?.spans[0];
  if (!finding || !span) return;

  const snippet = s.report.extractedText.slice(span.start, span.end).trim();
  if (snippet.length < 2) return;

  let doc: vscode.TextDocument;
  try {
    doc = await vscode.workspace.openTextDocument(s.docUri);
  } catch {
    return;
  }

  // The extracted prose differs from raw .tex, so locate the snippet by text.
  const idx = doc.getText().indexOf(snippet);
  if (idx < 0) {
    void vscode.window.showInformationMessage(
      `Limpid: couldn't locate "${snippet.slice(0, 40)}…" in the source.`,
    );
    return;
  }
  const start = doc.positionAt(idx);
  const end = doc.positionAt(idx + snippet.length);
  const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
  editor.selection = new vscode.Selection(start, end);
  editor.revealRange(new vscode.Range(start, end), vscode.TextEditorRevealType.InCenter);
}

/** A 32-char nonce for the webview's inline-style/script CSP. */
function makeNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}
