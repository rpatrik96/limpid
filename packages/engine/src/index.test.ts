import { describe, it, expect } from "vitest";
import { analyze } from "./index.js";
import type { Finding } from "@coach/contract";

const byRule = (findings: Finding[], ruleId: string): Finding[] =>
  findings.filter((f) => f.ruleId === ruleId);

describe("analyze — end to end", () => {
  it("returns metrics and findings for empty text without throwing", () => {
    const r = analyze("");
    expect(r.metrics.wordCount).toBe(0);
    expect(r.metrics.sentenceStats.count).toBe(0);
    expect(r.metrics.readability.fleschKincaidGrade).toBe(0);
    expect(r.findings).toEqual([]);
  });

  it("counts words and sentences", () => {
    const r = analyze("The model trains fast. It also evaluates well.");
    expect(r.metrics.wordCount).toBe(8);
    expect(r.metrics.sentenceStats.count).toBe(2);
  });

  it("FK grade is finite and increases with sentence length", () => {
    const shortDoc = analyze("Cats run. Dogs play. Birds sing.");
    const longDoc = analyze(
      "The disentangled variational representation learning optimization procedure converges slowly under heavy regularization across many epochs.",
    );
    expect(Number.isFinite(shortDoc.metrics.readability.fleschKincaidGrade)).toBe(true);
    expect(longDoc.metrics.readability.fleschKincaidGrade).toBeGreaterThan(
      shortDoc.metrics.readability.fleschKincaidGrade,
    );
  });

  it("flags filler words with deterministic confidence and a span", () => {
    const text = "This is just a very simple example.";
    const r = analyze(text);
    const fillers = byRule(r.findings, "orwell.cut-needless-words");
    const texts = fillers.map((f) => text.slice(f.spans[0]!.start, f.spans[0]!.end).toLowerCase());
    expect(texts).toContain("just");
    expect(texts).toContain("very");
    expect(fillers.every((f) => f.confidence === 1)).toBe(true);
    expect(r.metrics.fillerDensity).toBeGreaterThan(0);
  });

  it("flags filler phrases", () => {
    const r = analyze("We did this in order to improve recall.");
    const phrases = byRule(r.findings, "strunk.omit-needless-phrases");
    expect(phrases).toHaveLength(1);
    expect(phrases[0]!.suggestion).toContain('"to"');
  });

  it("flags a weak opener and counts it in metrics", () => {
    const text = "There is a gap in the literature.";
    const r = analyze(text);
    const weak = byRule(r.findings, "strunk.weak-opener");
    expect(weak).toHaveLength(1);
    expect(r.metrics.weakOpenerCount).toBe(1);
    // span covers the whole sentence
    expect(text.slice(weak[0]!.spans[0]!.start, weak[0]!.spans[0]!.end)).toBe(text);
  });

  it("flags passive heuristically with confidence ~0.6", () => {
    const r = analyze("The model was trained on a large corpus.");
    const passive = byRule(r.findings, "orwell.prefer-active-voice");
    expect(passive).toHaveLength(1);
    expect(passive[0]!.method).toBe("heuristic");
    expect(passive[0]!.confidence).toBeCloseTo(0.6, 5);
    expect(r.metrics.passiveFraction).toBeGreaterThan(0);
  });

  it("does NOT flag copular 'is + adjective' as passive", () => {
    const r = analyze("The result is important. The bound is tight.");
    expect(byRule(r.findings, "orwell.prefer-active-voice")).toHaveLength(0);
    expect(r.metrics.passiveFraction).toBe(0);
  });

  it("does not count terms-of-art as adverbs", () => {
    const r = analyze("The optimization improves the distribution and inference.");
    expect(r.metrics.adverbDensity).toBe(0);
    expect(byRule(r.findings, "hemingway.adverb-overuse")).toHaveLength(0);
  });

  it("flags adverb overuse only above threshold", () => {
    const text = "It quickly slowly carefully poorly badly rapidly converged.";
    const r = analyze(text);
    expect(r.metrics.adverbDensity).toBeGreaterThan(4);
    expect(byRule(r.findings, "hemingway.adverb-overuse")).toHaveLength(1);
  });

  it("flags an acronym used before definition, not after", () => {
    const text =
      "We use the GAN here. A Generative Adversarial Network (GAN) follows. The GAN improves.";
    const r = analyze(text);
    expect(r.metrics.undefinedAcronyms).toContain("GAN");
    const acro = byRule(r.findings, "clarity.undefined-acronym");
    // only the pre-definition use is flagged
    expect(acro).toHaveLength(1);
    expect(text.slice(acro[0]!.spans[0]!.start, acro[0]!.spans[0]!.end)).toBe("GAN");
    expect(acro[0]!.spans[0]!.start).toBe(text.indexOf("GAN"));
  });

  it("computes hedge and booster densities", () => {
    const r = analyze("This might possibly work. It is clearly always correct.");
    expect(r.metrics.hedgeDensity).toBeGreaterThan(0);
    expect(r.metrics.boosterDensity).toBeGreaterThan(0);
  });

  it("every finding span indexes back into the input text", () => {
    const text =
      "There is a model that was trained quickly slowly carefully badly poorly in order to win.";
    const r = analyze(text);
    expect(r.findings.length).toBeGreaterThan(0);
    for (const f of r.findings) {
      for (const sp of f.spans) {
        expect(sp.start).toBeGreaterThanOrEqual(0);
        expect(sp.end).toBeLessThanOrEqual(text.length);
        expect(sp.end).toBeGreaterThan(sp.start);
      }
    }
  });

  it("reports a subjectVerbDistance when computable", () => {
    const r = analyze("The large pretrained model is fast.");
    expect(typeof r.metrics.subjectVerbDistance).toBe("number");
  });
});
