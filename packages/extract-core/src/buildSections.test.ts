import { describe, expect, it } from "vitest";

import { buildNestedSections, escapeRegExp, lineStartOffsets } from "./buildSections.js";

describe("buildNestedSections", () => {
  it("spans each head to the next same-or-higher level (and classifies the title)", () => {
    const heads = [
      { title: "Introduction", command: "section", level: 2, start: 0 },
      { title: "Background", command: "subsection", level: 3, start: 20 },
      { title: "Methods", command: "section", level: 2, start: 40 },
    ];
    const out = buildNestedSections(heads, 100);
    expect(out.map((s) => s.title)).toEqual(["Introduction", "Background", "Methods"]);
    // Introduction (level 2) runs to Methods (level 2), swallowing the nested Background.
    expect(out[0]!.end).toBe(40);
    // Background (level 3) is terminated by the higher-level Methods (level 2).
    expect(out[1]!.end).toBe(40);
    // The trailing head runs to the source end.
    expect(out[2]!.end).toBe(100);
    expect(out[0]!.kind).toBe("introduction");
  });

  it("honours an explicit per-head end (e.g. an abstract's begin/end span)", () => {
    const heads = [
      { title: "Abstract", command: "abstract", level: 2, start: 0, end: 30 },
      { title: "Introduction", command: "section", level: 2, start: 40 },
    ];
    const out = buildNestedSections(heads, 100);
    expect(out[0]!.end).toBe(30); // explicit end wins over the nesting rule
    expect(out[1]!.end).toBe(100);
  });

  it("sorts output by start offset", () => {
    const heads = [
      { title: "B", command: "section", level: 2, start: 50 },
      { title: "A", command: "section", level: 2, start: 0 },
    ];
    const out = buildNestedSections(heads, 100);
    expect(out.map((s) => s.title)).toEqual(["A", "B"]);
  });

  it("returns [] for no heads", () => {
    expect(buildNestedSections([], 10)).toEqual([]);
  });
});

describe("lineStartOffsets", () => {
  it("returns the offset of each line's first char", () => {
    expect(lineStartOffsets("ab\ncd\n\nef")).toEqual([0, 3, 6, 7]);
  });
  it("always includes offset 0", () => {
    expect(lineStartOffsets("")).toEqual([0]);
  });
});

describe("escapeRegExp", () => {
  it("escapes regex metacharacters so the string matches literally", () => {
    const literal = "a.b*c(d)";
    const re = new RegExp(escapeRegExp(literal));
    expect(re.test(literal)).toBe(true);
    expect(re.test("axbxxcxdx")).toBe(false);
  });
});
