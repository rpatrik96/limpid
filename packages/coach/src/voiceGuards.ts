/**
 * Apply the rubric's voice guards to a finding list.
 *
 * A {@link VoiceGuard} names the ruleIds it `suppresses`. The coach honors the
 * guards AGENTS.md mandates: the author's long-but-clean sentences, em-dash
 * interpolations, colon-payoffs, scope-hedging, and field terms of art must not
 * be hard-penalized. We split the action by guard intent:
 *
 *   - DROP guards (length / structure / terms-of-art): remove a guarded finding
 *     outright unless other evidence proves it genuinely costs the reader.
 *   - DOWN-WEIGHT guards (scope-hedging): keep conviction-hedges, drop or soften
 *     scope-hedges — distinguished by the actual hedge lexeme in the span.
 *
 * The function returns the surviving findings plus a record of what it changed,
 * so the coach can note suppression in `meta.note` and tests can assert it.
 */
import type { Finding, RubricConfig, Severity } from "@coach/contract";

/** Conviction-hedges are a fault even under the scope-hedging guard. */
const CONVICTION_HEDGES = [
  "arguably",
  "it could be argued",
  "one might argue",
  "we believe that",
  "we feel that",
  "presumably",
  "conceivably",
];

/** Scope-hedges mark a claim's reach and are a virtue — down-weight/drop them. */
const SCOPE_HEDGE_MARKERS = [
  "sufficient but not necessary",
  "under mild assumptions",
  "on the benchmarks we tested",
  "to some extent",
  "in some cases",
  "likely",
  "unlikely",
  "may",
  "might",
  "could",
  "possibly",
  "potentially",
];

/** Guards that suppress raw length/structure penalties by dropping the finding. */
const DROP_GUARD_IDS = new Set([
  "guard.clause-stacking-resolves",
  "guard.em-dash-and-colon-payoff",
  "guard.terms-of-art-are-not-zombies",
]);

/** Guards that down-weight rather than drop (keep conviction, soften scope). */
const DOWNWEIGHT_GUARD_IDS = new Set(["guard.scope-hedging-is-a-virtue"]);

const SEVERITY_RANK: Record<Severity, number> = {
  info: 0,
  suggestion: 1,
  warning: 2,
  error: 3,
};
const SEVERITY_BY_RANK: Severity[] = ["info", "suggestion", "warning", "error"];

function downgrade(sev: Severity): Severity {
  const next = Math.max(0, SEVERITY_RANK[sev] - 1);
  return SEVERITY_BY_RANK[next] ?? "info";
}

/** A reasoned `must-be-read-twice` signal lets a DROP guard keep the finding. */
function forcesReread(f: Finding): boolean {
  // The read-twice rule and the argument-flow lens are the explicit "this genuinely
  // costs the reader" signals; a finding carrying them is not merely length-based.
  return (
    f.ruleId === "economist.read-twice" ||
    f.ruleId === "precision.argument-flow" ||
    (f.method === "llm" && f.severity === "error")
  );
}

function findingText(f: Finding): string {
  return `${f.message} ${f.before ?? ""} ${f.suggestion ?? ""}`.toLowerCase();
}

function isConvictionHedge(f: Finding): boolean {
  const text = findingText(f);
  return CONVICTION_HEDGES.some((h) => text.includes(h));
}

function isScopeHedge(f: Finding): boolean {
  const text = findingText(f);
  return SCOPE_HEDGE_MARKERS.some((h) => text.includes(h));
}

export interface GuardResult {
  findings: Finding[];
  /** human-readable record of guard actions, one line each. */
  suppressed: string[];
}

/**
 * Apply every guard in `rubric.voiceGuards` to `findings`.
 *
 * @param lowProseConfidence when true, soften (down-weight) surviving findings
 *        one severity step instead of leaving them at full weight, mirroring the
 *        coach's low-prose-confidence behavior.
 */
export function applyVoiceGuards(
  findings: Finding[],
  rubric: RubricConfig,
  lowProseConfidence = false,
): GuardResult {
  // ruleId → the guard ids that suppress it, partitioned by action.
  const dropRuleIds = new Set<string>();
  const downweightRuleIds = new Set<string>();
  for (const guard of rubric.voiceGuards) {
    const target = DROP_GUARD_IDS.has(guard.id)
      ? dropRuleIds
      : DOWNWEIGHT_GUARD_IDS.has(guard.id)
        ? downweightRuleIds
        : null;
    if (!target) continue;
    for (const id of guard.suppresses) target.add(id);
  }

  const out: Finding[] = [];
  const suppressed: string[] = [];

  for (const f of findings) {
    // ── DROP guards: length / structure / terms-of-art ───────────────────────
    if (dropRuleIds.has(f.ruleId)) {
      if (forcesReread(f)) {
        // Kept: there is independent evidence it genuinely costs the reader.
        out.push(maybeSoften(f, lowProseConfidence));
      } else {
        suppressed.push(`dropped ${f.ruleId} (voice guard: length/structure not penalized)`);
      }
      continue;
    }

    // ── DOWN-WEIGHT guard: scope-hedging ─────────────────────────────────────
    if (downweightRuleIds.has(f.ruleId)) {
      if (isConvictionHedge(f)) {
        // Conviction-hedging stays a fault — keep at full severity.
        out.push(maybeSoften(f, lowProseConfidence));
      } else if (isScopeHedge(f)) {
        // Scope-hedging is a virtue — drop it.
        suppressed.push(`dropped ${f.ruleId} (voice guard: scope-hedging is a virtue)`);
      } else {
        // Ambiguous hedge — keep but down-weight one step.
        suppressed.push(`down-weighted ${f.ruleId} (voice guard: ambiguous hedge)`);
        out.push(maybeSoften({ ...f, severity: downgrade(f.severity), confidence: scaleConfidence(f.confidence) }, lowProseConfidence));
      }
      continue;
    }

    out.push(maybeSoften(f, lowProseConfidence));
  }

  return { findings: out, suppressed };
}

function scaleConfidence(c: number | undefined): number | undefined {
  return c === undefined ? undefined : Math.max(0, c * 0.7);
}

/** Soften a finding one severity step when prose confidence is low. */
function maybeSoften(f: Finding, lowProseConfidence: boolean): Finding {
  if (!lowProseConfidence) return f;
  const next: Finding = { ...f, severity: downgrade(f.severity) };
  if (f.confidence !== undefined) next.confidence = scaleConfidence(f.confidence);
  return next;
}
