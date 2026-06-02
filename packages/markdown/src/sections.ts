/**
 * Locate Markdown sectioning units (ATX `#`…`######` and single-line setext
 * headings) in the RAW source, with SOURCE offsets — powering "Coach a section…".
 * A heading's span runs to the next heading of the same-or-higher level, so an `h1`
 * includes its nested `h2`/`h3`. Title classification + the shared {@link SourceSection}
 * shape live in `@coach/extract-core`.
 */
import {
  buildNestedSections,
  classifyTitle,
  lineStartOffsets,
  type SourceSection,
} from "@coach/extract-core";

import { scanStructure } from "./strip.js";

export { classifyTitle };
export type { SourceSection };

export function findSourceSections(md: string): SourceSection[] {
  const { headings } = scanStructure(md);
  if (headings.length === 0) return [];
  const lineStart = lineStartOffsets(md);

  // Collect the head set (the Markdown-specific step), then defer the nesting rule
  // to the shared builder.
  const heads = headings.map((h) => ({
    title: h.title,
    command: `h${h.level}`,
    level: h.level,
    start: lineStart[h.line] ?? 0,
  }));
  return buildNestedSections(heads, md.length);
}
