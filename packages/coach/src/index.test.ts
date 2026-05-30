import { describe, expect, test } from "vitest";
import type { CoachInput, CoachReport, Finding } from "@coach/contract";
import { defaultRubric } from "@coach/rubric";

import { createCoach, MockLanguageModel, defaultLensResult } from "./index.js";
import { buildFixture, SAMPLE_TEX, MATH_HEAVY_TEX } from "./fixtures.js";

function baseInput(overrides: Partial<CoachInput> = {}): CoachInput {
  const { extraction, engine } = buildFixture(SAMPLE_TEX);
  return { extraction, engine, rubric: defaultRubric, ...overrides };
}

const GRADES = new Set(defaultRubric.gradeBands.map((b) => b.grade));

describe("createCoach / review — LLM path", () => {
  test("produces a well-formed CoachReport with a computed grade", async () => {
    const model = new MockLanguageModel(); // canned valid lens JSON
    const report = await createCoach().review(baseInput({ model }));

    // Shape: every contract field present and typed.
    expect(report.version).toBe("0.1.0");
    expect(report.extractedText).toBe(baseInput().extraction.text);
    expect(report.metrics.wordCount).toBeGreaterThan(0);
    expect(Array.isArray(report.findings)).toBe(true);

    // Grade computed from a real band.
    expect(GRADES.has(report.grade)).toBe(true);

    // Four dimensions, weights summing to 1, scores in 1..10.
    expect(report.dimensions).toHaveLength(4);
    const weightSum = report.dimensions.reduce((a, d) => a + d.weight, 0);
    expect(weightSum).toBeCloseTo(1, 6);
    for (const d of report.dimensions) {
      expect(d.score).toBeGreaterThanOrEqual(1);
      expect(d.score).toBeLessThanOrEqual(10);
    }

    expect(report.meta.deterministicOnly).toBe(false);
    expect(report.meta.lowProseConfidence).toBe(false);
  });

  test("sets altitude from the LLM lens (inferred when no audience given)", async () => {
    const model = new MockLanguageModel();
    const report = await createCoach().review(baseInput({ model }));

    expect(report.altitude).toBeDefined();
    expect(report.altitude?.assumedAudience).toContain("ML researcher");
    expect(report.altitude?.inferred).toBe(true);
    expect(report.altitude?.verdict).toBeTruthy();
    expect(report.altitude?.signals?.length).toBeGreaterThan(0);
  });

  test("altitude.inferred is false when the user supplies an audience", async () => {
    const model = new MockLanguageModel();
    const report = await createCoach().review(
      baseInput({ model, audience: "a first-year PhD student" }),
    );
    expect(report.altitude?.inferred).toBe(false);
    expect(report.target.audience).toBe("a first-year PhD student");
  });

  test("emits LLM findings (method=llm) for the four lenses and patterns", async () => {
    const model = new MockLanguageModel();
    const report = await createCoach().review(baseInput({ model }));

    const llm = report.findings.filter((f) => f.method === "llm");
    expect(llm.length).toBeGreaterThan(0);

    // Stress/topic + cohesion → flow; argument-flow → precision; pattern → buried-lede.
    const ruleIds = new Set(llm.map((f) => f.ruleId));
    expect(ruleIds.has("gopen.stress-position")).toBe(true);
    expect(ruleIds.has("gopen.old-before-new")).toBe(true);
    expect(ruleIds.has("precision.argument-flow")).toBe(true);
    expect(report.findings.some((f) => f.patternName === "Buried Lede")).toBe(true);

    // Spans are clamped into the analyzed text.
    for (const f of llm) {
      for (const s of f.spans) {
        expect(s.start).toBeGreaterThanOrEqual(0);
        expect(s.end).toBeLessThanOrEqual(report.extractedText.length);
        expect(s.end).toBeGreaterThan(s.start);
      }
    }
  });

  test("precision dimension reflects the LLM precisionScore", async () => {
    const model = new MockLanguageModel({
      response: { ...defaultLensResult, precisionScore: 9 },
    });
    const report = await createCoach().review(baseInput({ model }));
    const precision = report.dimensions.find((d) => d.key === "precision");
    expect(precision?.score).toBe(9);
  });

  test("retains the engine's deterministic findings alongside LLM ones", async () => {
    const model = new MockLanguageModel();
    const report = await createCoach().review(baseInput({ model }));
    expect(report.findings.some((f) => f.method === "deterministic")).toBe(true);
    expect(report.findings.some((f) => f.method === "llm")).toBe(true);
  });
});

describe("createCoach / review — deterministic-only path", () => {
  test("no model ⇒ deterministicOnly, neutral precision baseline, no altitude", async () => {
    const report = await createCoach().review(baseInput()); // no model

    expect(report.meta.deterministicOnly).toBe(true);
    expect(report.altitude).toBeUndefined();
    expect(report.findings.every((f) => f.method !== "llm")).toBe(true);

    const precision = report.dimensions.find((d) => d.key === "precision");
    expect(precision?.score).toBe(6); // PRECISION_BASELINE
    expect(precision?.notes).toMatch(/baseline/i);

    // Still a real grade.
    expect(GRADES.has(report.grade)).toBe(true);
    expect(report.meta.note).toMatch(/no language model/i);
  });
});

describe("createCoach / review — robustness", () => {
  test("malformed JSON degrades gracefully (retry once, then skip LLM)", async () => {
    const model = new MockLanguageModel({ response: "I'm not JSON, sorry!" });
    const report = await createCoach().review(baseInput({ model }));

    // Retried once → two calls total.
    expect(model.calls).toBe(2);
    // No LLM findings, no altitude, but still a valid graded report.
    expect(report.findings.every((f) => f.method !== "llm")).toBe(true);
    expect(report.altitude).toBeUndefined();
    expect(GRADES.has(report.grade)).toBe(true);
    expect(report.meta.note).toMatch(/malformed/i);

    // Precision falls back to baseline since the verdict never arrived.
    const precision = report.dimensions.find((d) => d.key === "precision");
    expect(precision?.score).toBe(6);
  });

  test("first call malformed, retry valid ⇒ LLM findings recovered", async () => {
    const model = new MockLanguageModel({
      responses: ["garbage{not json", defaultLensResult],
    });
    const report = await createCoach().review(baseInput({ model }));
    expect(model.calls).toBe(2);
    expect(report.findings.some((f) => f.method === "llm")).toBe(true);
    expect(report.altitude).toBeDefined();
  });

  test("low proseRatio ⇒ lowProseConfidence + softened severities", async () => {
    const { extraction, engine } = buildFixture(MATH_HEAVY_TEX);
    const model = new MockLanguageModel();
    const seeded: Finding = {
      ruleId: "demo.warning",
      category: "clarity",
      method: "heuristic",
      severity: "warning",
      message: "seeded warning",
      spans: [],
      confidence: 0.8,
    };
    const engineWithSeed = { ...engine, findings: [...engine.findings, seeded] };
    const report = await createCoach().review({
      extraction,
      engine: engineWithSeed,
      rubric: defaultRubric,
      model,
    });

    expect(report.meta.lowProseConfidence).toBe(true);
    // The seeded warning is softened to "suggestion".
    const out = report.findings.find((f) => f.ruleId === "demo.warning");
    expect(out?.severity).toBe("suggestion");
    expect(out?.confidence).toBeLessThan(0.8);
  });
});

describe("createCoach / review — delta", () => {
  test("fills GradeDelta against a previous report", async () => {
    const coach = createCoach();
    const model = new MockLanguageModel();

    const first = await coach.review(baseInput({ model }));

    // A cleaner second pass: bump the precision verdict and drop hedge density.
    const better = new MockLanguageModel({
      response: { ...defaultLensResult, precisionScore: 9 },
    });
    const { extraction, engine } = buildFixture(SAMPLE_TEX);
    const cleaner = {
      ...engine,
      metrics: { ...engine.metrics, hedgeDensity: 0, passiveFraction: 0 },
    };
    const second: CoachReport = await coach.review({
      extraction,
      engine: cleaner,
      rubric: defaultRubric,
      model: better,
      previous: first,
    });

    expect(second.delta).toBeDefined();
    expect(second.delta?.previousGrade).toBe(first.grade);
    expect(second.delta?.changed).toBeDefined();
    // precision dimension moved (6.5 → 9) and a headline metric changed.
    expect(second.delta?.changed?.precision).toEqual({ from: 6.5, to: 9 });
    expect(second.delta?.changed?.hedgeDensity?.to).toBe(0);
  });

  test("no previous ⇒ no delta", async () => {
    const report = await createCoach().review(baseInput());
    expect(report.delta).toBeUndefined();
  });
});
