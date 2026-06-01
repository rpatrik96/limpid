import { describe, it, expect } from "vitest";
import {
  splitSentences,
  tokenizeWords,
  countWords,
  countSyllables,
  fleschKincaid,
  fleschReadingEase,
} from "./text.js";

describe("splitSentences", () => {
  it("splits on terminal punctuation followed by a capital", () => {
    const text = "The model works. It is fast! Is it correct?";
    const s = splitSentences(text);
    expect(s.map((x) => x.text)).toEqual(["The model works.", "It is fast!", "Is it correct?"]);
  });

  it("returns spans that index back into the original text", () => {
    const text = "First one. Second one.";
    const s = splitSentences(text);
    for (const sent of s) {
      expect(text.slice(sent.start, sent.end)).toBe(sent.text);
    }
    expect(s[0]!.start).toBe(0);
  });

  it("protects abbreviations so they don't end a sentence", () => {
    const text = "We follow Smith et al. for the setup. See Fig. 3 for details.";
    const s = splitSentences(text);
    expect(s).toHaveLength(2);
    expect(s[0]!.text).toBe("We follow Smith et al. for the setup.");
    expect(s[1]!.text).toBe("See Fig. 3 for details.");
  });

  it("protects e.g. and i.e.", () => {
    const text = "Use a strong prior, e.g. a Gaussian. That helps.";
    const s = splitSentences(text);
    expect(s).toHaveLength(2);
  });

  it("handles a single sentence with no trailing period", () => {
    const s = splitSentences("Just one clause here");
    expect(s).toHaveLength(1);
    expect(s[0]!.text).toBe("Just one clause here");
  });

  it("returns nothing for whitespace-only input", () => {
    expect(splitSentences("   \n  ")).toHaveLength(0);
  });
});

describe("tokenizeWords / countWords", () => {
  it("counts apostrophe words as one token and ignores digits", () => {
    const text = "We don't use 3 layers but two.";
    expect(countWords(text)).toBe(6); // We don't use layers but two
    const toks = tokenizeWords(text).map((t) => t.text);
    expect(toks).toContain("don't");
    expect(toks).not.toContain("3");
  });

  it("produces spans that index back into the text", () => {
    const text = "alpha beta";
    const toks = tokenizeWords(text);
    expect(toks).toHaveLength(2);
    expect(text.slice(toks[1]!.start, toks[1]!.end)).toBe("beta");
  });
});

describe("countSyllables", () => {
  it("counts vowel groups, min 1", () => {
    expect(countSyllables("cat")).toBe(1);
    expect(countSyllables("model")).toBe(2);
    expect(countSyllables("optimization")).toBeGreaterThanOrEqual(4);
  });

  it("never returns 0 even for vowelless tokens", () => {
    expect(countSyllables("rhythm")).toBe(1);
  });
});

describe("fleschKincaid", () => {
  it("returns 0 for empty input", () => {
    expect(fleschKincaid([])).toBe(0);
  });

  it("is finite for normal prose", () => {
    const fk = fleschKincaid(["The result is important and clear."]);
    expect(Number.isFinite(fk)).toBe(true);
  });

  it("increases monotonically as sentences get longer (same vocabulary)", () => {
    const word = "models analyze patterns ";
    const short = [(word + "now.").trim()];
    const medium = [(word.repeat(3) + "now.").trim()];
    const long = [(word.repeat(6) + "now.").trim()];
    const a = fleschKincaid(short);
    const b = fleschKincaid(medium);
    const c = fleschKincaid(long);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
});

describe("fleschReadingEase", () => {
  it("is finite and falls as sentences lengthen", () => {
    const short = fleschReadingEase(["Cats run fast."]);
    const long = fleschReadingEase([
      "The disentangled representation learning optimization procedure converges.",
    ]);
    expect(Number.isFinite(short)).toBe(true);
    expect(short).toBeGreaterThan(long);
  });
});
