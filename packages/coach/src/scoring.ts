/**
 * Deterministic dimension scoring.
 *
 * Maps the engine's mechanical metrics onto four 1..10 dimension scores, then
 * combines them via the rubric's weights into a single 0..10 weighted score and
 * an A+..F grade. Mirrors the intent of `writing-verify.md` Step 4:
 *
 *   Accessibility 20% — FK-vs-section-band + average sentence length.
 *   Clarity       30% — passive fraction + hedge/filler/weak-opener densities.
 *   Flow          20% — sentence-length CV + monotony.
 *   Precision     30% — the LLM verdict when a model is present, else a neutral
 *                       baseline (~6) with a note (set by the coach, not here).
 *
 * Accessibility, Clarity, and Flow are fully deterministic. Precision's
 * deterministic floor here is a neutral baseline; the coach overrides it with
 * the LLM-derived score when a model ran.
 */
import type {
  DimensionKey,
  DimensionScore,
  GradeBand,
  Metrics,
  RubricConfig,
  SectionKind,
  SectionThresholds,
} from "@coach/contract";

/** Neutral precision score used when no LanguageModel is available. */
export const PRECISION_BASELINE = 6;

const clampScore = (x: number): number => {
  if (Number.isNaN(x)) return 1;
  return Math.max(1, Math.min(10, x));
};

const round1 = (x: number): number => Math.round(x * 10) / 10;

/** Linear penalty: 0 inside [lo, hi], growing by `slope` points per unit outside. */
function bandPenalty(value: number, lo: number, hi: number, slope: number): number {
  if (value < lo) return (lo - value) * slope;
  if (value > hi) return (value - hi) * slope;
  return 0;
}

function thresholdFor(
  thresholds: SectionThresholds[],
  section: SectionKind,
): SectionThresholds {
  const hit = thresholds.find((t) => t.section === section);
  if (hit) return hit;
  const fallback = thresholds.find((t) => t.section === "unknown");
  // The rubric guarantees an "unknown" entry; this default only guards types.
  return fallback ?? { section: "unknown", fkGrade: [11, 16], passiveFractionMax: 0.25 };
}

/**
 * Accessibility: how reachable the prose is for the section's intended reader.
 * Penalize FK grade outside the section band and long average sentences.
 */
export function scoreAccessibility(
  metrics: Metrics,
  threshold: SectionThresholds,
): number {
  const [lo, hi] = threshold.fkGrade;
  const fk = metrics.readability.fleschKincaidGrade;
  // ~1 point per grade-level outside the acceptable band.
  const fkPenalty = bandPenalty(fk, lo, hi, 1.0);
  // Average sentence length: comfortable up to ~22 words, then ~0.25/word.
  const avgLen = metrics.readability.avgSentenceLength;
  const lenPenalty = Math.max(0, avgLen - 22) * 0.25;
  return clampScore(10 - fkPenalty - lenPenalty);
}

/**
 * Clarity: mechanical directness. Passive fraction over the section ceiling and
 * hedge / filler / weak-opener densities each erode the score.
 */
export function scoreClarity(
  metrics: Metrics,
  threshold: SectionThresholds,
): number {
  // Passive over the section ceiling: each 10 points over the max ⇒ ~1 point off.
  const passiveOver = Math.max(0, metrics.passiveFraction - threshold.passiveFractionMax);
  const passivePenalty = passiveOver * 10;
  // Hedge / filler densities are per-100-words; ~0.7 point per unit over 0.5.
  const hedgePenalty = Math.max(0, metrics.hedgeDensity - 0.5) * 0.7;
  const fillerPenalty = Math.max(0, metrics.fillerDensity - 0.5) * 0.7;
  // Weak openers: per-instance, normalized by sentence count.
  const sentences = metrics.sentenceStats.count || 1;
  const weakFrac = metrics.weakOpenerCount / sentences;
  const weakPenalty = weakFrac * 6;
  return clampScore(
    10 - passivePenalty - hedgePenalty - fillerPenalty - weakPenalty,
  );
}

/**
 * Flow: sentence rhythm. A low coefficient of variation plus high monotony
 * signals a metronomic cadence; both push the score down.
 */
export function scoreFlow(metrics: Metrics): number {
  const { cv, monotony, count } = metrics.sentenceStats;
  // Too little variation reads as droning; healthy CV is ~0.5+.
  // Single-sentence inputs have no rhythm to judge — stay neutral-high.
  if (count <= 1) return 8;
  const cvPenalty = Math.max(0, 0.5 - cv) * 6; // up to ~3 points for cv→0
  const monotonyPenalty = monotony * 4; // up to 4 points at monotony=1
  return clampScore(10 - cvPenalty - monotonyPenalty);
}

export interface DeterministicScores {
  accessibility: number;
  clarity: number;
  flow: number;
  /** neutral baseline; the coach overrides with the LLM verdict when present. */
  precision: number;
}

/** Compute the three deterministic dimensions plus a neutral precision floor. */
export function computeDeterministicScores(
  metrics: Metrics,
  thresholds: SectionThresholds[],
  section: SectionKind,
): DeterministicScores {
  const threshold = thresholdFor(thresholds, section);
  return {
    accessibility: round1(scoreAccessibility(metrics, threshold)),
    clarity: round1(scoreClarity(metrics, threshold)),
    flow: round1(scoreFlow(metrics)),
    precision: PRECISION_BASELINE,
  };
}

/** Weighted 0..10 score from per-dimension scores and the rubric weights. */
export function weightedScore(dimensions: DimensionScore[]): number {
  let sum = 0;
  let weightTotal = 0;
  for (const d of dimensions) {
    sum += d.score * d.weight;
    weightTotal += d.weight;
  }
  return weightTotal > 0 ? sum / weightTotal : 0;
}

/** Pick the first grade band (scanning high → low `min`) the score clears. */
export function gradeFor(score: number, bands: GradeBand[]): GradeBand {
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  for (const band of sorted) {
    if (score >= band.min) return band;
  }
  // Lowest band is the floor; bands always include an F at min 0.
  const last = sorted[sorted.length - 1];
  return last ?? { grade: "F", min: 0, action: "Not ready for review." };
}

/**
 * Assemble DimensionScore[] from per-dimension numbers, attaching the rubric
 * weight and an optional note to each. Dimensions follow the rubric's order.
 */
export function buildDimensions(
  scores: Record<DimensionKey, number>,
  rubric: RubricConfig,
  notes?: Partial<Record<DimensionKey, string>>,
): DimensionScore[] {
  return rubric.dimensions.map((d) => {
    const note = notes?.[d.key];
    return {
      key: d.key,
      score: round1(clampScore(scores[d.key])),
      weight: d.weight,
      ...(note ? { notes: note } : {}),
    };
  });
}
