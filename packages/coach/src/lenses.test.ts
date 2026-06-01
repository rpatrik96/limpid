import { describe, expect, test } from "vitest";

import { coerceSeverity, coerceSpans, extractJson, parseLensResult } from "./lenses.js";
import { defaultLensResult } from "./mock.js";

describe("extractJson", () => {
  test("returns clean JSON unchanged", () => {
    const j = '{"a":1}';
    expect(extractJson(j)).toBe(j);
  });

  test("unwraps a ```json fenced block", () => {
    const raw = 'Here you go:\n```json\n{"a":1}\n```\nDone.';
    expect(extractJson(raw)).toBe('{"a":1}');
  });

  test("extracts an embedded object from prose", () => {
    const raw = 'Sure — the result is {"a": {"b": 2}} and that is all.';
    expect(extractJson(raw)).toBe('{"a": {"b": 2}}');
  });

  test("handles braces inside strings", () => {
    const raw = '{"msg": "use {curly} braces"}';
    expect(extractJson(raw)).toBe(raw);
  });

  test("returns null when no object is present", () => {
    expect(extractJson("no json here")).toBeNull();
    expect(extractJson("")).toBeNull();
  });
});

describe("parseLensResult", () => {
  test("parses a valid lens result", () => {
    const r = parseLensResult(JSON.stringify(defaultLensResult));
    expect(r).not.toBeNull();
    expect(r?.altitude.assumedAudience).toBeTruthy();
    expect(typeof r?.precisionScore).toBe("number");
    expect(r?.patterns[0]?.id).toBe("buried-lede");
  });

  test("parses a fenced + prose-wrapped valid result", () => {
    const raw = "Analysis complete.\n```json\n" + JSON.stringify(defaultLensResult) + "\n```";
    expect(parseLensResult(raw)).not.toBeNull();
  });

  test("rejects malformed JSON", () => {
    expect(parseLensResult("not json")).toBeNull();
    expect(parseLensResult("{ broken")).toBeNull();
  });

  test("rejects valid JSON missing required altitude", () => {
    expect(parseLensResult('{"precisionScore": 7}')).toBeNull();
  });

  test("rejects valid JSON missing precisionScore", () => {
    const noScore = JSON.stringify({ altitude: defaultLensResult.altitude });
    expect(parseLensResult(noScore)).toBeNull();
  });

  test("drops malformed findings but keeps the result", () => {
    const r = parseLensResult(
      JSON.stringify({
        altitude: defaultLensResult.altitude,
        precisionScore: 5,
        stressTopic: [{ message: "ok" }, { notMessage: 1 }, "garbage"],
      }),
    );
    expect(r?.stressTopic).toHaveLength(1);
  });

  test("tolerates missing optional arrays (defaults to empty)", () => {
    const r = parseLensResult(
      JSON.stringify({ altitude: defaultLensResult.altitude, precisionScore: 8 }),
    );
    expect(r?.stressTopic).toEqual([]);
    expect(r?.cohesion).toEqual([]);
    expect(r?.argumentFlow).toEqual([]);
    expect(r?.patterns).toEqual([]);
  });
});

describe("coerceSeverity", () => {
  test("passes through valid severities", () => {
    expect(coerceSeverity("warning", "info")).toBe("warning");
    expect(coerceSeverity("ERROR", "info")).toBe("error");
  });
  test("falls back on unknown severity", () => {
    expect(coerceSeverity("critical", "suggestion")).toBe("suggestion");
    expect(coerceSeverity(undefined, "warning")).toBe("warning");
  });
});

describe("coerceSpans", () => {
  test("clamps to text bounds and drops empties", () => {
    const spans = coerceSpans(
      [
        { start: -5, end: 4 },
        { start: 3, end: 3 }, // empty → dropped
        { start: 8, end: 100 },
      ],
      10,
    );
    expect(spans).toEqual([
      { start: 0, end: 4 },
      { start: 8, end: 10 },
    ]);
  });

  test("undefined → empty array", () => {
    expect(coerceSpans(undefined, 10)).toEqual([]);
  });
});
