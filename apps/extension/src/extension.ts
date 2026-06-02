/**
 * Limpid — VS Code extension entry point.
 *
 * Wires the host to the pure @coach core (latex.extract → engine.analyze →
 * coach.review → CoachReport) and renders into an Activity-Bar webview view.
 *
 * What gets coached is a "scope": the current selection, the whole document, or a
 * chosen LaTeX section. The scope is remembered, so saving the file re-runs the
 * SAME scope (re-analysis triggers on save only, never on keystroke — gated by
 * `limpid.reanalyzeOnSave`). A model is chosen by `providers` (Copilot, Claude,
 * OpenAI/OpenRouter/Groq/Together/Mistral, Ollama, or the Claude Code CLI); without
 * one — or on model error — the coach returns a deterministic report.
 */
import * as vscode from "vscode";

import type {
  CoachInput,
  CoachReport,
  ExtractFn,
  Extraction,
  LanguageModel,
} from "@coach/contract";
import { analyze } from "@coach/engine";
import { createCoach } from "@coach/coach";
import { rubricForRegister, REGISTERS, type Register } from "@coach/rubric";

import { renderReport, renderPlaceholder, DEFAULT_AUDIENCES } from "./render.js";
import { pickLanguageModel } from "./providers.js";
import { setApiKeyCommand, clearApiKeyCommand } from "./secrets.js";
import { loadRubric, editRulesCommand, testRuleCommand } from "./rules.js";
import { registerDiagnostics } from "./diagnostics.js";
import { registerLearnView, recordRun } from "./learn.js";
import { formatFor, type DocFormat } from "./format.js";

const COMMAND_ID = "limpid.coach";
const VIEW_TYPE = "limpid.coachView";
const CONFIG_SECTION = "limpid";

/** What to coach. Selection offsets index into the document text. */
type Scope =
  | { kind: "document" }
  | { kind: "selection"; start: number; end: number }
  | { kind: "section"; title: string; index: number };

/** Per-document session so audience re-runs, section re-runs, and deltas reuse context. */
interface Session {
  docUri: vscode.Uri;
  fileName: string;
  scope: Scope;
  report: CoachReport;
  audience: string | undefined;
}

let coach = createCoach();
let extContext: vscode.ExtensionContext | undefined;
let session: Session | undefined;
let viewProvider: CoachViewProvider | undefined;
/** Last report per document URI, so the next run fills a GradeDelta. */
const lastReportByDoc = new Map<string, CoachReport>();

export function activate(context: vscode.ExtensionContext): void {
  coach = createCoach();
  extContext = context;
  viewProvider = new CoachViewProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_TYPE, viewProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand(COMMAND_ID, () => coachSelectionCommand()),
    vscode.commands.registerCommand("limpid.coachSection", () => coachSectionCommand()),
    vscode.commands.registerCommand("limpid.setApiKey", () => setApiKeyCommand(context)),
    vscode.commands.registerCommand("limpid.clearApiKey", () => clearApiKeyCommand(context)),
    vscode.commands.registerCommand("limpid.editRules", () => editRulesCommand()),
    vscode.commands.registerCommand("limpid.testRule", () => testRuleCommand()),
    vscode.workspace.onDidSaveTextDocument((doc) => void onSave(doc)),
  );

  registerDiagnostics(context);
  registerLearnView(context);
}

export function deactivate(): void {
  lastReportByDoc.clear();
  session = undefined;
  extContext = undefined;
  viewProvider = undefined;
}

// ── Command entry points ─────────────────────────────────────────────────────

async function coachSelectionCommand(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage("Limpid: open a document first.");
    return;
  }
  const doc = editor.document;
  const sel = editor.selection;
  const scope: Scope = sel.isEmpty
    ? { kind: "document" }
    : { kind: "selection", start: doc.offsetAt(sel.start), end: doc.offsetAt(sel.end) };
  await coachAndShow(doc, scope, { reveal: true });
}

async function coachSectionCommand(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage("Limpid: open a document first.");
    return;
  }
  const doc = editor.document;
  const fmt = formatFor(doc);
  const sections = fmt.findSourceSections(doc.getText());
  if (sections.length === 0) {
    void vscode.window.showInformationMessage(`Limpid: no ${fmt.sectionNoun} found in this file.`);
    return;
  }

  // Indent each entry relative to the shallowest heading present, so both LaTeX
  // (section=2) and Markdown (h1=1) nest from a flush-left top level.
  const minLevel = Math.min(...sections.map((s) => s.level));
  const pick = await vscode.window.showQuickPick(
    sections.map((s, index) => ({
      label: `${"  ".repeat(Math.max(0, s.level - minLevel))}${s.title || s.command}`,
      description: s.command,
      index,
      title: s.title,
    })),
    { placeHolder: "Pick a section to coach" },
  );
  if (!pick) return;

  await coachAndShow(
    doc,
    { kind: "section", title: pick.title, index: pick.index },
    { reveal: true },
  );
}

/** Re-run the active session's scope when its document is saved (opt-out via config). */
async function onSave(doc: vscode.TextDocument): Promise<void> {
  if (!session || doc.uri.toString() !== session.docUri.toString()) return;
  const enabled =
    vscode.workspace.getConfiguration(CONFIG_SECTION).get<boolean>("reanalyzeOnSave") ?? true;
  if (!enabled) return;
  await coachAndShow(doc, session.scope, { reveal: false });
}

// ── Core: resolve scope → text → review → view ───────────────────────────────

/** Extract the text the scope refers to from the (current) document. */
function textForScope(doc: vscode.TextDocument, scope: Scope, fmt: DocFormat): string {
  if (scope.kind === "document") return doc.getText();

  if (scope.kind === "selection") {
    const max = doc.getText().length;
    const start = Math.max(0, Math.min(scope.start, max));
    const end = Math.max(start, Math.min(scope.end, max));
    return doc.getText(new vscode.Range(doc.positionAt(start), doc.positionAt(end)));
  }

  // section — re-find against the current text (it may have shifted since the pick).
  const full = doc.getText();
  const sections = fmt.findSourceSections(full);
  let sec = sections[scope.index];
  if (!sec || sec.title !== scope.title) sec = sections.find((s) => s.title === scope.title);
  return sec ? full.slice(sec.start, sec.end) : full;
}

interface ShowOpts {
  /** true: reveal/focus the view (manual runs); false: update in place (save runs). */
  reveal: boolean;
}

async function coachAndShow(doc: vscode.TextDocument, scope: Scope, opts: ShowOpts): Promise<void> {
  const fmt = formatFor(doc);
  const text = textForScope(doc, scope, fmt);
  if (text.trim().length === 0) {
    void vscode.window.showWarningMessage("Limpid: nothing to coach (empty selection).");
    return;
  }

  const audience =
    session?.docUri.toString() === doc.uri.toString() ? session.audience : configString("audience");
  const previous = lastReportByDoc.get(doc.uri.toString());

  let report = await runReview(text, doc.fileName, audience, previous, fmt.extract);
  if (scope.kind === "section" && scope.title) {
    report = { ...report, target: { ...report.target, section: scope.title } };
  }

  session = { docUri: doc.uri, fileName: doc.fileName, scope, report, audience };
  lastReportByDoc.set(doc.uri.toString(), report);
  void recordRun(report, doc.fileName);

  if (opts.reveal) await viewProvider?.show();
  else viewProvider?.render();
}

/** Read a trimmed string setting, returning undefined when empty. */
function configString(key: string): string | undefined {
  const raw = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>(key);
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

/** Resolve the register from config (paper/blog/grant/sop) or auto-detect by file type. */
function resolveRegister(fileName: string): Register {
  const cfg = configString("register");
  if (cfg && cfg !== "auto" && (REGISTERS as string[]).includes(cfg)) return cfg as Register;
  return /\.(md|markdown)$/i.test(fileName) ? "blog" : "paper";
}

/** The documented pipeline (extract → analyze → review), with a status-bar spinner. */
async function runReview(
  text: string,
  fileName: string,
  audience: string | undefined,
  previous: CoachReport | undefined,
  extract: ExtractFn,
): Promise<CoachReport> {
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Window, title: "Limpid: analyzing…" },
    async () => {
      const extraction: Extraction = extract(text);
      const engine = analyze(extraction.text);
      const loaded = await loadRubric();
      if (loaded.errors.length) {
        void vscode.window.showWarningMessage(
          `Limpid rules: ${loaded.errors.length} issue(s) — ${loaded.errors[0]}`,
        );
      }
      const rubric = rubricForRegister(resolveRegister(fileName), loaded.rubric);

      const base: CoachInput = {
        extraction,
        engine,
        rubric,
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

/** The Activity-Bar "Coach" view: hosts the report GUI and the message handlers. */
class CoachViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.onDidDispose(
      () => {
        this.view = undefined;
      },
      null,
      this.context.subscriptions,
    );
    view.webview.onDidReceiveMessage(
      (m) => void this.onMessage(m),
      undefined,
      this.context.subscriptions,
    );
    this.render();
  }

  /** Reveal the view (resolving it if hidden) and render the latest report. */
  async show(): Promise<void> {
    await vscode.commands.executeCommand(`${VIEW_TYPE}.focus`);
    this.render();
  }

  /** Render the current session's report, or a placeholder prompt. No focus change. */
  render(): void {
    if (!this.view) return;
    this.view.webview.html = session
      ? renderReport(session.report, {
          nonce: makeNonce(),
          audiences: DEFAULT_AUDIENCES,
          currentAudience: session.audience ?? "",
        })
      : renderPlaceholder({ nonce: makeNonce() });
  }

  private async onMessage(message: unknown): Promise<void> {
    if (!message || typeof message !== "object") return;
    const msg = message as { type?: string; audience?: string; finding?: number };

    if (msg.type === "coach") {
      await coachSelectionCommand();
      return;
    }
    if (msg.type === "coachSection") {
      await coachSectionCommand();
      return;
    }
    if (!session) return;

    if (msg.type === "setAudience") {
      const audience = msg.audience?.trim() || undefined;
      session = { ...session, audience };
      try {
        const doc = await vscode.workspace.openTextDocument(session.docUri);
        await coachAndShow(doc, session.scope, { reveal: false });
      } catch {
        /* document gone — keep the current report */
      }
    } else if (msg.type === "reveal" && typeof msg.finding === "number") {
      await revealFinding(session, msg.finding);
    }
  }
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
