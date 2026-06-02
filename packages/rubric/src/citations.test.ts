import { describe, expect, it } from "vitest";

import type { Rule } from "@coach/contract";

import { rules } from "./rules.js";
import { runDetector } from "./detector.js";

/** The extractor collapses \cite/\citet and \ref/\cref/\eqref to a "[ref]" token. */
const ruleById = (id: string): Rule => {
  const r = rules.find((x) => x.id === id);
  if (!r?.detector) throw new Error(`rule ${id} or its detector is missing`);
  return r;
};

/** runDetector returns [] for a regex the safety guard rejects, so a non-empty
 *  result here also proves each citation pattern passes isSafeUserRegex. */
const matches = (id: string, text: string): number =>
  runDetector(ruleById(id).detector!, text).length;

describe("citation.as-subject", () => {
  it("fires when a citation is the grammatical subject", () => {
    expect(matches("citation.as-subject", "[ref] shows that deeper nets generalize.")).toBe(1);
    expect(matches("citation.as-subject", "Prior work [ref] argues the opposite.")).toBe(1);
  });
  it("does not fire on information-prominent citation or a bare 'is'", () => {
    expect(matches("citation.as-subject", "Deeper nets generalize better [ref].")).toBe(0);
    expect(matches("citation.as-subject", "Prior work [ref] is broad.")).toBe(0);
  });
});

describe("citation.pile-up", () => {
  it("fires on three or more stacked references", () => {
    expect(matches("citation.pile-up", "This holds [ref] [ref] [ref].")).toBe(1);
    expect(matches("citation.pile-up", "Many works [ref], [ref]; [ref], [ref] agree.")).toBe(1);
  });
  it("does not fire on one or two references", () => {
    expect(matches("citation.pile-up", "This holds [ref].")).toBe(0);
    expect(matches("citation.pile-up", "Both [ref] and [ref] agree.")).toBe(0);
  });
});

describe("citation.weak-opener", () => {
  it("fires when a sentence opens by pointing at a reference", () => {
    expect(matches("citation.weak-opener", "As shown in [ref], the loss decreases.")).toBe(1);
    expect(matches("citation.weak-opener", "We train. Following [ref], we tune the rate.")).toBe(1);
    expect(matches("citation.weak-opener", "Intro.\nAccording to [ref], it converges.")).toBe(1);
  });
  it("does not fire mid-sentence (a parenthetical pointer is fine)", () => {
    expect(matches("citation.weak-opener", "The loss, as shown in [ref], decreases.")).toBe(0);
  });
});
