/**
 * Inline editor diagnostics (tier 1): run the DETERMINISTIC engine on save/open
 * and surface its findings as squiggles + Problems-panel entries, mapped back to
 * the `.tex` source via @coach/latex.locateSpanInSource. No LLM here — this layer
 * is fast and free; the LLM lenses stay in the Coach view. A hover shows the
 * rule's rationale, and a quick-fix opens the full Coach.
 *
 * Refresh happens on open and on save (never per-keystroke), matching the
 * coach's save-triggered model. Toggle with `limpid.diagnostics.enabled`.
 */
import * as vscode from "vscode";

import type { Finding } from "@coach/contract";
import { locateSpanInSource } from "@coach/latex";
import { analyze } from "@coach/engine";
import { defaultRubric } from "@coach/rubric";

import { formatFor, isMarkdown, MARKDOWN_LANGS } from "./format.js";

const SOURCE = "Limpid";
const LATEX_LANGS = new Set(["latex", "tex", "plaintext"]);
// Languages the hover / code-action selector registers for: LaTeX + plaintext + every
// Markdown variant that `format.ts` routes to the Markdown extractor.
const LANGS = [...LATEX_LANGS, ...MARKDOWN_LANGS];

/** ruleId → rationale, for hover text. */
const RATIONALE = new Map(defaultRubric.rules.map((r) => [r.id, r.rationale]));

let collection: vscode.DiagnosticCollection | undefined;

function diagnosticsEnabled(): boolean {
  return vscode.workspace.getConfiguration("limpid").get<boolean>("diagnostics.enabled") ?? true;
}

function relevant(doc: vscode.TextDocument): boolean {
  return doc.uri.scheme === "file" && (isMarkdown(doc) || LATEX_LANGS.has(doc.languageId));
}

function severityOf(s: Finding["severity"]): vscode.DiagnosticSeverity {
  switch (s) {
    case "error":
      return vscode.DiagnosticSeverity.Error;
    case "warning":
      return vscode.DiagnosticSeverity.Warning;
    case "suggestion":
      return vscode.DiagnosticSeverity.Information;
    default:
      return vscode.DiagnosticSeverity.Hint;
  }
}

/** Recompute + publish diagnostics for one document. */
function refresh(doc: vscode.TextDocument): void {
  if (!collection) return;
  if (!diagnosticsEnabled() || !relevant(doc)) {
    collection.delete(doc.uri);
    return;
  }

  const source = doc.getText();
  const extraction = formatFor(doc).extract(source);
  const { findings } = analyze(extraction.text);

  const diags: vscode.Diagnostic[] = [];
  for (const f of findings) {
    if (f.method === "llm") continue; // inline = deterministic/heuristic only
    const span = f.spans[0];
    if (!span) continue;
    const loc = locateSpanInSource(source, extraction, span);
    if (!loc) continue;
    const range = new vscode.Range(doc.positionAt(loc.start), doc.positionAt(loc.end));
    const d = new vscode.Diagnostic(range, f.message, severityOf(f.severity));
    d.source = SOURCE;
    d.code = f.ruleId;
    diags.push(d);
  }
  collection.set(doc.uri, diags);
}

function refreshVisible(): void {
  for (const ed of vscode.window.visibleTextEditors) refresh(ed.document);
}

export function registerDiagnostics(context: vscode.ExtensionContext): void {
  collection = vscode.languages.createDiagnosticCollection("limpid");
  const selector = LANGS.map((language) => ({ language, scheme: "file" }));

  context.subscriptions.push(
    collection,
    vscode.workspace.onDidOpenTextDocument((d) => refresh(d)),
    vscode.workspace.onDidSaveTextDocument((d) => refresh(d)),
    vscode.workspace.onDidCloseTextDocument((d) => collection?.delete(d.uri)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("limpid.diagnostics")) refreshVisible();
    }),

    // Hover: the rule's rationale for any Limpid diagnostic under the cursor.
    vscode.languages.registerHoverProvider(selector, {
      provideHover(doc, pos) {
        const here = (collection?.get(doc.uri) ?? []).filter(
          (d) => d.source === SOURCE && d.range.contains(pos),
        );
        if (here.length === 0) return undefined;
        const md = new vscode.MarkdownString();
        md.appendMarkdown("**Limpid**\n");
        for (const d of here) {
          const why = typeof d.code === "string" ? RATIONALE.get(d.code) : undefined;
          md.appendMarkdown(`\n- ${d.message}${why ? ` — _${why}_` : ""}`);
        }
        return new vscode.Hover(md);
      },
    }),

    // Quick-fix: jump to the full Coach for the deeper, LLM-backed view.
    vscode.languages.registerCodeActionsProvider(
      selector,
      {
        provideCodeActions(doc, _range, ctx) {
          const ours = ctx.diagnostics.filter((d) => d.source === SOURCE);
          if (ours.length === 0) return undefined;
          const action = new vscode.CodeAction(
            "Coach this in Limpid",
            vscode.CodeActionKind.QuickFix,
          );
          // Coach exactly the flagged range, not the whole file.
          action.command = {
            command: "limpid.coachRange",
            title: "Coach this in Limpid",
            arguments: [doc.uri, ours[0]!.range],
          };
          action.diagnostics = [...ours];
          return [action];
        },
      },
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
    ),
  );

  refreshVisible();
}
