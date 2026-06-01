import { describe, expect, it } from "vitest";

import type { HistorySummary } from "@coach/history";
import { defaultRubric } from "@coach/rubric";

import { renderLearn } from "./renderLearn.js";

const empty: HistorySummary = {
  runs: 0,
  files: 0,
  latestGrade: null,
  topPatterns: [],
  recentGrades: [],
  avg: null,
};

const populated: HistorySummary = {
  runs: 3,
  files: 2,
  latestGrade: "B+",
  topPatterns: [
    { name: "Buried Lede", count: 5 },
    { name: "Hedge Stacking", count: 2 },
  ],
  recentGrades: [
    { at: 1, grade: "C" },
    { at: 2, grade: "B" },
    { at: 3, grade: "B+" },
  ],
  avg: { passiveFraction: 0.3, fk: 13, fillerDensity: 2 },
};

describe("renderLearn", () => {
  it("lists the pattern library (every rubric pattern by name)", () => {
    const html = renderLearn(defaultRubric.patterns, empty);
    expect(html).toContain("Pattern library");
    for (const p of defaultRubric.patterns) expect(html).toContain(p.name);
  });

  it("shows an empty-state hint when there are no runs", () => {
    expect(renderLearn(defaultRubric.patterns, empty)).toContain("Coach some writing");
  });

  it("surfaces recurring patterns, counts, and recent grades when populated", () => {
    const html = renderLearn(defaultRubric.patterns, populated);
    expect(html).toContain("Buried Lede");
    expect(html).toContain("5×");
    expect(html).toContain("latest grade");
    expect(html).toContain("grade-chip");
  });

  it("themes text to the VS Code foreground (legible on dark themes)", () => {
    expect(renderLearn(defaultRubric.patterns, empty)).toContain("color: var(--vscode-foreground");
  });

  it("embeds a CSP nonce when supplied", () => {
    const html = renderLearn(defaultRubric.patterns, empty, { nonce: "N9" });
    expect(html).toContain("nonce-N9");
    expect(html).toContain('<style nonce="N9">');
  });
});
