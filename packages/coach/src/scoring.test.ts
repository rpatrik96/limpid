import { describe, expect, test } from "vitest";
import type { DimensionScore, Metrics, SectionThresholds } from "@coach/contract";
import { defaultRubric } from "@coach/rubric";

import {
  buildDimensions,
  computeDeterministicScores,
  gradeFor,
  scoreAccessibility,
  scoreClarity,
  scoreFlow,
  weightedScore,
  PRECISION_BASELINE,
} from "./scoring.js";

function metrics(over: Partial<Metrics> = {}): Metrics {
  const base: Metrics = {
    wordCount: 100,
    sentenceStats: {
      count: 6,
      meanWords: 18,
      stdWords: 9,
      cv: 0.5,
      longCount: 0,
      veryLongCount: 0,
      buckets: { short: 2, medium: 3, long: 1 },
      monotony: 0.2,
    },
    readability: {
      fleschKincaidGrade: 13,
      fleschReadingEase: 45,
      avgSentenceLength: 18,
      avgSyllablesPerWord: 1.6,
    },
    fillerDensity: 0,
    hedgeDensity: 0,
    boosterDensity: 0,
    adverbDensity: 0,
    passiveFraction: 0.1,
    weakOpenerCount: 0,
    undefinedAcronyms: [],
  };
  return {
    ...base,
    ...over,
    sentenceStats: { ...base.sentenceStats, ...(over.sentenceStats ?? {}) },
    readability: { ...base.readability, ...(over.readability ?? {}) },
  };
}

const introThreshold: SectionThresholds = defaultRubric.thresholds.find(
  (t) => t.section === "introduction",
)!;

describe("scoreAccessibility", () => {
  test("clean prose inside the band scores near 10", () => {
    const s = scoreAccessibility(metrics(), introThreshold);
    expect(s).toBeGreaterThanOrEqual(9);
  });

  test("FK well above the band penalizes the score", () => {
    const high = scoreAccessibility(
      metrics({ readability: { fleschKincaidGrade: 24 } as Metrics["readability"] }),
      introThreshold,
    );
    expect(high).toBeLessThan(6);
  });

  test("long average sentences penalize accessibility", () => {
    const s = scoreAccessibility(
      metrics({ readability: { avgSentenceLength: 40 } as Metrics["readability"] }),
      introThreshold,
    );
    expect(s).toBeLessThan(9);
  });
});

describe("scoreClarity", () => {
  test("passive over the section ceiling lowers clarity", () => {
    const clean = scoreClarity(metrics({ passiveFraction: 0.1 }), introThreshold);
    const passive = scoreClarity(metrics({ passiveFraction: 0.6 }), introThreshold);
    expect(passive).toBeLessThan(clean);
  });

  test("hedge + filler densities lower clarity", () => {
    const noisy = scoreClarity(metrics({ hedgeDensity: 4, fillerDensity: 5 }), introThreshold);
    expect(noisy).toBeLessThan(8);
  });
});

describe("scoreFlow", () => {
  test("monotone rhythm (low cv, high monotony) tanks flow", () => {
    const mono = scoreFlow(
      metrics({
        sentenceStats: { cv: 0.05, monotony: 1, count: 5 } as Metrics["sentenceStats"],
      }),
    );
    expect(mono).toBeLessThan(5);
  });

  test("single-sentence input stays neutral-high", () => {
    const one = scoreFlow(metrics({ sentenceStats: { count: 1 } as Metrics["sentenceStats"] }));
    expect(one).toBe(8);
  });
});

describe("computeDeterministicScores", () => {
  test("precision is the neutral baseline", () => {
    const det = computeDeterministicScores(metrics(), defaultRubric.thresholds, "introduction");
    expect(det.precision).toBe(PRECISION_BASELINE);
  });

  test("unknown section falls back to the unknown threshold", () => {
    const det = computeDeterministicScores(metrics(), defaultRubric.thresholds, "unknown");
    expect(det.accessibility).toBeGreaterThan(0);
  });
});

describe("weightedScore + gradeFor", () => {
  test("all-10 dimensions earn A+", () => {
    const dims: DimensionScore[] = defaultRubric.dimensions.map((d) => ({
      key: d.key,
      score: 10,
      weight: d.weight,
    }));
    const score = weightedScore(dims);
    expect(score).toBeCloseTo(10, 6);
    expect(gradeFor(score, defaultRubric.gradeBands).grade).toBe("A+");
  });

  test("all-1 dimensions earn F", () => {
    const dims: DimensionScore[] = defaultRubric.dimensions.map((d) => ({
      key: d.key,
      score: 1,
      weight: d.weight,
    }));
    const score = weightedScore(dims);
    expect(gradeFor(score, defaultRubric.gradeBands).grade).toBe("F");
  });

  test("weighted score respects the rubric weights", () => {
    // precision (0.3) and clarity (0.3) high, accessibility (0.2) and flow (0.2) low.
    const dims = buildDimensions(
      { accessibility: 4, clarity: 8, flow: 4, precision: 8 },
      defaultRubric,
    );
    const score = weightedScore(dims);
    // 0.2*4 + 0.3*8 + 0.2*4 + 0.3*8 = 0.8+2.4+0.8+2.4 = 6.4
    expect(score).toBeCloseTo(6.4, 6);
  });
});

describe("buildDimensions", () => {
  test("attaches weights and clamps scores to 1..10", () => {
    const dims = buildDimensions(
      { accessibility: 12, clarity: -3, flow: 5, precision: 7 },
      defaultRubric,
    );
    const byKey = Object.fromEntries(dims.map((d) => [d.key, d]));
    expect(byKey.accessibility?.score).toBe(10);
    expect(byKey.clarity?.score).toBe(1);
    expect(dims.reduce((a, d) => a + d.weight, 0)).toBeCloseTo(1, 6);
  });
});
