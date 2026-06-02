import { describe, expect, it } from "vitest";

import * as rubric from "@coach/rubric";
import * as engine from "./wordlists.js";

/**
 * Finding 5: the canonical word/phrase lists live ONCE in @coach/rubric and the
 * engine imports them. These tests pin that single-source contract so the lists
 * can never silently diverge again (BOOSTER_WORDS especially).
 */
describe("word lists are single-sourced from @coach/rubric (finding 5)", () => {
  const SHARED = [
    "FILLER_WORDS",
    "FILLER_PHRASES",
    "HEDGE_WORDS",
    "HEDGE_PHRASES",
    "BOOSTER_WORDS",
    "WEAK_OPENERS",
  ] as const;

  it("the engine re-exports the very same array reference as the rubric", () => {
    for (const name of SHARED) {
      // Identity, not just deep-equality: proves there is one definition, not a copy.
      expect(engine[name]).toBe(rubric[name]);
    }
  });

  it("BOOSTER_WORDS is one reconciled, non-empty, duplicate-free list", () => {
    const boosters = engine.BOOSTER_WORDS;
    expect(boosters.length).toBeGreaterThan(0);
    expect(new Set(boosters).size).toBe(boosters.length);
    // The reconciled definition keeps the conviction-inflating intensifiers.
    expect(boosters).toContain("clearly");
    expect(boosters).toContain("obviously");
    expect(boosters).toContain("significantly");
  });

  it("ML_JARGON is gone (finding 8 — dead export removed)", () => {
    expect((engine as Record<string, unknown>)["ML_JARGON"]).toBeUndefined();
  });
});
