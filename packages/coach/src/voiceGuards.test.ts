import { describe, expect, test } from "vitest";
import type { CoachInput, Finding } from "@coach/contract";
import { defaultRubric } from "@coach/rubric";

import { applyVoiceGuards } from "./voiceGuards.js";
import { createCoach, MockLanguageModel } from "./index.js";
import { buildFixture, SAMPLE_TEX } from "./fixtures.js";

const span = (start: number, end: number) => ({ start, end });

function finding(over: Partial<Finding>): Finding {
  return {
    ruleId: "test.rule",
    category: "clarity",
    method: "heuristic",
    severity: "warning",
    message: "x",
    spans: [],
    ...over,
  };
}

describe("applyVoiceGuards — unit", () => {
  test("drops a raw length/structure finding (be-verbs) the guard suppresses", () => {
    const seeded = finding({
      ruleId: "writersdiet.be-verbs",
      message: "Be-verb flab: the estimator is consistent.",
      spans: [span(0, 10)],
    });
    const { findings, suppressed } = applyVoiceGuards([seeded], defaultRubric);
    expect(findings.some((f) => f.ruleId === "writersdiet.be-verbs")).toBe(false);
    expect(suppressed.some((s) => s.includes("writersdiet.be-verbs"))).toBe(true);
  });

  test("keeps a be-verb finding when independent read-twice evidence is present", () => {
    const readTwice = finding({
      ruleId: "economist.read-twice",
      severity: "warning",
      message: "Must be read twice.",
    });
    // read-twice is NOT suppressed; it survives and proves genuine cost.
    const { findings } = applyVoiceGuards([readTwice], defaultRubric);
    expect(findings.some((f) => f.ruleId === "economist.read-twice")).toBe(true);
  });

  test("scope-hedging guard: drops a scope-hedge, keeps a conviction-hedge", () => {
    const scope = finding({
      ruleId: "voice.hedges",
      category: "precision",
      message: "Hedge: the bound holds under mild assumptions.",
    });
    const conviction = finding({
      ruleId: "voice.hedges",
      category: "precision",
      message: "Hedge: arguably the method is better.",
    });
    const { findings } = applyVoiceGuards([scope, conviction], defaultRubric);
    const kept = findings.filter((f) => f.ruleId === "voice.hedges");
    expect(kept).toHaveLength(1);
    expect(kept[0]?.message).toContain("arguably");
  });

  test("nominalization on a term of art is dropped by the terms-of-art guard", () => {
    const seeded = finding({
      ruleId: "writersdiet.nominalizations",
      message: "Nominalization: distribution.",
    });
    const { findings } = applyVoiceGuards([seeded], defaultRubric);
    expect(findings.some((f) => f.ruleId === "writersdiet.nominalizations")).toBe(false);
  });

  test("an unguarded finding passes through untouched", () => {
    const seeded = finding({ ruleId: "orwell.cut-needless-words" });
    const { findings, suppressed } = applyVoiceGuards([seeded], defaultRubric);
    expect(findings).toHaveLength(1);
    expect(suppressed).toHaveLength(0);
  });
});

describe("voice guards — end to end through review", () => {
  test("a seeded guarded finding is suppressed in the final CoachReport", async () => {
    const { extraction, engine } = buildFixture(SAMPLE_TEX);
    const seeded: Finding = {
      ruleId: "writersdiet.prepositions", // suppressed by clause-stacking guard
      category: "flow",
      method: "heuristic",
      severity: "suggestion",
      message: "Prepositional pile-up in a long sentence that reads cleanly.",
      spans: [span(0, 15)],
      confidence: 0.6,
    };
    const engineWithSeed = { ...engine, findings: [...engine.findings, seeded] };
    const input: CoachInput = {
      extraction,
      engine: engineWithSeed,
      rubric: defaultRubric,
      model: new MockLanguageModel(),
    };
    const report = await createCoach().review(input);

    expect(report.findings.some((f) => f.ruleId === "writersdiet.prepositions")).toBe(false);
    expect(report.meta.note).toMatch(/voice guard/i);
  });
});
