import { describe, expect, it } from "vitest";

import type { RubricConfig } from "@coach/contract";

import { defaultRubric } from "./index.js";
import { REGISTERS, registerNote, rubricForRegister } from "./register.js";

const acc = (r: RubricConfig): number => r.dimensions.find((d) => d.key === "accessibility")?.weight ?? 0;
const prec = (r: RubricConfig): number => r.dimensions.find((d) => d.key === "precision")?.weight ?? 0;

describe("rubricForRegister", () => {
  it("every register weights the four dimensions to sum 1", () => {
    for (const reg of REGISTERS) {
      const r = rubricForRegister(reg, defaultRubric);
      expect(r.dimensions.reduce((s, d) => s + d.weight, 0)).toBeCloseTo(1, 5);
    }
  });

  it("paper keeps the default weighting (precision 0.3)", () => {
    expect(prec(rubricForRegister("paper", defaultRubric))).toBe(0.3);
  });

  it("blog raises accessibility and lowers the FK ceiling vs paper", () => {
    const paper = rubricForRegister("paper", defaultRubric);
    const blog = rubricForRegister("blog", defaultRubric);
    expect(acc(blog)).toBeGreaterThan(acc(paper));
    expect(blog.thresholds[0]!.fkGrade[1]).toBeLessThan(paper.thresholds[0]!.fkGrade[1]);
  });

  it("never produces an FK band below 1", () => {
    for (const reg of REGISTERS) {
      for (const t of rubricForRegister(reg, defaultRubric).thresholds) {
        expect(t.fkGrade[0]).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("exposes a human-readable note per register", () => {
    expect(registerNote("blog")).toMatch(/accessib/i);
  });
});
