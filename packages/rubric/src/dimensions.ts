import type { DimensionKey } from "@coach/contract";

/**
 * The four scored dimensions and their weights. Weights MUST sum to 1.
 *
 * Mirrors `writing-verify.md` (the source rubric):
 *   Accessibility 20% · Clarity 30% · Flow 20% · Precision 30%.
 *
 * Accessibility + Flow are the deterministic, script-measurable halves
 * (readability grade, sentence rhythm). Clarity is mostly mechanical
 * (passive, hedges, fillers, weak openers) with an LLM tail. Precision is
 * the LLM-only half (buried ledes, claim–evidence, terminology, transitions),
 * which is why Clarity and Precision carry the heavier 30% weights.
 */
export const dimensions: { key: DimensionKey; weight: number }[] = [
  { key: "accessibility", weight: 0.2 },
  { key: "clarity", weight: 0.3 },
  { key: "flow", weight: 0.2 },
  { key: "precision", weight: 0.3 },
];
