/**
 * The LLM-lens eval harness. Drives the real coach pipeline (extract → analyze →
 * review) for each golden case against a given {@link LanguageModel}, checks the
 * coarse expectations, and reports a pass rate. Use it with the mock (mechanics,
 * CI-safe) or any real provider via `npm run eval`.
 */
import type { CoachReport, LanguageModel, RubricConfig } from "@coach/contract";
import { extract } from "@coach/latex";
import { analyze } from "@coach/engine";
import { defaultRubric } from "@coach/rubric";

import { createCoach } from "../index.js";
import type { EvalCase, EvalExpectation } from "./cases.js";

export interface EvalCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface EvalCaseResult {
  id: string;
  passed: boolean;
  grade: string;
  checks: EvalCheck[];
}

export interface EvalReport {
  results: EvalCaseResult[];
  passed: number;
  total: number;
  passRate: number;
}

/** Check a report against an expectation. Exported so it is unit-testable. */
export function evaluateExpectations(report: CoachReport, expect: EvalExpectation): EvalCheck[] {
  const checks: EvalCheck[] = [];

  if (expect.expectPattern !== undefined) {
    const needle = expect.expectPattern.toLowerCase();
    const ok = report.findings.some((f) => (f.patternName ?? "").toLowerCase().includes(needle));
    checks.push({ name: `pattern~"${expect.expectPattern}"`, ok, detail: ok ? "found" : "missing" });
  }

  if (expect.altitudeMentions !== undefined) {
    const needle = expect.altitudeMentions.toLowerCase();
    const hay = `${report.altitude?.verdict ?? ""} ${report.altitude?.assumedAudience ?? ""}`.toLowerCase();
    checks.push({
      name: `altitude~"${expect.altitudeMentions}"`,
      ok: hay.includes(needle),
      detail: report.altitude?.verdict ?? "(no altitude)",
    });
  }

  if (expect.minLlmFindings !== undefined) {
    const n = report.findings.filter((f) => f.method === "llm").length;
    checks.push({ name: `llmFindings>=${expect.minLlmFindings}`, ok: n >= expect.minLlmFindings, detail: String(n) });
  }

  if (expect.gradeIn !== undefined) {
    checks.push({
      name: `grade in [${expect.gradeIn.join(",")}]`,
      ok: expect.gradeIn.includes(report.grade),
      detail: report.grade,
    });
  }

  return checks;
}

/** Run a single case through the coach. */
export async function reviewCase(
  model: LanguageModel,
  c: EvalCase,
  rubric: RubricConfig = defaultRubric,
): Promise<CoachReport> {
  const extraction = extract(c.text);
  const engine = analyze(extraction.text);
  return createCoach().review({
    extraction,
    engine,
    rubric,
    model,
    ...(c.audience !== undefined ? { audience: c.audience } : {}),
  });
}

/** Run all cases and aggregate a pass rate. */
export async function runEval(
  model: LanguageModel,
  cases: EvalCase[],
  rubric: RubricConfig = defaultRubric,
): Promise<EvalReport> {
  const results: EvalCaseResult[] = [];
  for (const c of cases) {
    const report = await reviewCase(model, c, rubric);
    const checks = evaluateExpectations(report, c.expect);
    results.push({ id: c.id, passed: checks.every((k) => k.ok), grade: report.grade, checks });
  }
  const passed = results.filter((r) => r.passed).length;
  return { results, passed, total: results.length, passRate: results.length ? passed / results.length : 0 };
}

/** One line per case, plus a summary — for console output during `npm run eval`. */
export function formatEvalReport(report: EvalReport): string {
  const lines = report.results.map((r) => {
    const mark = r.passed ? "PASS" : "FAIL";
    const failed = r.checks.filter((k) => !k.ok).map((k) => `${k.name}(${k.detail})`);
    const tail = failed.length ? ` — ${failed.join(", ")}` : "";
    return `[${mark}] ${r.id} (${r.grade})${tail}`;
  });
  lines.push("");
  lines.push(`${report.passed}/${report.total} passed (${Math.round(report.passRate * 100)}%)`);
  return lines.join("\n");
}
