import { describe, expect, test } from "vitest";
import { defaultRubric } from "@coach/rubric";

import { buildLensRequest } from "./prompts.js";
import { buildFixture, SAMPLE_TEX } from "./fixtures.js";

describe("buildLensRequest", () => {
  const { extraction, engine } = buildFixture(SAMPLE_TEX);

  test("feeds the analyzed text and asks for JSON", () => {
    const req = buildLensRequest({
      text: extraction.text,
      engine,
      patterns: defaultRubric.patterns,
    });
    expect(req.json).toBe(true);
    expect(req.prompt).toContain(extraction.text);
    expect(req.system).toMatch(/voice contract/i);
  });

  test("includes the deterministic findings as evidence", () => {
    const req = buildLensRequest({
      text: extraction.text,
      engine,
      patterns: defaultRubric.patterns,
    });
    // At least one engine ruleId surfaced as evidence.
    expect(req.prompt).toMatch(/orwell\.cut-needless-words|strunk\.weak-opener/);
  });

  test("lists the named patterns by id", () => {
    const req = buildLensRequest({
      text: extraction.text,
      engine,
      patterns: defaultRubric.patterns,
    });
    expect(req.prompt).toContain("buried-lede");
    expect(req.prompt).toContain("jargon-cliff");
  });

  test("asks the model to INFER the audience when none is given", () => {
    const req = buildLensRequest({
      text: extraction.text,
      engine,
      patterns: defaultRubric.patterns,
    });
    expect(req.prompt).toMatch(/INFER it/);
    expect(req.prompt).toMatch(/"inferred": true/);
  });

  test("pins the audience when the user supplies one", () => {
    const req = buildLensRequest({
      text: extraction.text,
      engine,
      patterns: defaultRubric.patterns,
      audience: "a first-year PhD student",
    });
    expect(req.prompt).toContain("a first-year PhD student");
    expect(req.prompt).toMatch(/"inferred": false/);
  });

  test("adds a conservative note when prose confidence is low", () => {
    const req = buildLensRequest({
      text: extraction.text,
      engine,
      patterns: defaultRubric.patterns,
      lowProseConfidence: true,
    });
    expect(req.prompt).toMatch(/extraction confidence is LOW/);
  });
});
