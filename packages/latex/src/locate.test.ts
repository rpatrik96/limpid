import { describe, expect, it } from "vitest";

import { extract } from "./index.js";
import { locateSpanInSource } from "./locate.js";

const TEX = String.raw`\section{Introduction}
It is important to note that the model
was performed by us.`;

describe("locateSpanInSource", () => {
  it("maps an extracted word back to its source range", () => {
    const ex = extract(TEX);
    const idx = ex.text.indexOf("important");
    const r = locateSpanInSource(TEX, ex, { start: idx, end: idx + "important".length });
    expect(r).not.toBeNull();
    expect(TEX.slice(r!.start, r!.end)).toBe("important");
  });

  it("matches a phrase that wraps across a newline in the source", () => {
    const ex = extract(TEX);
    // The source has "the model\nwas"; extraction collapsed it to one line.
    const phrase = "the model was";
    const idx = ex.text.indexOf(phrase);
    expect(idx).toBeGreaterThanOrEqual(0);
    const r = locateSpanInSource(TEX, ex, { start: idx, end: idx + phrase.length });
    expect(r).not.toBeNull();
    expect(TEX.slice(r!.start, r!.end).replace(/\s+/g, " ")).toBe("the model was");
  });

  it("returns null for a too-short or unlocatable snippet", () => {
    const ex = extract("Hello world.");
    expect(locateSpanInSource("Hello world.", ex, { start: 0, end: 1 })).toBeNull();
    expect(locateSpanInSource("Hello world.", ex, { start: 0, end: 5 })).not.toBeNull();
  });
});
