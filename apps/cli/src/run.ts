/**
 * limpid CLI core — testable, no process/fs here. Scores a string through the
 * deterministic pipeline (coach review with NO model) and gates on thresholds.
 */
import { createCoach } from "@coach/coach";
import {
  defaultRubric,
  mergeRubric,
  parseUserRules,
  rubricForRegister,
  REGISTERS,
  type Register,
} from "@coach/rubric";
import { extract as extractTex } from "@coach/latex";
import { extract as extractMd } from "@coach/markdown";
import { analyze } from "@coach/engine";
import type { Extraction, Finding, Severity, SourceMapEntry } from "@coach/contract";

/** Markdown files extract via @coach/markdown (headings drive sectioning); else LaTeX. */
function extractorFor(file: string): typeof extractTex {
  return /\.(md|markdown|mdx|qmd|rmd)$/i.test(file) ? extractMd : extractTex;
}

export interface Thresholds {
  maxPassive?: number;
  maxFk?: number;
  maxFiller?: number;
  minGrade?: string;
  /** Fail if any finding is at least this severe: info|suggestion|warning|error. */
  maxSeverity?: string;
}

export interface CliOptions {
  files: string[];
  json: boolean;
  thresholds: Thresholds;
  register: Register;
  /** Explicit `--rules <path>`; otherwise the caller discovers `.limpid/rules.json`. */
  rulesPath?: string;
  /** `--no-user-rules`: score against the shipped rubric alone. */
  noUserRules: boolean;
}

/**
 * One finding, flattened for machine consumption.
 *
 * A gate that reports only "grade dropped to B+" tells a caller nothing it can
 * act on. `ruleId` plus `line` says which rule fired and where, which is what a
 * pre-commit hook or an editing agent needs in order to fix it rather than guess.
 */
export interface FindingOut {
  ruleId: string;
  patternName?: string;
  category: string;
  severity: Severity;
  message: string;
  /** 1-based line in the SOURCE file, via the extraction's source map. */
  line: number | null;
  /** The offending text itself, trimmed. Empty for document-level findings. */
  excerpt: string;
}

export interface FileResult {
  file: string;
  grade: string;
  metrics: { passiveFraction: number; fk: number; fillerDensity: number; words: number };
  findingCount: number;
  /** Present in --json only; ordered most severe first, then by line. */
  findings?: FindingOut[];
  failed: boolean;
  violations: string[];
}

/** Ascending, so an index comparison answers "at least this severe". */
const SEVERITY_ORDER: Severity[] = ["info", "suggestion", "warning", "error"];

function severityRank(s: string): number {
  return SEVERITY_ORDER.indexOf(s as Severity);
}

/**
 * Source line for an offset into the extracted prose.
 *
 * `Extraction.sourceMap` is coarse and monotonic — entries mark where a run of
 * prose began in the original file — so the answer is the last entry at or
 * before the offset. Binary search because a long document carries thousands of
 * entries and every finding needs one.
 */
export function sourceLineFor(map: SourceMapEntry[], offset: number): number | null {
  if (map.length === 0) return null;
  let lo = 0;
  let hi = map.length - 1;
  let best: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const entry = map[mid];
    if (entry && entry.textOffset <= offset) {
      best = entry.sourceLine;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

const MAX_EXCERPT = 100;

function flattenFindings(findings: Finding[], extraction: Extraction): FindingOut[] {
  const out = findings.map((f) => {
    const span = f.spans[0];
    const excerpt = span
      ? extraction.text.slice(span.start, span.end).replace(/\s+/g, " ").trim()
      : "";
    return {
      ruleId: f.ruleId,
      ...(f.patternName ? { patternName: f.patternName } : {}),
      category: f.category,
      severity: f.severity,
      message: f.message,
      line: span ? sourceLineFor(extraction.sourceMap, span.start) : null,
      excerpt: excerpt.length > MAX_EXCERPT ? excerpt.slice(0, MAX_EXCERPT) + "…" : excerpt,
    };
  });
  out.sort(
    (a, b) =>
      severityRank(b.severity) - severityRank(a.severity) ||
      (a.line ?? Number.MAX_SAFE_INTEGER) - (b.line ?? Number.MAX_SAFE_INTEGER) ||
      a.ruleId.localeCompare(b.ruleId),
  );
  return out;
}

/**
 * How {@link parseArgs} reports a fatal usage error (a malformed numeric threshold).
 * The default writes to stderr and exits with code 2 — matching the CLI's other
 * usage failures — but tests inject a throwing stub so they can assert on the message
 * without terminating the process.
 */
export type OnArgError = (message: string) => never;

const defaultOnArgError: OnArgError = (message) => {
  process.stderr.write(`limpid: ${message}\n`);
  process.exit(2);
};

/**
 * Parse a finite numeric threshold; abort via {@link OnArgError} on a missing or
 * malformed value. Without this, `Number("abc")` is `NaN`, every `metric > NaN`
 * comparison is false, and the gate silently passes — so a typo'd flag would let
 * failing prose through CI unnoticed.
 */
function parseThreshold(flag: string, raw: string | undefined, onError: OnArgError): number {
  if (raw === undefined) onError(`${flag} requires a numeric value`);
  const n = Number(raw);
  if (!Number.isFinite(n)) onError(`${flag} expects a finite number, got ${JSON.stringify(raw)}`);
  return n;
}

export function parseArgs(argv: string[], onError: OnArgError = defaultOnArgError): CliOptions {
  const files: string[] = [];
  const thresholds: Thresholds = {};
  let json = false;
  let register: Register = "paper";
  let rulesPath: string | undefined;
  let noUserRules = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--json":
        json = true;
        break;
      case "--rules": {
        const v = argv[++i];
        if (v) rulesPath = v;
        break;
      }
      case "--no-user-rules":
        noUserRules = true;
        break;
      case "--register": {
        const v = argv[++i];
        if (v && (REGISTERS as string[]).includes(v)) register = v as Register;
        break;
      }
      case "--max-passive":
        thresholds.maxPassive = parseThreshold(a, argv[++i], onError);
        break;
      case "--max-fk":
        thresholds.maxFk = parseThreshold(a, argv[++i], onError);
        break;
      case "--max-filler":
        thresholds.maxFiller = parseThreshold(a, argv[++i], onError);
        break;
      case "--min-grade":
        thresholds.minGrade = argv[++i];
        break;
      case "--max-severity": {
        const v = argv[++i];
        if (v && SEVERITY_ORDER.includes(v as Severity)) thresholds.maxSeverity = v;
        else if (v)
          onError(
            `--max-severity expects one of ${SEVERITY_ORDER.join("|")}, got ${JSON.stringify(v)}`,
          );
        break;
      }
      default:
        if (a && !a.startsWith("--")) files.push(a);
    }
  }
  return { files, json, thresholds, register, rulesPath, noUserRules };
}

/** Grade order, ascending, derived from the rubric's bands (by min threshold). */
const GRADE_ORDER: string[] = [...defaultRubric.gradeBands]
  .sort((a, b) => a.min - b.min)
  .map((b) => b.grade);

function gradeRank(g: string): number {
  return GRADE_ORDER.indexOf(g);
}

const round = (x: number, d: number): number => {
  const p = 10 ** d;
  return Math.round(x * p) / p;
};

/**
 * House rules for the gate.
 *
 * `.limpid/rules.json` used to reach the extension's coach and grade but not this
 * CLI, so a team could write a house rule, watch it fire in the editor, and have
 * CI pass anyway. The rubric merge happens here, on already-parsed JSON: this
 * module stays free of fs/process by contract, so discovery and reading belong to
 * the caller. Invalid entries are dropped by `parseUserRules` and reported rather
 * than thrown — a malformed house rule must not take the gate down.
 */
export function rubricFor(
  register: Register,
  userRules?: unknown,
): {
  rubric: ReturnType<typeof rubricForRegister>;
  ruleCount: number;
  errors: string[];
} {
  const base = rubricForRegister(register, defaultRubric);
  if (userRules === undefined || userRules === null) {
    return { rubric: base, ruleCount: 0, errors: [] };
  }
  const parsed = parseUserRules(userRules);
  return {
    rubric: mergeRubric(base, { rules: parsed.rules, patterns: parsed.patterns }),
    ruleCount: parsed.rules.length,
    errors: parsed.errors,
  };
}

export async function checkText(
  text: string,
  file: string,
  t: Thresholds,
  register: Register = "paper",
  userRules?: unknown,
  withFindings = false,
): Promise<FileResult> {
  const extraction = extractorFor(file)(text);
  const engine = analyze(extraction.text);
  const { rubric } = rubricFor(register, userRules);
  const report = await createCoach().review({ extraction, engine, rubric });
  const m = report.metrics;
  const findings = flattenFindings(report.findings, extraction);

  const metrics = {
    passiveFraction: round(m.passiveFraction, 3),
    fk: round(m.readability.fleschKincaidGrade, 1),
    fillerDensity: round(m.fillerDensity, 2),
    words: m.wordCount,
  };

  const violations: string[] = [];
  if (t.maxPassive !== undefined && m.passiveFraction > t.maxPassive) {
    violations.push(`passive ${metrics.passiveFraction} > ${t.maxPassive}`);
  }
  if (t.maxFk !== undefined && m.readability.fleschKincaidGrade > t.maxFk) {
    violations.push(`FK ${metrics.fk} > ${t.maxFk}`);
  }
  if (t.maxFiller !== undefined && m.fillerDensity > t.maxFiller) {
    violations.push(`filler ${metrics.fillerDensity} > ${t.maxFiller}`);
  }
  if (t.minGrade !== undefined) {
    const need = gradeRank(t.minGrade);
    const have = gradeRank(report.grade);
    if (need >= 0 && have >= 0 && have < need) {
      violations.push(`grade ${report.grade} < ${t.minGrade}`);
    }
  }
  if (t.maxSeverity !== undefined) {
    const bar = severityRank(t.maxSeverity);
    const hits = findings.filter((f) => severityRank(f.severity) >= bar);
    if (hits.length > 0) {
      const worst = hits[0];
      violations.push(
        `${hits.length} finding(s) at ${t.maxSeverity}+ (first: ${worst?.ruleId}` +
          (worst?.line ? ` line ${worst.line}` : "") +
          ")",
      );
    }
  }

  return {
    file,
    grade: report.grade,
    metrics,
    findingCount: findings.length,
    ...(withFindings ? { findings } : {}),
    failed: violations.length > 0,
    violations,
  };
}

export function formatResults(results: FileResult[], json: boolean): string {
  if (json) return JSON.stringify(results, null, 2);
  return results
    .map((r) => {
      const status = r.failed ? "FAIL" : "ok  ";
      const v = r.violations.length ? `  [${r.violations.join("; ")}]` : "";
      return `${status} ${r.grade.padEnd(2)} ${r.file}  (passive ${r.metrics.passiveFraction}, FK ${r.metrics.fk}, filler ${r.metrics.fillerDensity}, ${r.findingCount} findings)${v}`;
    })
    .join("\n");
}
