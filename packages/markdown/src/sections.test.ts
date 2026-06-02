import { describe, expect, it } from "vitest";

import { findSourceSections } from "./sections.js";
import { SAMPLE_MD, SETEXT_MD } from "./fixtures.js";

describe("findSourceSections — ATX", () => {
  const s = findSourceSections(SAMPLE_MD);

  it("finds ATX headings in source order with h-level commands", () => {
    expect(s.map((x) => x.title)).toEqual(["Introduction", "Related Work", "Discussion"]);
    expect(s.map((x) => x.command)).toEqual(["h1", "h2", "h2"]);
    expect(s.map((x) => x.level)).toEqual([1, 2, 2]);
  });

  it("an h1 spans its nested h2s (to end of doc here)", () => {
    const intro = s.find((x) => x.title === "Introduction")!;
    expect(intro.end).toBe(SAMPLE_MD.length);
    expect(SAMPLE_MD.slice(intro.start, intro.end)).toContain("Related Work");
  });

  it("a section ends at the next same-or-higher heading", () => {
    const related = s.find((x) => x.title === "Related Work")!;
    const discussion = s.find((x) => x.title === "Discussion")!;
    expect(related.end).toBe(discussion.start);
  });

  it("slices start at the heading line", () => {
    const discussion = s.find((x) => x.title === "Discussion")!;
    expect(SAMPLE_MD.slice(discussion.start)).toMatch(/^## Discussion/);
  });
});

describe("findSourceSections — setext + edge cases", () => {
  it("recognises single-line setext headings (=, -)", () => {
    const s = findSourceSections(SETEXT_MD);
    expect(s.map((x) => x.title)).toEqual(["Introduction", "Background"]);
    expect(s.map((x) => x.level)).toEqual([1, 2]);
  });

  it("does not treat a # inside a fenced code block as a heading", () => {
    const md = ["```", "# not a heading", "```", "", "# Real Heading", "body"].join("\n");
    const s = findSourceSections(md);
    expect(s.map((x) => x.title)).toEqual(["Real Heading"]);
  });

  it("returns [] for prose with no headings", () => {
    expect(findSourceSections("just some text.\nmore text.")).toEqual([]);
  });

  it("detects ATX headings on CRLF line endings", () => {
    const md = "# Introduction\r\n\r\nBody text.\r\n\r\n## Methods\r\nMore.";
    const s = findSourceSections(md);
    expect(s.map((x) => x.title)).toEqual(["Introduction", "Methods"]);
    expect(s.map((x) => x.command)).toEqual(["h1", "h2"]);
    // Offsets index the ORIGINAL (CRLF) source, so the slice starts at the heading.
    expect(md.slice(s[0]!.start)).toMatch(/^# Introduction/);
  });

  it("an h1 and a nested h2 both terminate at a later higher-or-equal heading", () => {
    const md = ["# A", "a", "## B", "b", "### C", "c", "# D", "d"].join("\n");
    const s = findSourceSections(md);
    const A = s.find((x) => x.title === "A")!;
    const B = s.find((x) => x.title === "B")!;
    const D = s.find((x) => x.title === "D")!;
    expect(A.end).toBe(D.start); // h1 A runs until the next h1 D
    expect(B.end).toBe(D.start); // h2 B is terminated by the higher-level h1 D
    expect(md.slice(A.start, A.end)).toContain("### C"); // A includes the nested h3
    expect(md.slice(A.start, A.end)).not.toContain("# D");
  });
});
