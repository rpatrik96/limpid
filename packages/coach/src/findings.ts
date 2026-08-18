/**
 * Convert validated LLM lens output into contract {@link Finding}s.
 *
 * Every LLM finding carries `method: "llm"`, a category drawn from the lens it
 * came from (precision / clarity / flow), the teaching `why`, optional
 * before/after rewrites, and a `source` naming the lens's grounding (Gopen &
 * Swan, the rubric pattern). Spans are clamped to the analyzed
 * text length so the panel never highlights out of bounds.
 */
import type { DiagnosisPattern, DimensionKey, Finding, Severity } from "@coach/contract";

import {
  coerceSeverity,
  coerceSpans,
  type LensFinding,
  type LensPatternHit,
  type LensResult,
} from "./lenses.js";

interface LensSpec {
  ruleId: string;
  category: DimensionKey;
  defaultSeverity: Severity;
  source: string;
  /** default teaching note when the model omits a `why`. */
  why: string;
}

const STRESS_TOPIC: LensSpec = {
  ruleId: "gopen.stress-position",
  category: "flow",
  defaultSeverity: "suggestion",
  source: "Gopen & Swan, The Science of Scientific Writing (1990)",
  why: "The end of a sentence is its stress position; new, important material belongs there, and known material belongs at the start.",
};

const COHESION: LensSpec = {
  ruleId: "gopen.old-before-new",
  category: "flow",
  defaultSeverity: "suggestion",
  source: "Gopen & Swan, The Science of Scientific Writing (1990)",
  why: "Each paragraph should open with information the reader already has before introducing new material; breaking the thread forces a context reset.",
};

const ARGUMENT_FLOW: LensSpec = {
  ruleId: "precision.argument-flow",
  category: "precision",
  defaultSeverity: "warning",
  source: "Gopen & Swan, stress position (lead with the point); writing-verify.md claim–evidence",
  why: "Readers use the first sentence as the frame for the paragraph; a buried lede or unsupported claim forces a re-read and erodes trust.",
};

function lensFindingToFinding(lf: LensFinding, spec: LensSpec, textLength: number): Finding {
  const finding: Finding = {
    ruleId: spec.ruleId,
    category: spec.category,
    method: "llm",
    severity: coerceSeverity(lf.severity, spec.defaultSeverity),
    message: lf.message,
    why: lf.why ?? spec.why,
    spans: coerceSpans(lf.spans, textLength),
    source: spec.source,
    confidence: 0.7,
  };
  if (lf.suggestion) finding.suggestion = lf.suggestion;
  if (lf.before) finding.before = lf.before;
  if (lf.after) finding.after = lf.after;
  return finding;
}

function patternHitToFinding(
  hit: LensPatternHit,
  pattern: DiagnosisPattern,
  textLength: number,
): Finding {
  // Map remediation priority (from writing-diagnosis.md) onto a default severity.
  const blockers = new Set(["idea-soup", "cognitive-overload", "jargon-cliff"]);
  const flow = new Set(["buried-lede", "orphan-transition", "scale-mismatch"]);
  const defaultSeverity: Severity = blockers.has(pattern.id)
    ? "warning"
    : flow.has(pattern.id)
      ? "warning"
      : "suggestion";

  const category: DimensionKey =
    blockers.has(pattern.id) && pattern.id !== "cognitive-overload"
      ? "accessibility"
      : flow.has(pattern.id)
        ? "flow"
        : pattern.id === "zombie-sentence"
          ? "clarity"
          : "precision";

  const finding: Finding = {
    ruleId: `pattern.${pattern.id}`,
    patternName: pattern.name,
    category,
    method: "llm",
    severity: coerceSeverity(hit.severity, defaultSeverity),
    message: hit.evidence ? `${pattern.name}: ${hit.evidence}` : pattern.name,
    why: pattern.whyItFails,
    suggestion: pattern.howToSpot,
    spans: coerceSpans(hit.spans, textLength),
    source: "writing-diagnosis.md — Pattern Library",
    confidence: 0.65,
  };
  if (hit.before) finding.before = hit.before;
  else finding.before = pattern.example.before;
  if (hit.after) finding.after = hit.after;
  else finding.after = pattern.example.after;
  return finding;
}

/**
 * Flatten a validated {@link LensResult} into contract findings. Unknown
 * pattern ids (not in `patterns`) are dropped — the model may hallucinate an id.
 */
export function lensResultToFindings(
  result: LensResult,
  patterns: DiagnosisPattern[],
  textLength: number,
): Finding[] {
  const byId = new Map(patterns.map((p) => [p.id, p]));
  const out: Finding[] = [];

  for (const lf of result.stressTopic) {
    out.push(lensFindingToFinding(lf, STRESS_TOPIC, textLength));
  }
  for (const lf of result.cohesion) {
    out.push(lensFindingToFinding(lf, COHESION, textLength));
  }
  for (const lf of result.argumentFlow) {
    out.push(lensFindingToFinding(lf, ARGUMENT_FLOW, textLength));
  }
  for (const hit of result.patterns) {
    const pattern = byId.get(hit.id);
    if (!pattern) continue; // drop hallucinated ids
    out.push(patternHitToFinding(hit, pattern, textLength));
  }
  return out;
}
