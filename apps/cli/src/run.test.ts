import { describe, expect, it } from "vitest";

import { extract as extractMd } from "@coach/markdown";
import { extract as extractTex } from "@coach/latex";

import { checkText, formatResults, parseArgs, rubricFor, sourceLineFor } from "./run.js";

/** A minimal, valid house rule: one deterministic word detector. */
const houseRules = {
  rules: [
    {
      id: "house.no-utilize",
      name: "Avoid 'utilize'",
      category: "clarity",
      source: "house style",
      method: "deterministic",
      severity: "suggestion",
      rationale: "'use' is shorter and clearer.",
      detector: { kind: "words", words: ["utilize", "utilizes", "utilizing"] },
      examples: [{ before: "We utilize a buffer.", after: "We use a buffer." }],
    },
  ],
  patterns: [],
};

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

  it("parses all three numeric thresholds (including 0 and negatives)", () => {
    const o = parseArgs(["--max-fk", "12", "--max-filler", "0", "--max-passive", "-1", "x.tex"]);
    expect(o.thresholds.maxFk).toBe(12);
    expect(o.thresholds.maxFiller).toBe(0);
    expect(o.thresholds.maxPassive).toBe(-1);
  });

  it("rejects a malformed numeric threshold instead of silently disabling the gate", () => {
    // The default would write stderr + process.exit(2); inject a throwing stub here.
    const onError = (m: string): never => {
      throw new Error(m);
    };
    expect(() => parseArgs(["--max-fk", "abc", "x.tex"], onError)).toThrow(/--max-fk/);
    expect(() => parseArgs(["--max-fk", "abc", "x.tex"], onError)).toThrow(/finite/);
    // A missing value (flag at end of argv) is also rejected.
    expect(() => parseArgs(["--max-filler"], onError)).toThrow(/--max-filler/);
    // NaN-producing tokens are rejected; a valid number is not.
    expect(() => parseArgs(["--max-passive", "NaN", "x.tex"], onError)).toThrow();
    expect(() => parseArgs(["--max-passive", "0.3", "x.tex"], onError)).not.toThrow();
  });
});

describe("house rules (.limpid/rules.json) reach the gate", () => {
  it("parses --rules and --no-user-rules", () => {
    const o = parseArgs(["--rules", "/tmp/r.json", "x.md"]);
    expect(o.rulesPath).toBe("/tmp/r.json");
    expect(o.noUserRules).toBe(false);
    expect(parseArgs(["--no-user-rules", "x.md"]).noUserRules).toBe(true);
    expect(parseArgs(["x.md"]).rulesPath).toBeUndefined();
  });

  it("merges a user rule into the register rubric", () => {
    const base = rubricFor("paper");
    const merged = rubricFor("paper", houseRules);
    expect(merged.ruleCount).toBe(1);
    expect(merged.errors).toEqual([]);
    expect(merged.rubric.rules.length).toBe(base.rubric.rules.length + 1);
    expect(merged.rubric.rules.some((r) => r.id === "house.no-utilize")).toBe(true);
  });

  it("overrides a built-in rule when the id matches, rather than appending", () => {
    const base = rubricFor("paper");
    const targetId = base.rubric.rules[0]?.id;
    expect(targetId).toBeTruthy();
    const override = {
      rules: [{ ...houseRules.rules[0], id: targetId, name: "Overridden" }],
      patterns: [],
    };
    const merged = rubricFor("paper", override);
    expect(merged.rubric.rules.length).toBe(base.rubric.rules.length);
    expect(merged.rubric.rules.find((r) => r.id === targetId)?.name).toBe("Overridden");
  });

  it("survives a malformed rules file: reports, drops, never throws", () => {
    const bad = { rules: [{ id: "broken" }, "not-an-object", 42], patterns: [] };
    const merged = rubricFor("paper", bad);
    expect(merged.errors.length).toBeGreaterThan(0);
    expect(merged.ruleCount).toBe(0);
    expect(merged.rubric.rules.length).toBe(rubricFor("paper").rubric.rules.length);
  });

  it("is a no-op when no rules are supplied, so the shipped rubric is unchanged", () => {
    const none = rubricFor("paper", undefined);
    expect(none.ruleCount).toBe(0);
    expect(none.rubric.rules.length).toBe(rubricFor("paper").rubric.rules.length);
  });

  it("a firing house rule changes the score, which is the whole point", async () => {
    const text = "We utilize a buffer. We utilize a queue. We utilize a cache.\n";
    const without = await checkText(text, "x.md", {}, "paper");
    const with_ = await checkText(text, "x.md", {}, "paper", houseRules);
    expect(with_.findingCount).toBeGreaterThan(without.findingCount);
  });
});

describe("per-finding output", () => {
  it("omits findings unless asked, and includes them when asked", async () => {
    const text = "# T\n\nWe utilize a buffer. We utilize a queue.\n";
    const quiet = await checkText(text, "x.md", {}, "paper", houseRules);
    const loud = await checkText(text, "x.md", {}, "paper", houseRules, true);
    expect(quiet.findings).toBeUndefined();
    expect(loud.findings).toBeDefined();
    expect(loud.findings?.length).toBe(loud.findingCount);
  });

  it("carries a rule id, a source line and an excerpt a caller can act on", async () => {
    const text = "# T\n\nA clean opening line.\n\nWe utilize a buffer here.\n";
    const r = await checkText(text, "x.md", {}, "paper", houseRules, true);
    const hit = r.findings?.find((f) => f.ruleId === "house.no-utilize");
    expect(hit).toBeDefined();
    expect(hit?.severity).toBe("suggestion");
    expect(typeof hit?.message).toBe("string");
    // The source line is 1-based and points into the ORIGINAL file, not the
    // extracted prose — that is the whole point of consulting the source map.
    const line = hit?.line ?? null;
    expect(line === null || line >= 1).toBe(true);
    expect(hit?.excerpt.length).toBeLessThanOrEqual(101);
  });

  it("orders findings most severe first so a caller can truncate safely", async () => {
    const text = "# T\n\nWe utilize a buffer. It is worth noting that we utilize a queue.\n";
    const r = await checkText(text, "x.md", {}, "paper", houseRules, true);
    const ranks = (r.findings ?? []).map((f) =>
      ["info", "suggestion", "warning", "error"].indexOf(f.severity),
    );
    expect([...ranks].sort((a, b) => b - a)).toEqual(ranks);
  });

  it("maps an offset onto the last source-map entry at or before it", () => {
    const map = [
      { textOffset: 0, sourceLine: 1 },
      { textOffset: 10, sourceLine: 5 },
      { textOffset: 40, sourceLine: 12 },
    ];
    expect(sourceLineFor(map, 0)).toBe(1);
    expect(sourceLineFor(map, 9)).toBe(1);
    expect(sourceLineFor(map, 10)).toBe(5);
    expect(sourceLineFor(map, 39)).toBe(5);
    expect(sourceLineFor(map, 1000)).toBe(12);
    expect(sourceLineFor([], 5)).toBeNull();
  });
});

describe("--max-severity gate", () => {
  it("parses a valid severity and rejects a bogus one", () => {
    expect(parseArgs(["--max-severity", "warning", "x.md"]).thresholds.maxSeverity).toBe("warning");
    const onError = (m: string): never => {
      throw new Error(m);
    };
    expect(() => parseArgs(["--max-severity", "loud", "x.md"], onError)).toThrow(/--max-severity/);
  });

  it("fails on a house rule at the bar and passes below it", async () => {
    const text = "# T\n\nWe utilize a buffer. We utilize a queue.\n";
    const atSuggestion = await checkText(
      text,
      "x.md",
      { maxSeverity: "suggestion" },
      "paper",
      houseRules,
    );
    const atError = await checkText(text, "x.md", { maxSeverity: "error" }, "paper", houseRules);
    expect(atSuggestion.failed).toBe(true);
    expect(atSuggestion.violations.join(" ")).toMatch(/suggestion\+/);
    expect(atError.failed).toBe(false);
  });
});

describe("the notes register", () => {
  it("is accepted by --register", () => {
    expect(parseArgs(["--register", "notes", "x.md"]).register).toBe("notes");
  });

  it("weights flow above paper's, because a wall of text is the failure mode", () => {
    const paper = rubricFor("paper").rubric;
    const notes = rubricFor("notes").rubric;
    const flow = (r: typeof paper): number =>
      r.dimensions.find((d) => d.key === "flow")?.weight ?? 0;
    expect(flow(notes)).toBeGreaterThan(flow(paper));
    expect(notes.dimensions.reduce((s, d) => s + d.weight, 0)).toBeCloseTo(1, 5);
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
