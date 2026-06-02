import { describe, expect, it } from "vitest";

import { extract as extractMd } from "@coach/markdown";
import { extract as extractTex } from "@coach/latex";

import { checkText, formatResults, parseArgs } from "./run.js";

describe("parseArgs", () => {
  it("parses files, --json, and thresholds", () => {
    const o = parseArgs(["a.tex", "--json", "--max-passive", "0.3", "--min-grade", "B", "b.tex"]);
    expect(o.files).toEqual(["a.tex", "b.tex"]);
    expect(o.json).toBe(true);
    expect(o.thresholds.maxPassive).toBe(0.3);
    expect(o.thresholds.minGrade).toBe("B");
  });

  it("ignores unknown flags but keeps positionals", () => {
    const o = parseArgs(["--unknown", "x.tex"]);
    expect(o.files).toEqual(["x.tex"]);
  });

  it("defaults register to paper and parses --register (bogus → paper)", () => {
    expect(parseArgs(["x.tex"]).register).toBe("paper");
    expect(parseArgs(["--register", "blog", "x.tex"]).register).toBe("blog");
    expect(parseArgs(["--register", "bogus", "x.tex"]).register).toBe("paper");
  });
});

describe("checkText", () => {
  it("returns a grade + metrics with no violations when no thresholds are set", async () => {
    const r = await checkText("We use a buffer. The method is clear and direct.", "x.tex", {});
    expect(r.failed).toBe(false);
    expect(r.violations).toEqual([]);
    expect(r.grade).toMatch(/^[A-F][+-]?$/);
    expect(r.metrics.words).toBeGreaterThan(0);
  });

  it("flags a violation when passive voice exceeds the threshold", async () => {
    const passiveHeavy =
      "The model was trained by us. The loss was minimized by the optimizer. Results were obtained by the script.";
    const r = await checkText(passiveHeavy, "x.tex", { maxPassive: 0.1 });
    expect(r.failed).toBe(true);
    expect(r.violations.join(" ")).toMatch(/passive/);
  });

  it("routes .md through the Markdown extractor (case-insensitive)", async () => {
    const src = "# Title\n\nThe **model** is clear and direct.";
    // Control: the two extractors genuinely diverge on this input.
    expect(extractMd(src).text).not.toContain("#");
    expect(extractMd(src).text).not.toContain("**");
    expect(extractTex(src).text).toContain("#"); // LaTeX leaves Markdown markup literal
    const lower = await checkText(src, "note.md", {});
    const upper = await checkText(src, "NOTE.MD", {});
    expect(lower.metrics.words).toBeGreaterThan(0);
    expect(upper.metrics.words).toBe(lower.metrics.words); // the .md match is case-insensitive
  });
});

describe("formatResults", () => {
  it("json mode returns parseable JSON keyed by file", async () => {
    const r = await checkText("Short text here.", "x.tex", {});
    const out = formatResults([r], true);
    const parsed = JSON.parse(out) as { file: string }[];
    expect(parsed[0]?.file).toBe("x.tex");
  });

  it("text mode marks failures with FAIL", async () => {
    const r = await checkText("It was done by them.", "x.tex", { maxPassive: 0 });
    expect(formatResults([r], false)).toContain("FAIL");
  });
});
