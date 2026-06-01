/**
 * Editable rules: load + merge `.limpid/rules.json` from the workspace into the
 * default rubric, and the two playground commands (edit the file, test a rule
 * against the current selection). The parsing/merging/detecting is pure
 * (@coach/rubric); this file only adds the VS Code I/O.
 */
import * as vscode from "vscode";

import type { RubricConfig } from "@coach/contract";
import { defaultRubric, mergeRubric, parseUserRules, runDetector } from "@coach/rubric";

/** The workspace rules file URI, or undefined when no folder is open. */
function rulesUri(): vscode.Uri | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return undefined;
  return vscode.Uri.joinPath(folder.uri, ".limpid", "rules.json");
}

export interface LoadedRubric {
  rubric: RubricConfig;
  errors: string[];
  loaded: boolean;
}

/** Load + merge user rules; returns the default rubric when no file is present. */
export async function loadRubric(): Promise<LoadedRubric> {
  const uri = rulesUri();
  if (!uri) return { rubric: defaultRubric, errors: [], loaded: false };

  let raw: Uint8Array;
  try {
    raw = await vscode.workspace.fs.readFile(uri);
  } catch {
    return { rubric: defaultRubric, errors: [], loaded: false }; // no file → defaults
  }

  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(raw));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      rubric: defaultRubric,
      errors: [`.limpid/rules.json: invalid JSON (${msg})`],
      loaded: true,
    };
  }

  const parsed = parseUserRules(json);
  const rubric = mergeRubric(defaultRubric, { rules: parsed.rules, patterns: parsed.patterns });
  return { rubric, errors: parsed.errors, loaded: true };
}

const TEMPLATE = `{
  "//": "Limpid user rules. Rules/patterns override the defaults by id, or add new ones.",
  "rules": [
    {
      "id": "my.no-utilize",
      "name": "Avoid 'utilize'",
      "category": "clarity",
      "source": "house style",
      "method": "deterministic",
      "severity": "suggestion",
      "rationale": "'use' is shorter and clearer than 'utilize'.",
      "detector": { "kind": "words", "words": ["utilize", "utilizes", "utilizing"] },
      "examples": [{ "before": "We utilize a buffer.", "after": "We use a buffer." }]
    }
  ],
  "patterns": []
}
`;

/** Command: create (if missing) and open the workspace rules file. */
export async function editRulesCommand(): Promise<void> {
  const uri = rulesUri();
  if (!uri) {
    void vscode.window.showWarningMessage("Limpid: open a folder/workspace first to store rules.");
    return;
  }
  try {
    await vscode.workspace.fs.stat(uri);
  } catch {
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(TEMPLATE));
  }
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc);
}

/** Command: pick a detector-backed rule and run it against the active selection. */
export async function testRuleCommand(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage("Limpid: open a document and select text first.");
    return;
  }
  const sel = editor.selection;
  const text = sel.isEmpty ? editor.document.getText() : editor.document.getText(sel);
  if (!text.trim()) {
    void vscode.window.showWarningMessage("Limpid: nothing to test against.");
    return;
  }

  const { rubric, errors } = await loadRubric();
  if (errors.length) {
    void vscode.window.showWarningMessage(`Limpid rules: ${errors.length} issue(s) — ${errors[0]}`);
  }

  const testable = rubric.rules.filter((r) => r.detector !== undefined);
  if (testable.length === 0) {
    void vscode.window.showInformationMessage("Limpid: no detector-backed rules to test.");
    return;
  }

  const pick = await vscode.window.showQuickPick(
    testable.map((r) => ({ label: r.name, description: r.id, detail: r.rationale, rule: r })),
    { placeHolder: "Pick a rule to run against the selection", matchOnDescription: true },
  );
  if (!pick) return;

  const detector = pick.rule.detector;
  if (!detector) return;
  const matches = runDetector(detector, text);
  if (matches.length === 0) {
    void vscode.window.showInformationMessage(
      `Limpid: "${pick.rule.name}" — no matches in the selection.`,
    );
    return;
  }
  const sample = matches
    .slice(0, 8)
    .map((m) => `“${m.text}”`)
    .join(", ");
  void vscode.window.showInformationMessage(
    `Limpid: "${pick.rule.name}" — ${matches.length} match(es): ${sample}`,
  );
}
