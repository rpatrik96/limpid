import { describe, expect, it } from "vitest";

import type { CoachReport, Finding } from "@coach/contract";
import { fromEnv } from "@coach/providers";

import { MockLanguageModel } from "../index.js";
import { GOLDEN_CASES } from "./cases.js";
import { evaluateExpectations, formatEvalReport, runEval } from "./harness.js";

function report(over: Partial<CoachReport>): CoachReport {
  return {
    version: "0.1.0",
    target: {},
    extractedText: "",
    metrics: {} as CoachReport["metrics"],
    findings: [],
    dimensions: [],
    grade: "B",
    meta: { deterministicOnly: false, lowProseConfidence: false },
    ...over,
  };
}

function finding(over: Partial<Finding>): Finding {
  return {
    ruleId: "x",
    category: "precision",
    method: "llm",
    severity: "warning",
    message: "m",
    spans: [],
    ...over,
  };
}

describe("evaluateExpectations", () => {
  it("matches a pattern by case-insensitive substring on patternName", () => {
    const r = report({ findings: [finding({ patternName: "Buried Lede" })] });
    expect(evaluateExpectations(r, { expectPattern: "buried" })[0]?.ok).toBe(true);
    expect(evaluateExpectations(r, { expectPattern: "hedge" })[0]?.ok).toBe(false);
  });

  it("checks altitude mentions against verdict + assumedAudience", () => {
    const r = report({
      altitude: {
        assumedAudience: "a reviewer",
        inferred: true,
        verdict: "over-explained for a reviewer",
      },
    });
    expect(evaluateExpectations(r, { altitudeMentions: "over" })[0]?.ok).toBe(true);
    expect(evaluateExpectations(r, { altitudeMentions: "jargon" })[0]?.ok).toBe(false);
  });

  it("counts only LLM-method findings for minLlmFindings", () => {
    const r = report({
      findings: [finding({ method: "llm" }), finding({ method: "deterministic" })],
    });
    expect(evaluateExpectations(r, { minLlmFindings: 1 })[0]?.ok).toBe(true);
    expect(evaluateExpectations(r, { minLlmFindings: 2 })[0]?.ok).toBe(false);
  });

  it("checks the grade bucket", () => {
    const r = report({ grade: "A" });
    expect(evaluateExpectations(r, { gradeIn: ["A", "B"] })[0]?.ok).toBe(true);
    expect(evaluateExpectations(r, { gradeIn: ["F"] })[0]?.ok).toBe(false);
  });
});

describe("runEval (mechanics, against the mock)", () => {
  it("returns one result per case, valid grades, and a pass rate in [0,1]", async () => {
    const out = await runEval(new MockLanguageModel(), GOLDEN_CASES);
    expect(out.total).toBe(GOLDEN_CASES.length);
    expect(out.results).toHaveLength(GOLDEN_CASES.length);
    expect(out.passRate).toBeGreaterThanOrEqual(0);
    expect(out.passRate).toBeLessThanOrEqual(1);
    for (const r of out.results) {
      expect(typeof r.passed).toBe("boolean");
      expect(r.grade).toMatch(/^[A-F][+-]?$/);
      expect(r.checks.length).toBeGreaterThan(0);
    }
    expect(formatEvalReport(out)).toContain("passed");
  });

  it("passes a case whose expectation the model's output satisfies", async () => {
    const model = new MockLanguageModel({
      response: {
        stressTopic: [],
        cohesion: [],
        argumentFlow: [{ message: "buried lede" }],
        altitude: {
          assumedAudience: "ML reviewer",
          inferred: true,
          verdict: "over-explained for a reviewer",
        },
        patterns: [],
        precisionScore: 6,
      },
    });
    // The altitude-over-explained case expects altitudeMentions "over".
    const target = GOLDEN_CASES.find((c) => c.id === "altitude-over-explained");
    const out = await runEval(model, target ? [target] : []);
    expect(out.results[0]?.passed).toBe(true);
  });
});

// Real-provider eval — opt-in via env (skipped in CI). Example:
//   LIMPID_EVAL_BASE_URL=https://openrouter.ai/api/v1 \
//   LIMPID_EVAL_API_KEY=sk-... LIMPID_EVAL_MODEL=openai/gpt-4o-mini npm run eval
const BASE = process.env["LIMPID_EVAL_BASE_URL"];

describe.skipIf(!BASE)("runEval (real provider via env)", () => {
  it("reports a pass rate against the configured endpoint", async () => {
    const model = fromEnv(process.env);
    expect(model).not.toBeNull();
    if (!model) return;
    const out = await runEval(model, GOLDEN_CASES);
    console.log("\n" + formatEvalReport(out) + "\n");
    expect(out.total).toBe(GOLDEN_CASES.length);
  }, 120_000);
});
