/**
 * Register profiles: adapt a {@link RubricConfig} for the kind of writing being
 * coached, so a blog post isn't graded like a paper. A profile re-weights the
 * four dimensions and shifts the section readability (FK) targets. Pure.
 *
 * - paper: the default — precision + clarity carry the grade.
 * - blog:  prize accessibility; easier FK; first person / short sentences are fine.
 * - grant: clarity + significance; reviewers skim, so accessibility matters.
 * - sop:   statement of purpose — clear first-person narrative over dense rigor.
 * - notes: internal analytic prose — research notes, audits, decision records.
 */
import type { DimensionKey, RubricConfig } from "@coach/contract";

export type Register = "paper" | "blog" | "grant" | "sop" | "notes";
export const REGISTERS: Register[] = ["paper", "blog", "grant", "sop", "notes"];

interface RegisterProfile {
  weights: Record<DimensionKey, number>;
  /** added to every section's FK band (negative = easier target). */
  fkShift: number;
  note: string;
}

const PROFILES: Record<Register, RegisterProfile> = {
  paper: {
    weights: { accessibility: 0.2, clarity: 0.3, flow: 0.2, precision: 0.3 },
    fkShift: 0,
    note: "academic paper — precision and clarity carry the grade",
  },
  blog: {
    weights: { accessibility: 0.35, clarity: 0.3, flow: 0.2, precision: 0.15 },
    fkShift: -3,
    note: "blog / general audience — prize accessibility; first person and short sentences are welcome",
  },
  grant: {
    weights: { accessibility: 0.2, clarity: 0.35, flow: 0.15, precision: 0.3 },
    fkShift: -1,
    note: "grant / proposal — clarity and significance; reviewers skim",
  },
  sop: {
    weights: { accessibility: 0.3, clarity: 0.3, flow: 0.2, precision: 0.2 },
    fkShift: -2,
    note: "statement of purpose — a clear first-person narrative over dense rigor",
  },
  // Written for one reader who already has the context, and re-read cold months
  // later. Accessibility to a stranger matters least of any register; flow is
  // weighted up because the failure mode is a wall of text rather than an
  // imprecise claim, and the FK band is pulled below paper's because a note that
  // has to be read twice has already failed at its one job.
  notes: {
    weights: { accessibility: 0.2, clarity: 0.35, flow: 0.25, precision: 0.2 },
    fkShift: -2,
    note: "internal analytic note — one informed reader, read cold later; structure carries it",
  },
};

export function registerNote(register: Register): string {
  return PROFILES[register].note;
}

/** Apply a register profile to a base rubric (re-weight dimensions, shift FK). */
export function rubricForRegister(register: Register, base: RubricConfig): RubricConfig {
  const p = PROFILES[register];
  return {
    ...base,
    dimensions: base.dimensions.map((d) => ({ key: d.key, weight: p.weights[d.key] })),
    thresholds: base.thresholds.map((t) => ({
      ...t,
      fkGrade: [Math.max(1, t.fkGrade[0] + p.fkShift), Math.max(2, t.fkGrade[1] + p.fkShift)] as [
        number,
        number,
      ],
    })),
  };
}
