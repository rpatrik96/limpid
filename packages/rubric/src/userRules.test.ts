import { describe, expect, it } from "vitest";

import type { RubricConfig } from "@coach/contract";

import { defaultRubric } from "./index.js";
import { mergeRubric, parseUserRules } from "./userRules.js";

describe("parseUserRules", () => {
  it("accepts a valid rule with a detector", () => {
    const r = parseUserRules({
      rules: [
        {
          id: "my.rule",
          name: "My Rule",
          category: "clarity",
          source: "me",
          method: "deterministic",
          severity: "warning",
          rationale: "because",
          detector: { kind: "words", words: ["foo"] },
        },
      ],
    });
    expect(r.errors).toEqual([]);
    expect(r.rules).toHaveLength(1);
    expect(r.rules[0]?.detector).toEqual({ kind: "words", words: ["foo"] });
  });

  it("collects errors and skips invalid rules", () => {
    const r = parseUserRules({
      rules: [
        {
          id: "bad",
          name: "x",
          category: "clarity",
          source: "s",
          method: "nope",
          severity: "warning",
          rationale: "r",
        },
      ],
    });
    expect(r.rules).toHaveLength(0);
    expect(r.errors.join(" ")).toMatch(/method/);
  });

  it("errors when the root is not an object", () => {
    expect(parseUserRules([]).errors.length).toBeGreaterThan(0);
  });

  it("validates patterns and defaults detectableBy to llm", () => {
    const r = parseUserRules({
      patterns: [{ id: "p1", name: "P", definition: "d", howToSpot: "h", whyItFails: "w" }],
    });
    expect(r.patterns).toHaveLength(1);
    expect(r.patterns[0]?.detectableBy).toBe("llm");
  });
});

describe("mergeRubric", () => {
  it("overrides a rule with the same id and appends new ones", () => {
    const baseCount = defaultRubric.rules.length;
    const existingId = defaultRubric.rules[0]!.id;
    const merged: RubricConfig = mergeRubric(defaultRubric, {
      rules: [
        {
          id: existingId,
          name: "Overridden",
          category: "clarity",
          source: "u",
          method: "deterministic",
          severity: "info",
          rationale: "r",
        },
        {
          id: "brand.new",
          name: "New",
          category: "clarity",
          source: "u",
          method: "deterministic",
          severity: "warning",
          rationale: "r",
        },
      ],
    });
    expect(merged.rules.length).toBe(baseCount + 1);
    expect(merged.rules.find((r) => r.id === existingId)?.name).toBe("Overridden");
    expect(merged.rules.some((r) => r.id === "brand.new")).toBe(true);
  });
});
