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

/** Hard cap on a user-supplied regex source length (ReDoS surface area). */
export const MAX_USER_PATTERN_LENGTH = 500;

/**
 * Heuristic for a catastrophic-backtracking pattern: a quantified group whose
 * body is itself quantified — `(a+)+`, `(a*)*`, `(a+)*`, `(\w+\s*)+`, etc. These
 * are the classic ReDoS shapes; `(a+)+$` on 40 a's never returns. We reject the
 * pattern outright rather than try to run it under a time budget (JS regex is
 * synchronous and cannot be interrupted once started).
 */
const NESTED_QUANTIFIER_RE = /\([^()]*[+*][^()]*\)\s*[+*]/;

/** True if a user regex looks safe to compile and run on bounded input. */
export function isSafeUserRegex(pattern: string): boolean {
  if (pattern.length > MAX_USER_PATTERN_LENGTH) return false;
  if (NESTED_QUANTIFIER_RE.test(pattern)) return false;
  try {
    new RegExp(pattern);
  } catch {
    return false;
  }
  return true;
}

/** The payload key each detector kind reads, for the "you meant this" error. */
const DETECTOR_PAYLOAD: Record<string, string> = {
  words: "words",
  phrases: "phrases",
  opener: "prefixes",
};

/**
 * Validate a user-supplied detector into either a detector or the reason it
 * failed. The reason matters: the payload key differs per kind (`words` /
 * `phrases` / `prefixes`), `words` is the shape people guess for all of them,
 * and a detector dropped without a word is a rule that loads clean and never
 * fires. {@link validateRule} turns the reason into an error and skips the rule.
 */
function validateDetector(v: unknown): { detector: RuleDetector } | { reason: string } {
  if (!isObj(v)) return { reason: "expected an object" };
  const kind = v["kind"];
  switch (kind) {
    case "words":
    case "phrases":
    case "opener": {
      const key = DETECTOR_PAYLOAD[kind]!;
      const items = strArray(v[key]);
      if (!items.length) {
        const present = Object.keys(v).filter((k) => k !== "kind");
        const got = present.length ? ` (got ${present.map((k) => `"${k}"`).join(", ")})` : "";
        return { reason: `kind "${kind}" needs a non-empty "${key}" array of strings${got}` };
      }
      return {
        detector:
          kind === "words"
            ? { kind: "words", words: items }
            : kind === "phrases"
              ? { kind: "phrases", phrases: items }
              : { kind: "opener", prefixes: items },
      };
    }
    case "regex": {
      // Reject empty, over-long, uncompilable, and ReDoS-shaped patterns so a
      // pathological user rule (e.g. "(a+)+$") can never reach matchRegex and
      // hang the host synchronously.
      const pattern = v["pattern"];
      if (!str(pattern)) return { reason: 'kind "regex" needs a non-empty "pattern" string' };
      if (pattern.length > MAX_USER_PATTERN_LENGTH) {
        return { reason: `regex pattern exceeds ${MAX_USER_PATTERN_LENGTH} characters` };
      }
      if (!isSafeUserRegex(pattern)) {
        return {
          reason:
            "regex pattern is uncompilable or has a nested quantifier — a catastrophic-backtracking shape such as (a+)+",
        };
      }
      return {
        detector: {
          kind: "regex",
          pattern,
          ...(str(v["flags"]) ? { flags: v["flags"] } : {}),
        },
      };
    }
    default:
      return {
        reason: `kind must be one of ${Object.keys(DETECTOR_PAYLOAD).join("|")}|regex (got ${
          typeof kind === "string" ? `"${kind}"` : String(kind)
        })`,
      };
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
  // A `detector` key that fails validation is skipped LOUDLY: silently dropping
  // it yields a rule that loads clean, reports nothing, and never fires.
  if (v["detector"] !== undefined) {
    const result = validateDetector(v["detector"]);
    if ("reason" in result) {
      errors.push(`rules[${id}]: invalid "detector" — ${result.reason}`);
      return null;
    }
    rule.detector = result.detector;
  }
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
