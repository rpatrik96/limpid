import { describe, expect, it } from "vitest";

import type { CoachReport, DimensionScore, Finding } from "@coach/contract";

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

function dim(key: DimensionScore["key"], score: number): DimensionScore {
  return { key, score, weight: 0.25 };
}

function report(
  grade: string,
  patterns: string[],
  opts: { dimensions?: DimensionScore[]; section?: string } = {},
): CoachReport {
  return {
    version: "0.1.0",
    target: opts.section ? { section: opts.section } : {},
    extractedText: "",
    metrics: METRICS,
    findings: patterns.map(f),
    dimensions: opts.dimensions ?? [],
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

  it("pulls per-dimension scores and the target section", () => {
    const e = entryFromReport(
      report("B", [], {
        dimensions: [
          dim("accessibility", 7),
          dim("clarity", 8.25),
          dim("flow", 6),
          dim("precision", 9),
        ],
        section: "Introduction",
      }),
      1000,
      "paper.tex",
    );
    expect(e.dims).toEqual({ accessibility: 7, clarity: 8.3, flow: 6, precision: 9 });
    expect(e.section).toBe("Introduction");
  });

  it("defaults missing dimensions to 0 and omits an absent section", () => {
    const e = entryFromReport(report("B", [], { dimensions: [dim("clarity", 8)] }), 1, "a.tex");
    expect(e.dims).toEqual({ accessibility: 0, clarity: 8, flow: 0, precision: 0 });
    expect(e.section).toBeUndefined();
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
      dims: { accessibility: 5, clarity: 6, flow: 7, precision: 8 },
    };
    expect(parseHistory([valid, { nope: true }, 5])).toEqual([valid]);
    expect(parseHistory({})).toEqual([]);
  });

  it("defaults dims for old entries that predate the per-dimension fields", () => {
    const legacy = {
      at: 1,
      file: "a",
      grade: "B",
      patterns: [],
      passiveFraction: 0,
      fk: 0,
      fillerDensity: 0,
    };
    const [parsed] = parseHistory([legacy]);
    expect(parsed?.dims).toEqual({ accessibility: 0, clarity: 0, flow: 0, precision: 0 });
    expect(parsed?.section).toBeUndefined();
  });

  it("coerces a partial dims blob, defaulting only the missing keys, and keeps section", () => {
    const partial = {
      at: 1,
      file: "a",
      grade: "B",
      patterns: [],
      passiveFraction: 0,
      fk: 0,
      fillerDensity: 0,
      dims: { clarity: 9 },
      section: "Methods",
    };
    const [parsed] = parseHistory([partial]);
    expect(parsed?.dims).toEqual({ accessibility: 0, clarity: 9, flow: 0, precision: 0 });
    expect(parsed?.section).toBe("Methods");
  });
});

describe("appendEntry", () => {
  it("caps to the most recent N runs", () => {
    let h: HistoryEntry[] = [];
    for (let i = 0; i < 5; i++) {
      h = appendEntry(
        h,
        {
          at: i,
          file: "a",
          grade: "B",
          patterns: [],
          passiveFraction: 0,
          fk: 0,
          fillerDensity: 0,
          dims: { accessibility: 0, clarity: 0, flow: 0, precision: 0 },
        },
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
      dimensions: [],
      sections: [],
    });
  });

  it("exposes per-dimension averages in canonical order with a recent direction", () => {
    const h = [
      entryFromReport(report("C", [], { dimensions: [dim("clarity", 4), dim("flow", 8)] }), 1, "a"),
      entryFromReport(report("B", [], { dimensions: [dim("clarity", 6), dim("flow", 6)] }), 2, "a"),
    ];
    const s = summarize(h);
    expect(s.dimensions.map((d) => d.key)).toEqual([
      "accessibility",
      "clarity",
      "flow",
      "precision",
    ]);
    const clarity = s.dimensions.find((d) => d.key === "clarity")!;
    expect(clarity.avg).toBe(5); // mean of 4 and 6
    expect(clarity.direction).toBe(1); // 4 → 6 rising
    expect(clarity.recent).toEqual([4, 6]);
    const flow = s.dimensions.find((d) => d.key === "flow")!;
    expect(flow.direction).toBe(-1); // 8 → 6 falling
    // accessibility never scored → averages to 0, flat
    const acc = s.dimensions.find((d) => d.key === "accessibility")!;
    expect(acc.avg).toBe(0);
    expect(acc.direction).toBe(0);
  });

  it("rolls up the latest grade + dims per targeted section, alphabetical", () => {
    const h = [
      entryFromReport(
        report("C", [], { dimensions: [dim("clarity", 4)], section: "Intro" }),
        1,
        "a",
      ),
      entryFromReport(
        report("A", [], { dimensions: [dim("clarity", 9)], section: "Intro" }),
        2,
        "a",
      ),
      entryFromReport(
        report("B", [], { dimensions: [dim("flow", 7)], section: "Abstract" }),
        3,
        "a",
      ),
      entryFromReport(report("F", []), 4, "a"), // no section → excluded
    ];
    const s = summarize(h);
    expect(s.sections.map((r) => r.section)).toEqual(["Abstract", "Intro"]);
    const intro = s.sections.find((r) => r.section === "Intro")!;
    expect(intro.runs).toBe(2);
    expect(intro.latestGrade).toBe("A"); // most recent Intro run
    expect(intro.latestDims.clarity).toBe(9);
  });
});
