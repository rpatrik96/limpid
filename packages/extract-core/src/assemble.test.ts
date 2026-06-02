import { describe, expect, it } from "vitest";

import {
  assembleExtraction,
  nonSpaceChars,
  type SectionMarker,
  type SourceLine,
} from "./assemble.js";

/** Identity inline transform — the assembler is what's under test here. */
const identity = (s: string): string => s.replace(/\s+/g, " ").trim();

describe("assembleExtraction", () => {
  const lines: SourceLine[] = [
    { text: "Heading One", sourceLine: 1 },
    { text: "First paragraph line.", sourceLine: 2 },
    { text: "", sourceLine: 3 },
    { text: "Second paragraph.", sourceLine: 4 },
  ];
  const markers: SectionMarker[] = [
    { lineIndex: 0, kind: "introduction", title: "Heading One", sourceLine: 1 },
  ];
  const out = assembleExtraction(
    lines,
    markers,
    identity,
    nonSpaceChars(lines.map((l) => l.text).join("\n")),
  );

  it("joins prose and starts the body after the heading", () => {
    expect(out.text).toContain("Heading One");
    expect(out.text).toContain("First paragraph line.");
    expect(out.text).toContain("Second paragraph.");
  });

  it("collapses the blank line into a single paragraph break", () => {
    expect(out.text).not.toMatch(/\n{3,}/);
    expect(out.text).toMatch(/First paragraph line\.\s*\n\s*\nSecond paragraph\./);
  });

  it("emits a monotonic, in-bounds source map", () => {
    expect(out.sourceMap.length).toBeGreaterThan(0);
    for (let i = 1; i < out.sourceMap.length; i++) {
      expect(out.sourceMap[i]!.textOffset).toBeGreaterThanOrEqual(out.sourceMap[i - 1]!.textOffset);
      expect(out.sourceMap[i]!.sourceLine).toBeGreaterThanOrEqual(out.sourceMap[i - 1]!.sourceLine);
    }
    for (const e of out.sourceMap) {
      expect(e.textOffset).toBeLessThanOrEqual(out.text.length);
      expect(e.sourceLine).toBeGreaterThanOrEqual(1);
    }
  });

  it("builds a section whose range contains its heading title", () => {
    expect(out.sections).toHaveLength(1);
    const s = out.sections[0]!;
    expect(s.kind).toBe("introduction");
    expect(out.text.slice(s.range.start, s.range.end)).toContain("Heading One");
    expect(s.sourceLineStart).toBe(1);
  });

  it("computes proseRatio in (0,1] and 0 for empty input", () => {
    expect(out.proseRatio).toBeGreaterThan(0);
    expect(out.proseRatio).toBeLessThanOrEqual(1);
    expect(assembleExtraction([], [], identity, 0).proseRatio).toBe(0);
  });
});

describe("nonSpaceChars", () => {
  it("counts only non-whitespace", () => {
    expect(nonSpaceChars("a b\tc\n")).toBe(3);
    expect(nonSpaceChars("   ")).toBe(0);
  });
});
