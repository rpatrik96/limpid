import { describe, expect, it } from "vitest";

import { extract, stripComment, transformInline } from "./index.js";
import { MATH_HEAVY_TEX, SAMPLE_TEX } from "./fixtures.js";

describe("extract — markup stripping", () => {
  const out = extract(SAMPLE_TEX);

  it("removes display-math / equation environments (drops their body)", () => {
    expect(out.text).not.toMatch(/mathcal\{L\}/);
    expect(out.text).not.toMatch(/sum_/);
    expect(out.text).not.toContain("\\theta");
    expect(out.text).not.toContain("\\begin{equation}");
    // The label inside the equation must not survive.
    expect(out.text).not.toContain("eq:loss");
  });

  it("removes figure environments including the caption text", () => {
    expect(out.text).not.toContain("This caption should be dropped");
    expect(out.text).not.toContain("includegraphics");
    expect(out.text).not.toContain("arch.pdf");
    expect(out.text).not.toContain("\\begin{figure}");
  });

  it("turns \\cite / \\citep / \\citet / \\cref into [ref]", () => {
    expect(out.text).toContain("[ref]");
    // No raw citation commands remain.
    expect(out.text).not.toMatch(/\\cite/);
    expect(out.text).not.toMatch(/\\citep/);
    expect(out.text).not.toMatch(/\\citet/);
    expect(out.text).not.toMatch(/\\cref/);
  });

  it("keeps section titles as prose", () => {
    expect(out.text).toContain("Introduction");
    expect(out.text).toContain("Related Work");
    expect(out.text).toContain("Discussion");
  });

  it("strips inline math to a space (no $ survive) but keeps surrounding prose", () => {
    expect(out.text).not.toContain("$");
    expect(out.text).not.toContain("\\epsilon");
    expect(out.text).toContain("Our estimator achieves error");
    expect(out.text).toContain("on the benchmark of");
  });

  it("unwraps \\emph / \\textbf, keeping the inner text", () => {
    expect(out.text).toContain("identifiability");
    expect(out.text).toContain("key");
    expect(out.text).not.toContain("\\emph");
    expect(out.text).not.toContain("\\textbf");
  });

  it("unescapes escaped specials (\\% → %) and never treats them as comments", () => {
    expect(out.text).toContain("50% threshold");
  });

  it("drops line comments but not escaped percents", () => {
    expect(out.text).not.toContain("a trailing comment here");
  });

  it("drops structural-command metadata (package names, classes, env-leak)", () => {
    // \documentclass{article} / \usepackage{amsmath} args are not prose.
    expect(out.text).not.toMatch(/\barticle\b/);
    expect(out.text).not.toMatch(/\bamsmath\b/);
    // \begin{document}/\end{document} must not leak the literal "document".
    expect(out.text).not.toMatch(/\bdocument\b/);
    // …but the title/author text DO survive as prose.
    expect(out.text).toContain("A Tiny Paper");
  });
});

describe("extract — sections", () => {
  const out = extract(SAMPLE_TEX);

  it("detects the abstract environment as a section", () => {
    const abstract = out.sections.find((s) => s.kind === "abstract");
    expect(abstract).toBeDefined();
  });

  it("classifies section kinds from titles", () => {
    const kinds = out.sections.map((s) => s.kind);
    expect(kinds).toContain("introduction");
    expect(kinds).toContain("related");
    expect(kinds).toContain("discussion");
  });

  it("gives each section a valid range into the extracted text", () => {
    for (const s of out.sections) {
      expect(s.range.start).toBeGreaterThanOrEqual(0);
      expect(s.range.end).toBeGreaterThanOrEqual(s.range.start);
      expect(s.range.end).toBeLessThanOrEqual(out.text.length);
    }
  });

  it("records a 1-based source line for each section", () => {
    for (const s of out.sections) {
      expect(s.sourceLineStart).toBeGreaterThanOrEqual(1);
    }
    // Abstract begins before Introduction in the source.
    const abstract = out.sections.find((s) => s.kind === "abstract");
    const intro = out.sections.find((s) => s.kind === "introduction");
    expect(abstract?.sourceLineStart ?? 0).toBeLessThan(intro?.sourceLineStart ?? 0);
  });

  it("section ranges actually contain the title text", () => {
    const intro = out.sections.find((s) => s.kind === "introduction");
    expect(intro).toBeDefined();
    if (intro) {
      const slice = out.text.slice(intro.range.start, intro.range.end);
      expect(slice).toContain("Introduction");
    }
  });
});

describe("extract — proseRatio", () => {
  it("is strictly inside (0,1) for a normal paper", () => {
    const out = extract(SAMPLE_TEX);
    expect(out.proseRatio).toBeGreaterThan(0);
    expect(out.proseRatio).toBeLessThan(1);
  });

  it("is low for a math-heavy input", () => {
    const out = extract(MATH_HEAVY_TEX);
    expect(out.proseRatio).toBeGreaterThanOrEqual(0);
    expect(out.proseRatio).toBeLessThan(0.5);
  });

  it("is 0 for empty input", () => {
    expect(extract("").proseRatio).toBe(0);
  });
});

describe("extract — sourceMap", () => {
  const out = extract(SAMPLE_TEX);

  it("is monotonic non-decreasing in both textOffset and sourceLine", () => {
    for (let i = 1; i < out.sourceMap.length; i++) {
      const prev = out.sourceMap[i - 1]!;
      const cur = out.sourceMap[i]!;
      expect(cur.textOffset).toBeGreaterThanOrEqual(prev.textOffset);
      expect(cur.sourceLine).toBeGreaterThanOrEqual(prev.sourceLine);
    }
  });

  it("has every entry in-bounds and 1-based", () => {
    for (const e of out.sourceMap) {
      expect(e.textOffset).toBeGreaterThanOrEqual(0);
      expect(e.textOffset).toBeLessThanOrEqual(out.text.length);
      expect(e.sourceLine).toBeGreaterThanOrEqual(1);
    }
  });

  it("emits at least one entry for non-empty prose", () => {
    expect(out.sourceMap.length).toBeGreaterThan(0);
  });
});

describe("unit — stripComment", () => {
  it("drops a trailing comment", () => {
    expect(stripComment("hello % world")).toBe("hello ");
  });
  it("keeps an escaped percent", () => {
    expect(stripComment("50\\% done % note")).toBe("50\\% done ");
  });
  it("keeps a full line with no comment", () => {
    expect(stripComment("no comment here")).toBe("no comment here");
  });
});

describe("unit — transformInline false-positive tails", () => {
  it("does not mistake a copular sentence for a command", () => {
    expect(transformInline("This is important and clear.")).toBe("This is important and clear.");
  });
  it("keeps prose around an inline-math hole", () => {
    expect(transformInline("the rate $\\alpha$ is small")).toBe("the rate is small");
  });
  it("collapses a \\textbf wrapper", () => {
    expect(transformInline("a \\textbf{bold} claim")).toBe("a bold claim");
  });
});
