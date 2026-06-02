/**
 * @coach/markdown — deterministic Markdown → extracted prose with a coarse source map.
 *
 * Pure package: no `vscode`, no network, no `fs`. Implements {@link ExtractFn} from
 * `@coach/contract`; spans returned in {@link Extraction} are offsets into the
 * *extracted prose* (`Extraction.text`), never the raw Markdown. Mirrors @coach/latex:
 *
 *   1. `scanStructure`      — classify lines (frontmatter, fences, tables, HTML, HRs)
 *                             and locate ATX/setext headings.
 *   2. build lines+markers  — one line per physical line (dropped → blank); headings
 *                             become section markers aligned by line index.
 *   3. `assembleExtraction` — apply `transformInline` per line, join, collapse blanks,
 *                             record section ranges + a monotonic source map.
 */
import type { ExtractFn, Extraction } from "@coach/contract";
import {
  assembleExtraction,
  classifyTitle,
  locateSpanInSource,
  nonSpaceChars,
  type SectionMarker,
} from "@coach/extract-core";

import {
  blankHtmlComments,
  scanStructure,
  splitLines,
  transformInline,
  type Heading,
} from "./strip.js";

export {
  preprocessLines,
  transformInline,
  scanStructure,
  splitLines,
  blankHtmlComments,
} from "./strip.js";
export type { SourceLine, Heading, Structure } from "./strip.js";
export { findSourceSections } from "./sections.js";
export type { SourceSection } from "./sections.js";
export { classifyTitle, locateSpanInSource };

/** Markdown headings → section markers (lineIndex aligns with the per-line array). */
function detectMarkers(headings: Heading[]): SectionMarker[] {
  return headings.map((h) => ({
    lineIndex: h.line,
    kind: classifyTitle(h.title),
    title: h.title,
    sourceLine: h.line + 1,
  }));
}

export const extract: ExtractFn = (md: string): Extraction => {
  const { drop, headings } = scanStructure(md);
  // Same normalization as scanStructure so `drop` aligns with these lines.
  const raw = splitLines(blankHtmlComments(md));
  const lines = raw.map((text, i) => ({ text: drop[i] ? "" : text, sourceLine: i + 1 }));
  const markers = detectMarkers(headings);
  return assembleExtraction(lines, markers, transformInline, nonSpaceChars(md));
};
