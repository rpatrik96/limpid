/**
 * limpid CLI core — testable, no process/fs here. Scores a string through the
 * deterministic pipeline (coach review with NO model) and gates on thresholds.
 */
import { createCoach } from "@coach/coach";
import { defaultRubric, rubricForRegister, REGISTERS, type Register } from "@coach/rubric";
import { extract } from "@coach/latex";
import { analyze } from "@coach/engine";

export interface Thresholds {
  maxPassive?: number;
  maxFk?: number;
  maxFiller?: number;
  minGrade?: string;
}

export interface CliOptions {
  files: string[];
  json: boolean;
  thresholds: Thresholds;
  register: Register;
}

export interface FileResult {
  file: string;
  grade: string;
  metrics: { passiveFraction: number; fk: number; fillerDensity: number; words: number };
  findingCount: number;
  failed: boolean;
  violations: string[];
}

export function parseArgs(argv: string[]): CliOptions {
  const files: string[] = [];
  const thresholds: Thresholds = {};
  let json = false;
  let register: Register = "paper";

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--json":
        json = true;
        break;
      case "--register": {
        const v = argv[++i];
        if (v && (REGISTERS as string[]).includes(v)) register = v as Register;
        break;
      }
      case "--max-passive":
        thresholds.maxPassive = Number(argv[++i]);
        break;
      case "--max-fk":
        thresholds.maxFk = Number(argv[++i]);
        break;
      case "--max-filler":
        thresholds.maxFiller = Number(argv[++i]);
        break;
      case "--min-grade":
        thresholds.minGrade = argv[++i];
        break;
      default:
        if (a && !a.startsWith("--")) files.push(a);
    }
  }
  return { files, json, thresholds, register };
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

export async function checkText(
  text: string,
  file: string,
  t: Thresholds,
  register: Register = "paper",
): Promise<FileResult> {
  const extraction = extract(text);
  const engine = analyze(extraction.text);
  const rubric = rubricForRegister(register, defaultRubric);
  const report = await createCoach().review({ extraction, engine, rubric });
  const m = report.metrics;

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

  return {
    file,
    grade: report.grade,
    metrics,
    findingCount: report.findings.length,
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
