import { describe, expect, it } from "vitest";

import { runDetector } from "./detector.js";

describe("runDetector", () => {
  it("words: whole-word, case-insensitive, with spans", () => {
    const m = runDetector({ kind: "words", words: ["just"] }, "Just adjust it; justify nothing.");
    expect(m).toHaveLength(1); // "Just" matches; "adjust"/"justify" do not
    expect(m[0]).toMatchObject({ start: 0, end: 4, text: "Just" });
  });

  it("phrases: substring match", () => {
    const m = runDetector({ kind: "phrases", phrases: ["in order to"] }, "We do this in order to win.");
    expect(m).toHaveLength(1);
    expect(m[0]?.text).toBe("in order to");
  });

  it("regex: honours the pattern and fails soft on an invalid one", () => {
    expect(runDetector({ kind: "regex", pattern: "\\d+" }, "a12 b3")).toHaveLength(2);
    expect(runDetector({ kind: "regex", pattern: "(" }, "x")).toEqual([]);
  });

  it("opener: matches only sentence-initial prefixes", () => {
    const text = "There is a gap. We address it. It is clear.";
    const m = runDetector({ kind: "opener", prefixes: ["there is", "it is"] }, text);
    expect(m.map((x) => x.text.toLowerCase())).toEqual(["there is", "it is"]);
  });

  it("empty detector lists yield no matches", () => {
    expect(runDetector({ kind: "words", words: [] }, "x")).toEqual([]);
    expect(runDetector({ kind: "opener", prefixes: [] }, "x")).toEqual([]);
  });
});
