/**
 * Best-effort map of an extracted-prose span back to a range in the raw source —
 * for inline editor diagnostics. Format-agnostic: it depends only on the
 * {@link Extraction}'s coarse per-line source map, so it works for any extractor
 * (LaTeX or Markdown). The extractor normalizes whitespace and drops markup, so an
 * exact offset doesn't survive; instead we anchor on the source map and then match
 * the snippet whitespace-tolerantly (the source may wrap/indent differently).
 * Returns `null` when the snippet can't be located (e.g. it was a stripped
 * placeholder) — the caller skips that finding.
 *
 * Pure: no `vscode`, no I/O.
 */
import type { Extraction, Span } from "@coach/contract";

import { escapeRegExp, lineStartOffsets } from "./buildSections.js";

/** A regex that matches the snippet's tokens separated by arbitrary whitespace. */
function snippetRegex(snippet: string): RegExp | null {
  const tokens = snippet.split(/\s+/).filter(Boolean).map(escapeRegExp);
  if (tokens.length === 0) return null;
  try {
    return new RegExp(tokens.join("\\s+"), "g");
  } catch {
    return null;
  }
}

export function locateSpanInSource(
  source: string,
  extraction: Extraction,
  span: Span,
): Span | null {
  const snippet = extraction.text.slice(span.start, span.end).trim();
  if (snippet.length < 2) return null;

  // Anchor on the largest source-map entry whose textOffset <= span.start.
  let approxLine = 1;
  for (const e of extraction.sourceMap) {
    if (e.textOffset <= span.start) approxLine = e.sourceLine;
    else break;
  }
  const starts = lineStartOffsets(source);
  const from = starts[approxLine - 1] ?? 0;

  const re = snippetRegex(snippet);
  if (!re) return null;

  re.lastIndex = Math.min(from, source.length);
  let m = re.exec(source);
  if (!m) {
    re.lastIndex = 0;
    m = re.exec(source);
  }
  const matched = m?.[0];
  if (!m || matched === undefined || matched.length === 0) return null;
  return { start: m.index, end: m.index + matched.length };
}
