import { describe, it, expect } from "vitest";
import {
  isPassive,
  passiveMatch,
  findAdverbs,
  findWords,
  findPhrases,
  startsWithWeak,
  findUndefinedAcronyms,
} from "./detectors.js";
import { FILLER_WORDS, HEDGE_WORDS, WEAK_OPENERS } from "./wordlists.js";

describe("isPassive (heuristic) — false-positive tails", () => {
  it("does NOT flag copular 'is + adjective'", () => {
    expect(isPassive("The result is important.")).toBe(false);
    expect(isPassive("The proof is elegant.")).toBe(false);
    expect(isPassive("The bound is tight.")).toBe(false);
  });

  it("flags a real passive with -ed participle", () => {
    expect(isPassive("The model was trained on ImageNet.")).toBe(true);
    expect(isPassive("The data is normalized before training.")).toBe(true);
  });

  it("flags a passive with an irregular participle", () => {
    expect(isPassive("The theorem was proven by induction.")).toBe(false); // 'proven' not in list
    expect(isPassive("The result is shown in Figure 2.")).toBe(true);
    expect(isPassive("The lemma was given without proof.")).toBe(true);
  });

  it("flags a passive with up to three intervening words", () => {
    expect(isPassive("The network was being carefully retrained.")).toBe(true);
  });

  it("locates the passive span inside the sentence", () => {
    const s = "The data is normalized first.";
    const m = passiveMatch(s);
    expect(m).not.toBeNull();
    expect(s.slice(m!.start, m!.end)).toContain("normalized");
  });
});

describe("findAdverbs — false-positive tails", () => {
  it("does NOT count terms-of-art that don't end in -ly", () => {
    const text = "The optimization improves the distribution.";
    expect(findAdverbs(text)).toHaveLength(0);
  });

  it("excludes the -ly stoplist words", () => {
    const text = "Only the family will apply and reply early; it is likely in Italy.";
    // only, family, apply, reply, early, likely, italy are all stoplisted.
    expect(findAdverbs(text)).toHaveLength(0);
  });

  it("flags genuine -ly adverbs", () => {
    const hits = findAdverbs("The model quickly and carefully converged.");
    expect(hits.map((h) => h.text.toLowerCase())).toEqual(["quickly", "carefully"]);
  });

  it("returns spans that index back into the text", () => {
    const text = "It converged slowly.";
    const hits = findAdverbs(text);
    expect(hits).toHaveLength(1);
    expect(text.slice(hits[0]!.start, hits[0]!.end)).toBe("slowly");
  });
});

describe("findWords / findPhrases", () => {
  it("matches filler words on word boundaries, case-insensitively", () => {
    const hits = findWords("This is Just a Very thing.", FILLER_WORDS);
    expect(hits.map((h) => h.text.toLowerCase()).sort()).toEqual(["just", "very"]);
  });

  it("does not match a filler word as a substring of another word", () => {
    // "justify" must not match "just"
    const hits = findWords("We justify the choice.", FILLER_WORDS);
    expect(hits).toHaveLength(0);
  });

  it("matches hedge words", () => {
    const hits = findWords("This might possibly work.", HEDGE_WORDS);
    expect(hits.map((h) => h.text.toLowerCase()).sort()).toEqual(["might", "possibly"]);
  });

  it("matches multi-word phrases and prefers the longest", () => {
    const hits = findPhrases("We do this in order to win.", ["in order to"]);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.text).toBe("in order to");
  });
});

describe("startsWithWeak", () => {
  it("flags expletive 'There is' openers", () => {
    expect(startsWithWeak("There is a gap in the literature.", WEAK_OPENERS)).toBe("there is");
  });

  it("flags 'It is' openers", () => {
    expect(startsWithWeak("It is well established.", WEAK_OPENERS)).toBe("it is");
  });

  it("does not flag a strong subject-first opener", () => {
    expect(startsWithWeak("The method outperforms baselines.", WEAK_OPENERS)).toBeNull();
  });
});

describe("findUndefinedAcronyms", () => {
  it("flags an acronym used before its definition", () => {
    const text = "We evaluate the SVM here. A Support Vector Machine (SVM) is a classifier.";
    const { undefinedUses, undefinedAcronyms } = findUndefinedAcronyms(text);
    expect(undefinedAcronyms).toContain("SVM");
    expect(undefinedUses.some((u) => u.acronym === "SVM")).toBe(true);
    // The flagged use is the FIRST one, before the parenthetical definition.
    const firstUse = text.indexOf("SVM");
    expect(undefinedUses[0]!.start).toBe(firstUse);
  });

  it("does NOT flag an acronym used only after its definition", () => {
    const text = "A Convolutional Neural Network (CNN) is used. The CNN has many layers.";
    const { undefinedUses, undefinedAcronyms } = findUndefinedAcronyms(text);
    expect(undefinedAcronyms).not.toContain("CNN");
    expect(undefinedUses.filter((u) => u.acronym === "CNN")).toHaveLength(0);
  });

  it("does not treat the in-parens defining token as a use-before-definition", () => {
    const text = "A Graph Neural Network (GNN) propagates messages.";
    const { undefinedAcronyms } = findUndefinedAcronyms(text);
    expect(undefinedAcronyms).not.toContain("GNN");
  });

  // ── Jargon-cliff guards (finding 7): not every all-caps token is an acronym ──

  it("does NOT flag common all-caps English / discourse words", () => {
    const text = "This is NOT a problem AND it is OK; the result holds for ALL inputs.";
    const { undefinedAcronyms, undefinedUses } = findUndefinedAcronyms(text);
    expect(undefinedAcronyms).toEqual([]);
    expect(undefinedUses).toEqual([]);
  });

  it("does NOT flag section-heading tokens used inline", () => {
    const text = "The METHODS describe the setup and the RESULTS confirm it.";
    const { undefinedAcronyms } = findUndefinedAcronyms(text);
    expect(undefinedAcronyms).not.toContain("METHODS");
    expect(undefinedAcronyms).not.toContain("RESULTS");
  });

  it("does NOT flag a token alone on its own heading line", () => {
    const text = "METHODS\nWe describe the SVM setup. A Support Vector Machine (SVM) is used.";
    const { undefinedAcronyms } = findUndefinedAcronyms(text);
    // METHODS sits alone on the heading line → skipped; SVM is still caught.
    expect(undefinedAcronyms).not.toContain("METHODS");
    expect(undefinedAcronyms).toContain("SVM");
  });

  it("does NOT flag roman numerals (section markers)", () => {
    const text = "See Section III and Phase XII for the IV ablation.";
    const { undefinedAcronyms } = findUndefinedAcronyms(text);
    expect(undefinedAcronyms).not.toContain("III");
    expect(undefinedAcronyms).not.toContain("XII");
    expect(undefinedAcronyms).not.toContain("IV");
  });

  it("does NOT flag settled initialisms in the stoplist (IID)", () => {
    const text = "We assume the samples are IID across the dataset.";
    const { undefinedAcronyms } = findUndefinedAcronyms(text);
    expect(undefinedAcronyms).not.toContain("IID");
  });

  it("still flags a genuine undefined initialism used inline", () => {
    const text = "We optimize with SGD and report the RMSE on the held-out split.";
    const { undefinedAcronyms } = findUndefinedAcronyms(text);
    expect(undefinedAcronyms).toContain("SGD");
    expect(undefinedAcronyms).toContain("RMSE");
  });
});
