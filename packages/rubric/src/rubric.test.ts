import { describe, it, expect } from "vitest";
import type { DimensionKey, SectionKind } from "@coach/contract";

import { defaultRubric } from "./index.js";

const { dimensions, thresholds, rules, patterns, voiceGuards, gradeBands } = defaultRubric;

// Every member of contract's SectionKind union, listed exhaustively so the test
// breaks loudly if the contract grows a new section kind.
const ALL_SECTION_KINDS: SectionKind[] = [
  "abstract",
  "introduction",
  "related",
  "methods",
  "results",
  "discussion",
  "proof",
  "caption",
  "unknown",
];

const ALL_DIMENSIONS: DimensionKey[] = ["accessibility", "clarity", "flow", "precision"];

describe("dimensions", () => {
  it("weights sum to 1", () => {
    const sum = dimensions.reduce((acc, d) => acc + d.weight, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it("includes every dimension exactly once", () => {
    const keys = dimensions.map((d) => d.key);
    for (const k of ALL_DIMENSIONS) {
      expect(keys.filter((x) => x === k)).toHaveLength(1);
    }
    expect(keys).toHaveLength(ALL_DIMENSIONS.length);
  });

  it("matches the writing-verify weighting (accessibility .2, clarity .3, flow .2, precision .3)", () => {
    const w = Object.fromEntries(dimensions.map((d) => [d.key, d.weight]));
    expect(w.accessibility).toBe(0.2);
    expect(w.clarity).toBe(0.3);
    expect(w.flow).toBe(0.2);
    expect(w.precision).toBe(0.3);
  });
});

describe("thresholds", () => {
  it("covers every SectionKind exactly once", () => {
    const sections = thresholds.map((t) => t.section);
    for (const kind of ALL_SECTION_KINDS) {
      expect(sections.filter((s) => s === kind)).toHaveLength(1);
    }
    expect(thresholds).toHaveLength(ALL_SECTION_KINDS.length);
  });

  it("has well-formed FK bands (low <= high) and passive ceilings in [0,1]", () => {
    for (const t of thresholds) {
      const [lo, hi] = t.fkGrade;
      expect(lo).toBeLessThanOrEqual(hi);
      expect(t.passiveFractionMax).toBeGreaterThanOrEqual(0);
      expect(t.passiveFractionMax).toBeLessThanOrEqual(1);
    }
  });

  it("encodes the spec'd bands (abstract strict, methods/proof loose)", () => {
    const by = Object.fromEntries(thresholds.map((t) => [t.section, t]));
    expect(by.abstract!.fkGrade).toEqual([10, 14]);
    expect(by.abstract!.passiveFractionMax).toBe(0.15);
    expect(by.methods!.fkGrade).toEqual([12, 18]);
    expect(by.methods!.passiveFractionMax).toBe(0.35);
    expect(by.proof!.fkGrade).toEqual([12, 18]);
    expect(by.proof!.passiveFractionMax).toBe(0.35);
    expect(by.introduction!.passiveFractionMax).toBe(0.2);
    expect(by.results!.fkGrade).toEqual([11, 17]);
    expect(by.results!.passiveFractionMax).toBe(0.3);
    expect(by.discussion!.passiveFractionMax).toBe(0.25);
    expect(by.related!.passiveFractionMax).toBe(0.2);
    expect(by.unknown!.passiveFractionMax).toBe(0.25);
  });
});

describe("rules", () => {
  const VALID_CATEGORIES = new Set([
    "accessibility",
    "clarity",
    "flow",
    "precision",
    "voice-guard",
    "typography",
  ]);
  const VALID_METHODS = new Set(["deterministic", "heuristic", "llm", "hybrid"]);
  const VALID_SEVERITY = new Set(["info", "suggestion", "warning", "error"]);

  it("has unique ids", () => {
    const ids = rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every rule carries the required fields (id, name, category, source, method, severity, rationale)", () => {
    for (const r of rules) {
      expect(r.id).toBeTruthy();
      expect(r.name).toBeTruthy();
      expect(VALID_CATEGORIES.has(r.category)).toBe(true);
      expect(r.source).toBeTruthy();
      expect(VALID_METHODS.has(r.method)).toBe(true);
      expect(VALID_SEVERITY.has(r.severity)).toBe(true);
      expect(r.rationale.length).toBeGreaterThan(20);
    }
  });

  it("every rule has at least one before/after example", () => {
    for (const r of rules) {
      expect(r.examples && r.examples.length).toBeGreaterThanOrEqual(1);
      for (const ex of r.examples ?? []) {
        expect(ex.before).toBeTruthy();
        expect(ex.after).toBeTruthy();
        expect(ex.before).not.toBe(ex.after);
      }
    }
  });

  it("every regex detector compiles", () => {
    let checked = 0;
    for (const r of rules) {
      const d = r.detector;
      if (d?.kind === "regex") {
        expect(() => new RegExp(d.pattern, d.flags)).not.toThrow();
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("word/phrase/opener detectors are non-empty", () => {
    for (const r of rules) {
      const d = r.detector;
      if (!d) continue;
      if (d.kind === "words") expect(d.words.length).toBeGreaterThan(0);
      if (d.kind === "phrases") expect(d.phrases.length).toBeGreaterThan(0);
      if (d.kind === "opener") expect(d.prefixes.length).toBeGreaterThan(0);
    }
  });

  it("encodes Orwell's six rules", () => {
    const orwell = rules.filter((r) => r.id.startsWith("orwell."));
    expect(orwell).toHaveLength(6);
  });

  it("encodes the four Strunk rules", () => {
    for (const id of [
      "strunk.omit-needless-words",
      "strunk.active-voice",
      "strunk.expletive-openers",
      "strunk.the-fact-that",
    ]) {
      expect(rules.find((r) => r.id === id)).toBeDefined();
    }
  });

  it("encodes the Economist read-twice + acronym + temporals + so-called rules", () => {
    for (const id of [
      "economist.read-twice",
      "economist.acronym-penalty",
      "economist.redundant-temporals",
      "economist.so-called",
    ]) {
      expect(rules.find((r) => r.id === id)).toBeDefined();
    }
  });

  it("encodes the four Writer's Diet bloat rules", () => {
    for (const id of [
      "writersdiet.be-verbs",
      "writersdiet.nominalizations",
      "writersdiet.prepositions",
      "writersdiet.adjectives",
    ]) {
      expect(rules.find((r) => r.id === id)).toBeDefined();
    }
  });

  it("encodes hedges, boosters, and clichés", () => {
    expect(rules.find((r) => r.id === "voice.hedges")).toBeDefined();
    expect(rules.find((r) => r.id === "voice.boosters")).toBeDefined();
    expect(rules.find((r) => r.id === "voice.cliches")).toBeDefined();
  });

  it("the read-twice rule is length-agnostic (no raw word-count detector)", () => {
    const readTwice = rules.find((r) => r.id === "economist.read-twice");
    // The Economist test is semantic, not mechanical — it must be an LLM rule
    // with no scriptable detector, so the engine never flags a sentence on length alone.
    expect(readTwice?.method).toBe("llm");
    expect(readTwice?.detector).toBeUndefined();
  });

  it("grounds the structural rules in the sources/ notes", () => {
    const strunk = rules.find((r) => r.id === "strunk.omit-needless-words");
    const gopen = rules.find((r) => r.id === "gopen.subject-verb-proximity");
    expect(strunk?.source).toContain("strunk-white.md");
    expect(gopen?.source).toContain("gopen-swan.md");
  });
});

describe("patterns (the 12)", () => {
  const EXPECTED = [
    "Idea Soup",
    "Buried Lede",
    "Cognitive Overload",
    "Monotonous Rhythm",
    "Hedge Stacking",
    "Orphan Transition",
    "Abstraction Fog",
    "Zombie Sentence",
    "Echo Chamber",
    "Throat Clearing",
    "Scale Mismatch",
    "Jargon Cliff",
  ];
  const VALID_METHODS = new Set(["deterministic", "heuristic", "llm", "hybrid"]);

  it("has exactly the twelve named patterns", () => {
    expect(patterns).toHaveLength(12);
    const names = patterns.map((p) => p.name);
    for (const n of EXPECTED) expect(names).toContain(n);
  });

  it("has unique ids", () => {
    const ids = patterns.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every pattern has every field, fully populated", () => {
    for (const p of patterns) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.definition.length).toBeGreaterThan(20);
      expect(p.howToSpot.length).toBeGreaterThan(20);
      expect(p.whyItFails.length).toBeGreaterThan(20);
      expect(p.example.before).toBeTruthy();
      expect(p.example.after).toBeTruthy();
      expect(p.example.before).not.toBe(p.example.after);
      expect(VALID_METHODS.has(p.detectableBy)).toBe(true);
    }
  });
});

describe("voiceGuards", () => {
  it("each guard references only real rule ids", () => {
    const ruleIds = new Set(rules.map((r) => r.id));
    for (const g of voiceGuards) {
      expect(g.suppresses.length).toBeGreaterThan(0);
      for (const id of g.suppresses) {
        expect(ruleIds.has(id)).toBe(true);
      }
    }
  });

  it("protects clause-stacking via the Economist read-twice test, not raw length", () => {
    const guard = voiceGuards.find((g) => g.id === "guard.clause-stacking-resolves");
    expect(guard).toBeDefined();
    expect(guard!.suppresses).toContain("economist.read-twice");
  });

  it("allows scope-hedging while still flagging conviction-hedging", () => {
    const guard = voiceGuards.find((g) => g.id === "guard.scope-hedging-is-a-virtue");
    expect(guard).toBeDefined();
    expect(guard!.suppresses).toEqual(
      expect.arrayContaining(["voice.hedges", "voice.hedge-phrases"]),
    );
  });

  it("keeps em-dash interpolations and colon-payoffs", () => {
    const guard = voiceGuards.find((g) => g.id === "guard.em-dash-and-colon-payoff");
    expect(guard).toBeDefined();
    expect(guard!.suppresses.length).toBeGreaterThan(0);
  });

  it("exempts terms of art from the nominalization rule", () => {
    const guard = voiceGuards.find((g) => g.id === "guard.terms-of-art-are-not-zombies");
    expect(guard).toBeDefined();
    expect(guard!.suppresses).toContain("writersdiet.nominalizations");
  });
});

describe("gradeBands", () => {
  it("spans A+ … F with the spec'd anchors", () => {
    const by = Object.fromEntries(gradeBands.map((b) => [b.grade, b]));
    expect(by["A+"]!.min).toBe(9.0);
    expect(by["F"]!.min).toBeLessThan(3.0);
  });

  it("is monotonically decreasing in min and every band has an action", () => {
    for (let i = 1; i < gradeBands.length; i++) {
      expect(gradeBands[i]!.min).toBeLessThan(gradeBands[i - 1]!.min);
    }
    for (const b of gradeBands) {
      expect(b.grade).toBeTruthy();
      expect(b.action.length).toBeGreaterThan(10);
    }
  });

  it("the lowest band has min 0 so every score earns a grade", () => {
    const min = Math.min(...gradeBands.map((b) => b.min));
    expect(min).toBe(0);
  });
});

describe("purity", () => {
  it("defaultRubric is a plain serializable object (no functions, no cycles)", () => {
    expect(() => JSON.stringify(defaultRubric)).not.toThrow();
    const round = JSON.parse(JSON.stringify(defaultRubric));
    expect(round.rules.length).toBe(rules.length);
    expect(round.patterns.length).toBe(12);
  });
});

describe("false-positive tails (spec'd in AGENTS.md)", () => {
  // The mechanical detectors WILL over-fire on legitimate prose; the rubric's job
  // is to ship the voice guards and the in-context patterns that catch those tails.
  it("copular 'is important' is reachable by a be-verb rule but a guard down-weights it", () => {
    const beVerb = rules.find((r) => r.id === "writersdiet.be-verbs");
    expect(beVerb).toBeDefined();
    // The colon-payoff / clause-stacking guards both list the be-verb rule, so a
    // well-formed "X is important: <payoff>" is protected.
    const guards = voiceGuards.filter((g) => g.suppresses.includes("writersdiet.be-verbs"));
    expect(guards.length).toBeGreaterThan(0);
  });

  it("'optimization'/'distribution' as terms of art are protected from the nominalization rule", () => {
    const nom = rules.find((r) => r.id === "writersdiet.nominalizations");
    expect(nom).toBeDefined();
    const guard = voiceGuards.find(
      (g) =>
        g.suppresses.includes("writersdiet.nominalizations") &&
        g.id === "guard.terms-of-art-are-not-zombies",
    );
    expect(guard).toBeDefined();
    // The rule's own rationale acknowledges the exemption.
    expect(nom!.rationale.toLowerCase()).toContain("terms of art");
  });
});
