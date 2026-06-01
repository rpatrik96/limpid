/**
 * Parse + merge user-supplied rules/patterns (from `.limpid/rules.json`) into a
 * base {@link RubricConfig}. Pure and lenient: invalid entries are collected as
 * errors and skipped rather than throwing, so one bad rule can't break the run.
 */
import type { DiagnosisPattern, Rule, RubricConfig, RuleDetector } from "@coach/contract";

export interface ParseResult {
  rules: Rule[];
  patterns: DiagnosisPattern[];
  errors: string[];
}

const SEVERITIES = ["info", "suggestion", "warning", "error"];
const METHODS = ["deterministic", "heuristic", "llm", "hybrid"];

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function str(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function validateDetector(v: unknown): RuleDetector | undefined {
  if (!isObj(v)) return undefined;
  switch (v["kind"]) {
    case "words": {
      const words = strArray(v["words"]);
      return words.length ? { kind: "words", words } : undefined;
    }
    case "phrases": {
      const phrases = strArray(v["phrases"]);
      return phrases.length ? { kind: "phrases", phrases } : undefined;
    }
    case "opener": {
      const prefixes = strArray(v["prefixes"]);
      return prefixes.length ? { kind: "opener", prefixes } : undefined;
    }
    case "regex":
      return str(v["pattern"])
        ? {
            kind: "regex",
            pattern: v["pattern"],
            ...(str(v["flags"]) ? { flags: v["flags"] } : {}),
          }
        : undefined;
    default:
      return undefined;
  }
}

function validateExamples(v: unknown): { before: string; after: string }[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (e): e is { before: string; after: string } =>
      isObj(e) && typeof e["before"] === "string" && typeof e["after"] === "string",
  );
}

function validateRule(v: unknown, i: number, errors: string[]): Rule | null {
  if (!isObj(v)) {
    errors.push(`rules[${i}]: not an object`);
    return null;
  }
  const { id, name, category, source, method, severity, rationale } = v;
  if (!str(id)) {
    errors.push(`rules[${i}]: missing string "id"`);
    return null;
  }
  if (!str(name) || !str(category) || !str(source) || !str(rationale)) {
    errors.push(`rules[${id}]: missing name/category/source/rationale`);
    return null;
  }
  if (!str(method) || !METHODS.includes(method)) {
    errors.push(`rules[${id}]: method must be one of ${METHODS.join("|")}`);
    return null;
  }
  if (!str(severity) || !SEVERITIES.includes(severity)) {
    errors.push(`rules[${id}]: severity must be one of ${SEVERITIES.join("|")}`);
    return null;
  }
  const rule: Rule = {
    id,
    name,
    category: category as Rule["category"],
    source,
    method: method as Rule["method"],
    severity: severity as Rule["severity"],
    rationale,
  };
  const detector = validateDetector(v["detector"]);
  if (detector) rule.detector = detector;
  const examples = validateExamples(v["examples"]);
  if (examples.length) rule.examples = examples;
  return rule;
}

function validatePattern(v: unknown, i: number, errors: string[]): DiagnosisPattern | null {
  if (!isObj(v)) {
    errors.push(`patterns[${i}]: not an object`);
    return null;
  }
  const { id, name, definition, howToSpot, whyItFails } = v;
  if (!str(id) || !str(name) || !str(definition) || !str(howToSpot) || !str(whyItFails)) {
    errors.push(`patterns[${i}]: missing id/name/definition/howToSpot/whyItFails`);
    return null;
  }
  const ex = v["example"];
  const example =
    isObj(ex) && typeof ex["before"] === "string" && typeof ex["after"] === "string"
      ? { before: ex["before"], after: ex["after"] }
      : { before: "", after: "" };
  const detectableBy =
    str(v["detectableBy"]) && METHODS.includes(v["detectableBy"])
      ? (v["detectableBy"] as DiagnosisPattern["detectableBy"])
      : "llm";
  return { id, name, definition, howToSpot, whyItFails, example, detectableBy };
}

/** Validate a parsed `.limpid/rules.json` object into rules + patterns + errors. */
export function parseUserRules(json: unknown): ParseResult {
  const errors: string[] = [];
  const rules: Rule[] = [];
  const patterns: DiagnosisPattern[] = [];

  if (!isObj(json)) {
    errors.push("root: expected an object with 'rules' and/or 'patterns' arrays");
    return { rules, patterns, errors };
  }
  if (Array.isArray(json["rules"])) {
    json["rules"].forEach((r, i) => {
      const rule = validateRule(r, i, errors);
      if (rule) rules.push(rule);
    });
  }
  if (Array.isArray(json["patterns"])) {
    json["patterns"].forEach((p, i) => {
      const pat = validatePattern(p, i, errors);
      if (pat) patterns.push(pat);
    });
  }
  return { rules, patterns, errors };
}

function mergeById<T extends { id: string }>(base: T[], overlay: T[]): T[] {
  const byId = new Map(base.map((x) => [x.id, x]));
  for (const o of overlay) byId.set(o.id, o);
  return [...byId.values()];
}

/** Merge user rules/patterns into a base rubric: same id overrides, new id appends. */
export function mergeRubric(
  base: RubricConfig,
  user: { rules?: Rule[]; patterns?: DiagnosisPattern[] },
): RubricConfig {
  return {
    ...base,
    rules: mergeById(base.rules, user.rules ?? []),
    patterns: mergeById(base.patterns, user.patterns ?? []),
  };
}
