/**
 * Shared source-section assembly for the format extractors. Both @coach/latex and
 * @coach/markdown locate their own heading set (the format-specific step), then call
 * {@link buildNestedSections} for the common "a heading's span runs to the next
 * heading of the same-or-higher level" rule that powers "Coach a section…".
 *
 * Also exports the small text utilities both extractors share: {@link lineStartOffsets}
 * and {@link escapeRegExp}.
 *
 * Pure: no `vscode`, no network, no `fs`.
 */
import { classifyTitle } from "./classifyTitle.js";
import type { SourceSection } from "./sourceSection.js";

/** A heading located in the RAW source, before its span is computed. */
export interface SourceHead {
  title: string;
  /** sectioning token: LaTeX "section"/"subsection"/"abstract", Markdown "h1".."h6". */
  command: string;
  /** nesting depth — smaller is higher-level (e.g. LaTeX section=2, Markdown h1=1). */
  level: number;
  /** source offset of the heading start. */
  start: number;
  /**
   * Optional explicit end offset (exclusive). When present it overrides the nesting
   * rule — used by the LaTeX abstract, whose span is its `\begin`/`\end` delimiters,
   * not "the next same-or-higher heading".
   */
  end?: number;
}

/**
 * Turn located heads into nested {@link SourceSection}s. A head's span runs to the
 * next head of the same-or-higher level (so a `\section` includes its `\subsection`s,
 * an `h1` its nested `h2`s), or to `sourceLen` when none follows. A head carrying an
 * explicit `end` keeps it. The result is sorted by `start`.
 */
export function buildNestedSections(heads: SourceHead[], sourceLen: number): SourceSection[] {
  const sections: SourceSection[] = heads.map((h, i) => {
    let end = h.end;
    if (end === undefined) {
      end = sourceLen;
      for (let j = i + 1; j < heads.length; j++) {
        const next = heads[j];
        if (next && next.start > h.start && next.level <= h.level) {
          end = next.start;
          break;
        }
      }
    }
    return {
      title: h.title,
      kind: classifyTitle(h.title),
      command: h.command,
      level: h.level,
      start: h.start,
      end,
    };
  });
  sections.sort((a, b) => a.start - b.start);
  return sections;
}

/** Start offset of each line in `source` (index i ⇒ offset of line i+1). */
export function lineStartOffsets(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

/** Escape a string for literal use inside a `RegExp`. */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
