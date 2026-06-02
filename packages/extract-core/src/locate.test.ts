import { describe, expect, it } from "vitest";

import type { Extraction } from "@coach/contract";

import { locateSpanInSource } from "./locate.js";

/** A hand-built Extraction so this test needs no concrete extractor. */
function extraction(text: string, sourceMap: Extraction["sourceMap"] = []): Extraction {
  return { text, sections: [], sourceMap, proseRatio: 1 };
}

describe("locateSpanInSource", () => {
  it("maps a word back to its source range using the source-map anchor", () => {
    const source = "# Introduction\n\nIt is important to note the model.";
    const ex = extraction("Introduction\nIt is important to note the model.", [
      { textOffset: 0, sourceLine: 1 },
      { textOffset: 13, sourceLine: 3 },
    ]);
    const idx = ex.text.indexOf("important");
    const r = locateSpanInSource(source, ex, { start: idx, end: idx + "important".length });
    expect(r).not.toBeNull();
    expect(source.slice(r!.start, r!.end)).toBe("important");
  });

  it("matches a phrase that wraps across a newline in the source", () => {
    const source = "the model\nwas trained";
    const ex = extraction("the model was trained", [{ textOffset: 0, sourceLine: 1 }]);
    const phrase = "the model was";
    const idx = ex.text.indexOf(phrase);
    const r = locateSpanInSource(source, ex, { start: idx, end: idx + phrase.length });
    expect(r).not.toBeNull();
    expect(source.slice(r!.start, r!.end).replace(/\s+/g, " ")).toBe("the model was");
  });

  it("returns null for a too-short or unlocatable snippet", () => {
    const ex = extraction("Hello world.");
    expect(locateSpanInSource("Hello world.", ex, { start: 0, end: 1 })).toBeNull();
    expect(locateSpanInSource("Hello world.", ex, { start: 0, end: 5 })).not.toBeNull();
    expect(locateSpanInSource("nothing here", ex, { start: 0, end: 5 })).toBeNull();
  });

  it("disambiguates a repeated token using the source-map anchor", () => {
    const source = "Intro\n\nThe model is simple.\n\nMethods\n\nThe model is complex.";
    const ex = extraction("Intro\nThe model is simple.\nMethods\nThe model is complex.", [
      { textOffset: 0, sourceLine: 1 },
      { textOffset: 6, sourceLine: 3 },
      { textOffset: 27, sourceLine: 5 },
      { textOffset: 35, sourceLine: 7 },
    ]);
    const i = ex.text.lastIndexOf("model");
    const r = locateSpanInSource(source, ex, { start: i, end: i + 5 });
    // The anchor steers the search to the SECOND occurrence, not the first.
    expect(r!.start).toBe(source.lastIndexOf("model"));
  });
});
