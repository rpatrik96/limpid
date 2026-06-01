import { describe, expect, it } from "vitest";

import type { CoachReport, Finding } from "@coach/contract";

import {
  appendEntry,
  entryFromReport,
  parseHistory,
  summarize,
  type HistoryEntry,
} from "./index.js";

const METRICS = {
  wordCount: 100,
  sentenceStats: {
    count: 5,
    meanWords: 20,
    stdWords: 5,
    cv: 0.25,
    longCount: 1,
    veryLongCount: 0,
    buckets: { short: 1, medium: 3, long: 1 },
    monotony: 0.3,
  },
  readability: {
    fleschKincaidGrade: 14,
    fleschReadingEase: 30,
    avgSentenceLength: 25,
    avgSyllablesPerWord: 1.8,
  },
  fillerDensity: 3,
  hedgeDensity: 1,
  boosterDensity: 0,
  adverbDensity: 1,
  passiveFraction: 0.4,
  weakOpenerCount: 1,
  undefinedAcronyms: [],
} satisfies CoachReport["metrics"];

function f(patternName?: string): Finding {
  return {
    ruleId: "r",
    category: "precision",
    method: "llm",
    severity: "warning",
    message: "m",
    spans: [],
    ...(patternName ? { patternName } : {}),
  };
}

function report(grade: string, patterns: string[]): CoachReport {
  return {
    version: "0.1.0",
    target: {},
    extractedText: "",
    metrics: METRICS,
    findings: patterns.map(f),
    dimensions: [],
    grade,
    meta: { deterministicOnly: false, lowProseConfidence: false },
  };
}

describe("entryFromReport", () => {
  it("pulls grade, pattern names, and rounded metrics", () => {
    const e = entryFromReport(report("B+", ["Buried Lede", "Hedge Stacking"]), 1000, "paper.tex");
    expect(e).toMatchObject({
      at: 1000,
      file: "paper.tex",
      grade: "B+",
      patterns: ["Buried Lede", "Hedge Stacking"],
      passiveFraction: 0.4,
      fk: 14,
      fillerDensity: 3,
    });
  });
});

describe("parseHistory", () => {
  it("keeps valid entries, drops malformed, tolerates non-arrays", () => {
    const valid: HistoryEntry = {
      at: 1,
      file: "a",
      grade: "B",
      patterns: [],
      passiveFraction: 0,
      fk: 0,
      fillerDensity: 0,
    };
    expect(parseHistory([valid, { nope: true }, 5])).toEqual([valid]);
    expect(parseHistory({})).toEqual([]);
  });
});

describe("appendEntry", () => {
  it("caps to the most recent N runs", () => {
    let h: HistoryEntry[] = [];
    for (let i = 0; i < 5; i++) {
      h = appendEntry(
        h,
        { at: i, file: "a", grade: "B", patterns: [], passiveFraction: 0, fk: 0, fillerDensity: 0 },
        3,
      );
    }
    expect(h.map((e) => e.at)).toEqual([2, 3, 4]);
  });
});

describe("summarize", () => {
  it("ranks recurring patterns, tracks recent grades + averages", () => {
    const h = [
      entryFromReport(report("C", ["Buried Lede", "Hedge Stacking"]), 1, "a.tex"),
      entryFromReport(report("B", ["Buried Lede"]), 2, "b.tex"),
    ];
    const s = summarize(h);
    expect(s.runs).toBe(2);
    expect(s.files).toBe(2);
    expect(s.latestGrade).toBe("B");
    expect(s.topPatterns[0]).toEqual({ name: "Buried Lede", count: 2 });
    expect(s.recentGrades.map((g) => g.grade)).toEqual(["C", "B"]);
    expect(s.avg?.passiveFraction).toBe(0.4);
  });

  it("handles empty history", () => {
    expect(summarize([])).toMatchObject({
      runs: 0,
      files: 0,
      latestGrade: null,
      topPatterns: [],
      avg: null,
    });
  });
});
