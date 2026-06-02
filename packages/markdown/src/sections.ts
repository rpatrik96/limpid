/**
 * Locate Markdown sectioning units (ATX `#`…`######` and single-line setext
 * headings) in the RAW source, with SOURCE offsets — powering "Coach a section…".
 * A heading's span runs to the next heading of the same-or-higher level, so an `h1`
 * includes its nested `h2`/`h3`. Title classification + the shared {@link SourceSection}
 * shape live in `@coach/extract-core`.
 */
import { classifyTitle, type SourceSection } from "@coach/extract-core";

import { lineStartOffsets, scanStructure } from "./strip.js";

export { classifyTitle };
export type { SourceSection };

export function findSourceSections(md: string): SourceSection[] {
  const { headings } = scanStructure(md);
  if (headings.length === 0) return [];
  const lineStart = lineStartOffsets(md);

  const out: SourceSection[] = [];
  for (let k = 0; k < headings.length; k++) {
    const h = headings[k]!;
    const start = lineStart[h.line] ?? 0;
    let end = md.length;
    for (let j = k + 1; j < headings.length; j++) {
      if (headings[j]!.level <= h.level) {
        end = lineStart[headings[j]!.line] ?? md.length;
        break;
      }
    }
    out.push({
      title: h.title,
      kind: classifyTitle(h.title),
      command: `h${h.level}`,
      level: h.level,
      start,
      end,
    });
  }
  return out;
}
