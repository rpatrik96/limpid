import { describe, expect, it } from "vitest";

import { extract, preprocessLines, processDisplayMath, transformInline } from "./index.js";

/** Join the surviving (non-blank) preprocessed line texts for assertions. */
function preprocessed(tex: string): string {
  return preprocessLines(tex)
    .map((l) => l.text)
    .filter((t) => t.trim().length > 0)
    .join("\n");
}

describe("multi-line display math — \\[..\\]", () => {
  const TEX = [
    "Before the math.",
    "\\[",
    "  \\mathcal{L}(\\theta) = \\sum_i x_i^2 + \\beta",
    "\\]",
    "After the math.",
  ].join("\n");

  it("drops a \\[..\\] block that spans lines (phase-1)", () => {
    const p = preprocessed(TEX);
    expect(p).not.toContain("mathcal");
    expect(p).not.toContain("\\beta");
    expect(p).not.toContain("\\[");
    expect(p).not.toContain("\\]");
  });

  it("keeps the prose before and after the block", () => {
    const out = extract(TEX);
    expect(out.text).toContain("Before the math.");
    expect(out.text).toContain("After the math.");
    expect(out.text).not.toContain("mathcal");
    expect(out.text).not.toContain("theta");
  });

  it("keeps prose that sits on the opener and closer lines", () => {
    const tex = ["prose before \\[", "x = y", "\\] prose after"].join("\n");
    const out = extract(tex);
    expect(out.text).toContain("prose before");
    expect(out.text).toContain("prose after");
    expect(out.text).not.toContain("x = y");
  });
});

describe("multi-line display math — $$..$$", () => {
  const TEX = ["Lead in.", "$$", "  a^2 + b^2 = c^2", "$$", "Tail out."].join("\n");

  it("drops a $$..$$ block that spans lines (phase-1)", () => {
    const p = preprocessed(TEX);
    expect(p).not.toContain("a^2");
    expect(p).not.toContain("$$");
  });

  it("keeps the surrounding prose", () => {
    const out = extract(TEX);
    expect(out.text).toContain("Lead in.");
    expect(out.text).toContain("Tail out.");
    expect(out.text).not.toContain("$");
    expect(out.text).not.toContain("a^2");
  });
});

describe("stray unmatched single $", () => {
  it("drops a residual lone $ from extracted prose", () => {
    const out = extract("The cost is high $ and growing.");
    expect(out.text).not.toContain("$");
    expect(out.text).toContain("The cost is high");
    expect(out.text).toContain("and growing.");
  });

  it("drops a stray $ at line level via transformInline", () => {
    expect(transformInline("alpha $ beta")).toBe("alpha beta");
  });

  it("preserves an ESCAPED \\$ as a literal dollar sign", () => {
    expect(transformInline("the price is \\$5 today")).toBe("the price is $5 today");
  });
});

describe("processDisplayMath — unit", () => {
  it("leaves a balanced single-line \\[..\\] for phase-2 (state stays null)", () => {
    const r = processDisplayMath("a \\[ x \\] b", null);
    expect(r.state).toBeNull();
    expect(r.text).toBe("a \\[ x \\] b");
  });

  it("opens a region on an unbalanced \\[ and keeps the prose before it", () => {
    const r = processDisplayMath("keep me \\[ x = y", null);
    expect(r.state).toBe("bracket");
    expect(r.text).toBe("keep me ");
  });

  it("closes an open bracket region and keeps the trailing prose", () => {
    const r = processDisplayMath("more math \\] tail", "bracket");
    expect(r.state).toBeNull();
    expect(r.text).toBe(" tail");
  });

  it("drops a fully-interior math line (region stays open, no prose survives)", () => {
    const r = processDisplayMath("  \\sum_i x_i", "dollar");
    expect(r.state).toBe("dollar");
    expect(r.text).toBe("");
  });

  it("opens a $$ region on an unbalanced opener", () => {
    const r = processDisplayMath("intro $$", null);
    expect(r.state).toBe("dollar");
    expect(r.text).toBe("intro ");
  });
});
