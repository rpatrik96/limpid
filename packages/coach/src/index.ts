/**
 * @coach/coach — the LLM judgment layer that assembles a {@link CoachReport}.
 *
 * The coach is the only package that touches a {@link LanguageModel}, and only
 * through the `@coach/contract` interface (no `vscode`, no network, no fs here).
 * It composes the deterministic engine output with a single LLM lens pass:
 *
 *   1. SCORE (always, deterministic): map metrics → DimensionScore[] (1..10) for
 *      accessibility / clarity / flow, plus a precision baseline.
 *   2. LENSES (only with a model): one JSON call covering Gopen–Swan stress/topic
 *      placement, old→new cohesion, audience altitude, and argument flow, plus
 *      named-pattern diagnosis. Validate; on malformed output retry once, then
 *      skip LLM findings and note it.
 *   3. PRECISION: fold the LLM verdict into the precision score (else baseline).
 *   4. VOICE GUARDS: drop/down-weight findings the rubric's guards protect.
 *   5. GRADE: weighted score → A+..F via rubric.gradeBands.
 *   6. DELTA: when `previous` is supplied, fill GradeDelta.
 *
 * Robustness: no model ⇒ meta.deterministicOnly, altitude undefined, precision
 * baseline. Low extraction.proseRatio (< 0.45) ⇒ meta.lowProseConfidence and
 * softened severities.
 */
import type {
  Coach,
  CoachInput,
  CoachReport,
  DimensionKey,
  DimensionScore,
  Finding,
  GradeDelta,
  LanguageModel,
  Metrics,
  RubricConfig,
  SectionKind,
} from "@coach/contract";
import { CONTRACT_VERSION } from "@coach/contract";

import {
  buildDimensions,
  computeDeterministicScores,
  gradeFor,
  PRECISION_BASELINE,
  weightedScore,
} from "./scoring.js";
import { buildLensRequest } from "./prompts.js";
import { parseLensResult, type LensResult } from "./lenses.js";
import { lensResultToFindings } from "./findings.js";
import { applyVoiceGuards } from "./voiceGuards.js";

export { MockLanguageModel, defaultLensResult } from "./mock.js";
export type { MockLanguageModelOptions } from "./mock.js";
export {
  computeDeterministicScores,
  buildDimensions,
  weightedScore,
  gradeFor,
  scoreAccessibility,
  scoreClarity,
  scoreFlow,
  PRECISION_BASELINE,
} from "./scoring.js";
export { buildLensRequest } from "./prompts.js";
export { applyVoiceGuards } from "./voiceGuards.js";
export {
  parseLensResult,
  extractJson,
  coerceSeverity,
  coerceSpans,
} from "./lenses.js";
export type { LensResult, LensFinding, LensAltitude, LensPatternHit } from "./lenses.js";
export { lensResultToFindings } from "./findings.js";

/** Below this prose ratio, extraction confidence is low — soften the report. */
const LOW_PROSE_RATIO = 0.45;

/** Pick the dominant section kind for threshold + altitude framing. */
function dominantSection(input: CoachInput): SectionKind {
  const sections = input.extraction.sections;
  if (sections.length === 0) return "unknown";
  // Longest section by text range wins; ties fall back to the first.
  let best = sections[0]!;
  let bestLen = best.range.end - best.range.start;
  for (const s of sections) {
    const len = s.range.end - s.range.start;
    if (len > bestLen) {
      best = s;
      bestLen = len;
    }
  }
  return best.kind;
}

/** Run the single LLM lens pass with one retry, then degrade to null. */
async function runLenses(
  model: LanguageModel,
  request: ReturnType<typeof buildLensRequest>,
): Promise<{ result: LensResult | null; note?: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let response;
    try {
      response = await model.complete(request);
    } catch (err) {
      if (attempt === 1) {
        return {
          result: null,
          note: `LLM call failed (${describe(err)}); fell back to deterministic-only findings.`,
        };
      }
      continue;
    }
    const parsed = parseLensResult(response.text);
    if (parsed) return { result: parsed };
    // Malformed: retry once, then give up.
    if (attempt === 1) {
      return {
        result: null,
        note: "LLM returned malformed JSON twice; skipped LLM findings.",
      };
    }
  }
  return { result: null, note: "LLM produced no usable output." };
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Resolve the precision score: LLM verdict when present, else baseline. */
function precisionScore(result: LensResult | null): number {
  if (!result) return PRECISION_BASELINE;
  return Math.max(1, Math.min(10, result.precisionScore));
}

/** Build the GradeDelta against a previous report. */
function buildDelta(
  previous: CoachReport,
  dimensions: DimensionScore[],
  metrics: Metrics,
): GradeDelta {
  const changed: Record<string, { from: number; to: number }> = {};

  // Dimension score deltas.
  const prevByKey = new Map<DimensionKey, number>(
    previous.dimensions.map((d) => [d.key, d.score]),
  );
  for (const d of dimensions) {
    const from = prevByKey.get(d.key);
    if (from !== undefined && from !== d.score) {
      changed[d.key] = { from, to: d.score };
    }
  }

  // A few headline metric deltas (the ones the report cards on).
  const metricPairs: [string, number, number][] = [
    ["fleschKincaidGrade", previous.metrics.readability.fleschKincaidGrade, metrics.readability.fleschKincaidGrade],
    ["passiveFraction", previous.metrics.passiveFraction, metrics.passiveFraction],
    ["hedgeDensity", previous.metrics.hedgeDensity, metrics.hedgeDensity],
    ["fillerDensity", previous.metrics.fillerDensity, metrics.fillerDensity],
    ["monotony", previous.metrics.sentenceStats.monotony, metrics.sentenceStats.monotony],
  ];
  for (const [key, from, to] of metricPairs) {
    if (round2(from) !== round2(to)) changed[key] = { from: round2(from), to: round2(to) };
  }

  return {
    ...(previous.grade ? { previousGrade: previous.grade } : {}),
    ...(Object.keys(changed).length > 0 ? { changed } : {}),
  };
}

const round2 = (x: number): number => Math.round(x * 100) / 100;

class CoachImpl implements Coach {
  async review(input: CoachInput): Promise<CoachReport> {
    const { extraction, engine, rubric } = input;
    const text = extraction.text;
    const metrics = engine.metrics;
    const section = dominantSection(input);
    const lowProseConfidence = extraction.proseRatio < LOW_PROSE_RATIO;

    // ── 1. Deterministic dimension scores ───────────────────────────────────
    const det = computeDeterministicScores(metrics, rubric.thresholds, section);

    // ── 2. LLM lenses (only when a model is present) ─────────────────────────
    let lensResult: LensResult | null = null;
    let lensFindings: Finding[] = [];
    let metaNote: string | undefined;
    const deterministicOnly = input.model === undefined;

    if (input.model) {
      const request = buildLensRequest({
        text,
        engine,
        patterns: rubric.patterns,
        ...(input.audience !== undefined ? { audience: input.audience } : {}),
        lowProseConfidence,
      });
      const { result, note } = await runLenses(input.model, request);
      lensResult = result;
      if (note) metaNote = note;
      if (result) {
        lensFindings = lensResultToFindings(result, rubric.patterns, text.length);
      }
    } else {
      metaNote = "No language model supplied — precision uses a neutral baseline; altitude omitted.";
    }

    // ── 3. Precision score ──────────────────────────────────────────────────
    const precision = precisionScore(lensResult);

    // ── 4. Voice guards over the COMBINED finding set ────────────────────────
    const combined: Finding[] = [...engine.findings, ...lensFindings];
    const guarded = applyVoiceGuards(combined, rubric, lowProseConfidence);
    if (guarded.suppressed.length > 0) {
      const guardNote = `${guarded.suppressed.length} finding(s) adjusted by voice guards.`;
      metaNote = metaNote ? `${metaNote} ${guardNote}` : guardNote;
    }

    // ── 5. Dimensions + grade ───────────────────────────────────────────────
    const scores: Record<DimensionKey, number> = {
      accessibility: det.accessibility,
      clarity: det.clarity,
      flow: det.flow,
      precision,
    };
    const notes: Partial<Record<DimensionKey, string>> = {};
    if (deterministicOnly) {
      notes.precision = "Neutral baseline — no LLM verdict (deterministic-only run).";
    } else if (lensResult) {
      notes.precision = "LLM verdict on buried ledes, claim–evidence, and transitions.";
    } else {
      notes.precision = "LLM unavailable for this run — neutral baseline.";
    }
    const dimensions = buildDimensions(scores, rubric, notes);
    const score = weightedScore(dimensions);
    const grade = gradeFor(score, rubric.gradeBands).grade;

    // ── 6. Delta ────────────────────────────────────────────────────────────
    const delta = input.previous
      ? buildDelta(input.previous, dimensions, metrics)
      : undefined;

    // ── Altitude (only when the LLM ran) ─────────────────────────────────────
    const altitude = lensResult
      ? {
          assumedAudience: lensResult.altitude.assumedAudience,
          inferred: input.audience !== undefined ? false : lensResult.altitude.inferred,
          verdict: lensResult.altitude.verdict,
          ...(lensResult.altitude.signals ? { signals: lensResult.altitude.signals } : {}),
        }
      : undefined;

    const report: CoachReport = {
      version: CONTRACT_VERSION,
      target: {
        ...(section !== "unknown" ? { section } : {}),
        ...(input.audience !== undefined ? { audience: input.audience } : {}),
      },
      extractedText: text,
      metrics,
      findings: guarded.findings,
      dimensions,
      grade,
      ...(altitude ? { altitude } : {}),
      ...(delta ? { delta } : {}),
      meta: {
        deterministicOnly,
        lowProseConfidence,
        ...(metaNote ? { note: metaNote } : {}),
      },
    };
    return report;
  }
}

/** Construct a coach. Stateless — safe to reuse across reviews. */
export function createCoach(): Coach {
  return new CoachImpl();
}
