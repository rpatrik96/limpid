/**
 * Shared, format-agnostic assembly of extracted prose into an {@link Extraction}.
 *
 * Both @coach/latex and @coach/markdown share this pipeline. Each format provides:
 *   1. preprocessed source lines — comments / non-prose blocks already removed, each
 *      tagged with its 1-based source line;
 *   2. section markers detected on those lines (heading line index + title + kind);
 *   3. a per-line `transformInline` that strips that format's inline markup.
 * This module joins the cleaned lines, collapses blank runs, records a coarse
 * monotonic source map, and computes section ranges + proseRatio — identically for
 * every format. The only format-specific step inside the loop is `transformInline`.
 *
 * Pure: no `vscode`, no network, no `fs`.
 */
import type { Extraction, ExtractedSection, SectionKind, SourceMapEntry } from "@coach/contract";

/** A physical source line carried through stripping with its 1-based line number. */
export interface SourceLine {
  text: string;
  /** 1-based line number in the original source this content came from. */
  sourceLine: number;
}

/** A section heading detected on the preprocessed lines (before inline stripping). */
export interface SectionMarker {
  /** index into the preprocessed line array. */
  lineIndex: number;
  kind: SectionKind;
  title: string;
  sourceLine: number;
}

/** Count non-whitespace characters — the unit for `proseRatio`. */
export function nonSpaceChars(s: string): number {
  let n = 0;
  for (const ch of s) {
    if (!/\s/.test(ch)) n++;
  }
  return n;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Assemble cleaned prose + a coarse source map + section ranges from preprocessed
 * lines and markers. `transformInline` strips the format's inline markup per line;
 * `inputNonSpace` is the non-space char count of the ORIGINAL source (for proseRatio).
 */
export function assembleExtraction(
  lines: SourceLine[],
  markers: SectionMarker[],
  transformInline: (line: string) => string,
  inputNonSpace: number,
): Extraction {
  const markerByLine = new Map<number, SectionMarker>();
  for (const m of markers) markerByLine.set(m.lineIndex, m);

  // Assemble cleaned text, collapsing blank-line runs, recording a monotonic source
  // map (one entry per retained boundary) and per-section start offsets.
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
      // Newline after a heading so the body starts on its own line.
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
  const sections = buildSections(markers, sectionStartOffset, finalText);

  const outputNonSpace = nonSpaceChars(finalText);
  const proseRatio = inputNonSpace === 0 ? 0 : clamp01(outputNonSpace / inputNonSpace);

  // Ensure at least a single anchoring source-map entry when there is any text.
  if (sourceMap.length === 0 && finalText.length > 0 && (lines[0]?.sourceLine ?? 0) > 0) {
    sourceMap.push({ textOffset: 0, sourceLine: lines[0]?.sourceLine ?? 1 });
  }

  return { text: finalText, sections, sourceMap, proseRatio };
}

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

/**
 * Turn ordered markers into {@link ExtractedSection}s. A section's range runs from
 * its start offset to the next section's start (or end of text).
 */
function buildSections(
  markers: SectionMarker[],
  startOffset: Map<number, number>,
  text: string,
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
  return sections;
}

function clampOffset(offset: number | undefined, len: number): number {
  if (offset == null) return len;
  return Math.min(Math.max(offset, 0), len);
}
