import type { SectionThresholds } from "@coach/contract";

/**
 * Section-specific Flesch–Kincaid grade bands and passive-fraction ceilings.
 *
 * Grounded in `editorial-brain.md` (section-specific FK / passive targets) and
 * `writing_verify.py`'s SECTION_THRESHOLDS. The principle: a methods section or
 * a proof may run denser and more passive than an abstract, because the actor
 * genuinely recedes and formal definitions need longer sentences. The abstract
 * is the strictest — it must reach any ML researcher.
 *
 * fkGrade is an [low, high] acceptable band; passiveFractionMax is a fraction
 * (0..1) of sentences, matching Metrics.passiveFraction.
 *
 * Every member of contract's SectionKind union has an entry here (the rubric
 * test asserts coverage). `caption` is not in the task's spec table; it inherits
 * the abstract's strict band, since a figure caption must stand alone for a
 * reader skimming the paper.
 */
export const thresholds: SectionThresholds[] = [
  { section: "abstract", fkGrade: [10, 14], passiveFractionMax: 0.15 },
  { section: "introduction", fkGrade: [11, 16], passiveFractionMax: 0.2 },
  { section: "related", fkGrade: [11, 16], passiveFractionMax: 0.2 },
  { section: "methods", fkGrade: [12, 18], passiveFractionMax: 0.35 },
  { section: "results", fkGrade: [11, 17], passiveFractionMax: 0.3 },
  { section: "discussion", fkGrade: [11, 16], passiveFractionMax: 0.25 },
  { section: "proof", fkGrade: [12, 18], passiveFractionMax: 0.35 },
  { section: "caption", fkGrade: [10, 14], passiveFractionMax: 0.15 },
  { section: "unknown", fkGrade: [11, 16], passiveFractionMax: 0.25 },
];
