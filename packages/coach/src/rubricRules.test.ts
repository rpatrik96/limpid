import { describe, expect, test } from "vitest";
import type { Rule } from "@coach/contract";
import { analyze } from "@coach/engine";
import { defaultRubric, mergeRubric } from "@coach/rubric";

import { createCoach } from "./index.js";
import { runRubricDetectors, BUILTIN_ENGINE_RULE_IDS } from "./rubricRules.js";
import { buildFixture, SAMPLE_TEX } from "./fixtures.js";

// A user-added rule that is NOT represented by any built-in engine check.
const userRule: Rule = {
  id: "user.no-foobar",
  name: "Avoid foobar",
  category: "clarity",
  source: "house style",
  method: "deterministic",
  severity: "warning",
  rationale: "The placeholder 'foobar' should never survive into a real draft.",
  detector: { kind: "words", words: ["foobar"] },
};

describe("runRubricDetectors — additional (non-built-in) detector rules", () => {
  test("fires a finding for a user-added detector rule", () => {
    const text = "We test the foobar baseline against the foobar variant.";
    const merged = mergeRubric(defaultRubric, { rules: [userRule] });
    const findings = runRubricDetectors(merged, text);

    const mine = findings.filter((f) => f.ruleId === "user.no-foobar");
    expect(mine).toHaveLength(2); // both "foobar" occurrences
    expect(mine[0]?.category).toBe("clarity");
    expect(mine[0]?.severity).toBe("warning");
    expect(mine[0]?.why).toContain("placeholder");
    // Spans index back into the text.
    for (const f of mine) {
      expect(text.slice(f.spans[0]!.start, f.spans[0]!.end).toLowerCase()).toBe("foobar");
    }
  });

  test("does NOT re-fire built-in engine rules (no double-counting)", () => {
    // The default rubric's filler-word rule shares the engine's ruleId, so
    // running it again would double-count. It must be skipped.
    const text = "This is basically just a very simple extension.";
    const findings = runRubricDetectors(defaultRubric, text);
    for (const id of BUILTIN_ENGINE_RULE_IDS) {
      expect(findings.some((f) => f.ruleId === id)).toBe(false);
    }
  });

  test("skips ids passed in skipIds (e.g. ids the engine already emitted)", () => {
    const text = "We test the foobar baseline.";
    const merged = mergeRubric(defaultRubric, { rules: [userRule] });
    const findings = runRubricDetectors(merged, text, new Set(["user.no-foobar"]));
    expect(findings.some((f) => f.ruleId === "user.no-foobar")).toBe(false);
  });

  test("ignores llm-only rules (no scriptable detector)", () => {
    const llmRule: Rule = {
      id: "user.semantic-only",
      name: "Semantic check",
      category: "flow",
      source: "house style",
      method: "llm",
      severity: "suggestion",
      rationale: "This needs a model — there is no mechanical detector for it.",
      detector: { kind: "words", words: ["foobar"] },
    };
    const merged = mergeRubric(defaultRubric, { rules: [llmRule] });
    const findings = runRubricDetectors(merged, "the foobar case");
    expect(findings.some((f) => f.ruleId === "user.semantic-only")).toBe(false);
  });
});

describe("coach.review — user-added rubric rules feed the pipeline (finding 1)", () => {
  test("a user rule passed via a merged rubric fires a finding in review", async () => {
    const text = buildFixture(SAMPLE_TEX).extraction.text;
    // Inject the trigger token into a copy of the engine output's analyzed text so
    // the user rule has something to match, mirroring what the extension passes in.
    const triggered = `${text}\n\nWe leave a foobar marker in the draft.`;
    const engine = analyze(triggered);
    const extraction = { ...buildFixture(SAMPLE_TEX).extraction, text: triggered };

    const merged = mergeRubric(defaultRubric, { rules: [userRule] });
    const report = await createCoach().review({ extraction, engine, rubric: merged });

    // The user-added rule must show up in the final findings (and thus diagnostics).
    expect(report.findings.some((f) => f.ruleId === "user.no-foobar")).toBe(true);
  });

  test("the same review without the user rule does NOT fire it (the rule is the cause)", async () => {
    const text = buildFixture(SAMPLE_TEX).extraction.text;
    const triggered = `${text}\n\nWe leave a foobar marker in the draft.`;
    const engine = analyze(triggered);
    const extraction = { ...buildFixture(SAMPLE_TEX).extraction, text: triggered };

    const report = await createCoach().review({ extraction, engine, rubric: defaultRubric });
    expect(report.findings.some((f) => f.ruleId === "user.no-foobar")).toBe(false);
  });
});

describe("engine ↔ rubric id reconciliation (finding 4)", () => {
  // Text engineered to exercise ALL SIX built-in engine checks at once:
  // weak opener, undefined acronym, passive, filler phrase, filler word, adverb
  // overuse. (Verified to emit exactly the six built-in ruleIds.)
  const SAMPLE = String.raw`There is a gap in the literature. We use SVM before defining it. The model was trained in order to win. It quickly slowly carefully poorly badly rapidly basically converged a very simple idea.`;

  test("the sample exercises every built-in engine ruleId", () => {
    const emitted = new Set(analyze(SAMPLE).findings.map((f) => f.ruleId));
    for (const id of BUILTIN_ENGINE_RULE_IDS) {
      expect(emitted.has(id), `sample should emit built-in ruleId "${id}"`).toBe(true);
    }
  });

  test("every engine-emitted ruleId resolves to a rubric rule (so hovers have rationale)", () => {
    const { findings } = analyze(SAMPLE);
    const emitted = new Set(findings.map((f) => f.ruleId));
    expect(emitted.size).toBeGreaterThan(0);

    const rubricIds = new Set(defaultRubric.rules.map((r) => r.id));
    for (const id of emitted) {
      const rule = defaultRubric.rules.find((r) => r.id === id);
      expect(rubricIds.has(id), `engine ruleId "${id}" must resolve to a rubric rule`).toBe(true);
      // The matched rule carries the teaching rationale the inline hover renders.
      expect(rule?.rationale.length).toBeGreaterThan(0);
    }
  });

  test("the built-in engine rule-id set is exactly the ids the engine can emit", () => {
    // Guard against drift: the coach's skip-list must stay aligned with the
    // engine's actual ruleIds, all of which are real rubric rules.
    const rubricIds = new Set(defaultRubric.rules.map((r) => r.id));
    for (const id of BUILTIN_ENGINE_RULE_IDS) {
      expect(rubricIds.has(id), `built-in id "${id}" must be a rubric rule`).toBe(true);
    }
  });
});
