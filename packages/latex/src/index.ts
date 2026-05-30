/**
 * @coach/latex — deterministic `.tex` → extracted prose with a coarse source map.
 *
 * Pure package: no `vscode`, no network, no `fs`. Implements {@link ExtractFn} from
 * `@coach/contract`. Spans returned in {@link Extraction} are character offsets into
 * the *extracted prose* (`Extraction.text`), never the raw `.tex` — per the contract.
 *
 * Pipeline:
 *   1. `preprocessLines`  — strip comments, drop non-prose block environments,
 *                           keep each surviving line's original 1-based source line.
 *   2. `transformInline`  — per-line markup stripping (math/cite/ref/sectioning/…).
 *   3. assemble           — join cleaned lines, collapse blank runs, and in one pass
 *                           record section ranges + a monotonic source map.
 */
import type {
  ExtractFn,
  Extraction,
  ExtractedSection,
  SectionKind,
  SourceMapEntry,
} from "@coach/contract";

import { classifyTitle } from "./sections.js";
import {
  preprocessLines,
  stripComment,
  transformInline,
  type SourceLine,
} from "./strip.js";

export {
  preprocessLines,
  transformInline,
  stripComment,
  type SourceLine,
} from "./strip.js";
export { classifyTitle } from "./sections.js";

/** A sectioning command line we detected before inline-stripping mangled it. */
interface SectionMarker {
  /** index into the preprocessed (comment-free) line array. */
  lineIndex: number;
  kind: SectionKind;
  title: string;
  sourceLine: number;
}

const SECTION_CMD_RE =
  /\\(?:section|subsection|subsubsection|paragraph)\*?\s*\{((?:[^{}]|\{[^{}]*\})*)\}/;
const ABSTRACT_BEGIN_RE = /\\begin\s*\{abstract\}/;

/** Count non-whitespace characters — the unit for `proseRatio`. */
function nonSpaceChars(s: string): number {
  let n = 0;
  for (const ch of s) {
    if (!/\s/.test(ch)) n++;
  }
  return n;
}

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
      markers.push({ lineIndex: i, kind: "abstract", title: "Abstract", sourceLine: ln.sourceLine });
    }
  }
  return markers;
}

export const extract: ExtractFn = (tex: string): Extraction => {
  const inputNonSpace = nonSpaceChars(tex);

  // Phase 1: comment + block-environment removal, line-aware.
  const lines = preprocessLines(tex);
  const markers = detectMarkers(lines);
  const markerByLine = new Map<number, SectionMarker>();
  for (const m of markers) markerByLine.set(m.lineIndex, m);

  // Phase 2 + 3: assemble cleaned text, collapsing blank-line runs, recording a
  // monotonic source map (one entry per retained boundary) and section start offsets.
  const pieces: string[] = [];
  const sourceMap: SourceMapEntry[] = [];
  /** offset (into the joined text) where each marker's content begins. */
  const sectionStartOffset = new Map<number, number>();

  let offset = 0; // running length of the assembled text
  let lastSourceLine = -1; // de-duplicate consecutive identical source lines in the map
  let pendingBlank = false; // collapse runs of blank lines into a single separator
  let wroteAny = false;

  const pushSourceMapEntry = (textOffset: number, sourceLine: number): void => {
    // Keep the list MONOTONIC in both fields. Never emit a regression.
    const last = sourceMap[sourceMap.length - 1];
    if (last && (textOffset < last.textOffset || sourceLine < last.sourceLine)) return;
    if (last && textOffset === last.textOffset && sourceLine === last.sourceLine) return;
    sourceMap.push({ textOffset, sourceLine });
  };

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln) continue;

    const marker = markerByLine.get(i);
    if (marker) {
      // A section boundary forces a paragraph break before its content.
      if (wroteAny) {
        pieces.push("\n\n");
        offset += 2;
        pendingBlank = false;
      }
      const cleaned = transformInline(ln.text);
      const content = cleaned.length > 0 ? cleaned : marker.title;
      sectionStartOffset.set(i, offset);
      pushSourceMapEntry(offset, ln.sourceLine);
      pieces.push(content);
      offset += content.length;
      // Newline after a section title so the body starts on its own line.
      pieces.push("\n");
      offset += 1;
      wroteAny = true;
      lastSourceLine = ln.sourceLine;
      continue;
    }

    const cleaned = transformInline(ln.text);
    if (cleaned.length === 0) {
      // Blank (or fully-stripped) line → mark a pending paragraph separator.
      if (wroteAny) pendingBlank = true;
      continue;
    }

    if (pendingBlank && wroteAny) {
      pieces.push("\n\n");
      offset += 2;
      pendingBlank = false;
    } else if (wroteAny) {
      pieces.push(" ");
      offset += 1;
    }

    if (ln.sourceLine !== lastSourceLine) {
      pushSourceMapEntry(offset, ln.sourceLine);
      lastSourceLine = ln.sourceLine;
    }
    pieces.push(cleaned);
    offset += cleaned.length;
    wroteAny = true;
  }

  let text = pieces.join("");
  // Final whitespace normalization: trim trailing space, collapse 3+ newlines.
  const trimmedRight = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  if (trimmedRight !== text) {
    text = trimmedRight;
    // Offsets shifted only by removals at/after the change points; for a COARSE map
    // we re-clamp every entry to stay within bounds and monotonic.
    clampSourceMap(sourceMap, text.length);
  }
  const finalText = text.trim();
  // Trimming the head can shift offsets by the leading-whitespace count; re-clamp.
  if (finalText.length !== text.length) {
    const headTrim = text.length - text.trimStart().length;
    for (const e of sourceMap) e.textOffset = Math.max(0, e.textOffset - headTrim);
    clampSourceMap(sourceMap, finalText.length);
  }

  // Build sections with ranges into the FINAL text.
  const sections = buildSections(markers, sectionStartOffset, finalText, lines);

  const outputNonSpace = nonSpaceChars(finalText);
  const proseRatio = inputNonSpace === 0 ? 0 : clamp01(outputNonSpace / inputNonSpace);

  // Ensure at least a single anchoring source-map entry when there is any text.
  if (sourceMap.length === 0 && finalText.length > 0 && (lines[0]?.sourceLine ?? 0) > 0) {
    sourceMap.push({ textOffset: 0, sourceLine: lines[0]?.sourceLine ?? 1 });
  }

  return { text: finalText, sections, sourceMap, proseRatio };
};

/** Keep every map entry within [0, len] and non-decreasing in textOffset. */
function clampSourceMap(map: SourceMapEntry[], len: number): void {
  let prevOffset = 0;
  let prevLine = 0;
  for (const e of map) {
    e.textOffset = Math.min(Math.max(e.textOffset, prevOffset), len);
    e.sourceLine = Math.max(e.sourceLine, prevLine);
    prevOffset = e.textOffset;
    prevLine = e.sourceLine;
  }
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Turn ordered markers into {@link ExtractedSection}s. A section's range runs from
 * its start offset to the next section's start (or end of text).
 */
function buildSections(
  markers: SectionMarker[],
  startOffset: Map<number, number>,
  text: string,
  lines: SourceLine[],
): ExtractedSection[] {
  const sections: ExtractedSection[] = [];
  const ordered = [...markers].sort((a, b) => a.lineIndex - b.lineIndex);
  for (let k = 0; k < ordered.length; k++) {
    const m = ordered[k];
    if (!m) continue;
    const start = clampOffset(startOffset.get(m.lineIndex), text.length);
    const nextMarker = ordered[k + 1];
    const end =
      nextMarker != null
        ? clampOffset(startOffset.get(nextMarker.lineIndex), text.length)
        : text.length;
    sections.push({
      kind: m.kind,
      title: m.title || undefined,
      range: { start, end: Math.max(start, end) },
      sourceLineStart: m.sourceLine,
    });
  }
  void lines; // retained for signature symmetry / future exact mapping
  return sections;
}

function clampOffset(offset: number | undefined, len: number): number {
  if (offset == null) return len;
  return Math.min(Math.max(offset, 0), len);
}
