/**
 * @coach/latex — deterministic `.tex` → extracted prose with a coarse source map.
 *
 * Pure package: no `vscode`, no network, no `fs`. Implements {@link ExtractFn} from
 * `@coach/contract`. Spans returned in {@link Extraction} are character offsets into
 * the *extracted prose* (`Extraction.text`), never the raw `.tex` — per the contract.
 *
 * Pipeline (the prose assembly + source map are shared via `@coach/extract-core`):
 *   1. `preprocessLines`    — strip comments, drop non-prose block environments,
 *                             keep each surviving line's original 1-based source line.
 *   2. `detectMarkers`      — find `\section{…}` / `\begin{abstract}` on those lines.
 *   3. `assembleExtraction` — apply `transformInline` per line, join, collapse blank
 *                             runs, and record section ranges + a monotonic source map.
 */
import type { ExtractFn, Extraction } from "@coach/contract";
import {
  assembleExtraction,
  classifyTitle,
  locateSpanInSource,
  nonSpaceChars,
  type SectionMarker,
} from "@coach/extract-core";

import { preprocessLines, transformInline, type SourceLine } from "./strip.js";

export { preprocessLines, transformInline, stripComment, type SourceLine } from "./strip.js";
export { findSourceSections } from "./sections.js";
export type { SourceSection } from "./sections.js";
export { classifyTitle, locateSpanInSource };

const SECTION_CMD_RE =
  /\\(?:section|subsection|subsubsection|paragraph)\*?\s*\{((?:[^{}]|\{[^{}]*\})*)\}/;
const ABSTRACT_BEGIN_RE = /\\begin\s*\{abstract\}/;

/** Strip control sequences from a raw title so the stored `title` reads as prose. */
function cleanTitle(raw: string): string {
  return raw
    .replace(/\\[a-zA-Z]+\*?\s*(?:\[[^\]]*\])?\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g, "$1")
    .replace(/\\[a-zA-Z@]+\*?/g, "")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Detect section markers on the preprocessed lines. We look at the *pre-inline*
 * line text so the `\section{…}` / `\begin{abstract}` syntax is still intact.
 */
function detectMarkers(lines: SourceLine[]): SectionMarker[] {
  const markers: SectionMarker[] = [];
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln) continue;
    const sec = SECTION_CMD_RE.exec(ln.text);
    if (sec) {
      const title = cleanTitle(sec[1] ?? "");
      markers.push({ lineIndex: i, kind: classifyTitle(title), title, sourceLine: ln.sourceLine });
      continue;
    }
    if (ABSTRACT_BEGIN_RE.test(ln.text)) {
      markers.push({
        lineIndex: i,
        kind: "abstract",
        title: "Abstract",
        sourceLine: ln.sourceLine,
      });
    }
  }
  return markers;
}

export const extract: ExtractFn = (tex: string): Extraction => {
  const lines = preprocessLines(tex);
  const markers = detectMarkers(lines);
  return assembleExtraction(lines, markers, transformInline, nonSpaceChars(tex));
};
