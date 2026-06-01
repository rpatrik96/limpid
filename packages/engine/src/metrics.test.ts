import { describe, it, expect } from "vitest";
import { sentenceStats, monotony } from "./metrics.js";
import { splitSentences } from "./text.js";

describe("monotony", () => {
  it("is 0 for fewer than two sentences", () => {
    expect(monotony([])).toBe(0);
    expect(monotony([10])).toBe(0);
  });

  it("is high when every sentence is the same length bucket", () => {
    // all 'M' bucket (12..25): one long run, all adjacent pairs same.
    const m = monotony([15, 16, 17, 18, 19]);
    expect(m).toBeCloseTo(1, 5);
  });

  it("is lower when buckets alternate", () => {
    // S, L, S, L, S — no same-bucket adjacency, no run > 1.
    const m = monotony([5, 40, 5, 40, 5]);
    expect(m).toBeLessThan(0.3);
  });
});

describe("sentenceStats", () => {
  it("zeroes everything for empty input", () => {
    const s = sentenceStats([]);
    expect(s.count).toBe(0);
    expect(s.meanWords).toBe(0);
    expect(s.cv).toBe(0);
    expect(s.buckets).toEqual({ short: 0, medium: 0, long: 0 });
  });

  // Each fixture sentence must START WITH A CAPITAL so the splitter (which needs
  // [.!?] + whitespace + capital) actually separates them.
  const sentenceOf = (n: number): string => "Word " + "word ".repeat(n - 1).trim() + ".";

  it("computes mean, std, and cv over sentence lengths", () => {
    const text = `Short one here. ${sentenceOf(40)}`;
    const sents = splitSentences(text);
    const s = sentenceStats(sents);
    expect(s.count).toBe(2);
    expect(s.meanWords).toBeGreaterThan(0);
    expect(s.cv).toBeGreaterThan(0);
    expect(s.cv).toBeCloseTo(s.stdWords / s.meanWords, 6);
  });

  it("counts long (>40) and very-long (>60) sentences", () => {
    const short = "A tiny one.";
    const sents = splitSentences(`${short} ${sentenceOf(45)} ${sentenceOf(65)}`);
    const s = sentenceStats(sents);
    expect(s.count).toBe(3);
    expect(s.longCount).toBe(2); // both 45 and 65 exceed 40
    expect(s.veryLongCount).toBe(1); // only 65 exceeds 60
  });

  it("buckets short<=14, long>=30, medium between", () => {
    const sents = splitSentences(`${sentenceOf(10)} ${sentenceOf(20)} ${sentenceOf(35)}`);
    const s = sentenceStats(sents);
    expect(s.buckets).toEqual({ short: 1, medium: 1, long: 1 });
  });
});
