/**
 * Locate sectioning units (`\part`…`\subparagraph` and the abstract environment) in
 * raw `.tex`, with SOURCE offsets — powering "Coach a section…". Title classification
 * and the shared {@link SourceSection} shape live in `@coach/extract-core`.
 */
import { classifyTitle, type SourceSection } from "@coach/extract-core";

export { classifyTitle };
export type { SourceSection };

const LEVELS: Record<string, number> = {
  part: 0,
  chapter: 1,
  section: 2,
  subsection: 3,
  subsubsection: 4,
  paragraph: 5,
  subparagraph: 6,
};

/** Read a `{...}` group starting at `braceIndex` (the `{`); returns inner + next offset. */
function readBracedTitle(tex: string, braceIndex: number): { title: string; after: number } {
  let depth = 0;
  for (let i = braceIndex; i < tex.length; i++) {
    const c = tex[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return { title: tex.slice(braceIndex + 1, i), after: i + 1 };
    }
  }
  return { title: tex.slice(braceIndex + 1), after: tex.length };
}

/**
 * Find sectioning units (\part…\subparagraph and the abstract environment) in raw
 * `.tex`, with SOURCE offsets. A heading's span runs to the next heading of the
 * same-or-higher level, so a \section includes its \subsections; the abstract uses
 * its explicit \begin/\end. Powers "Coach a section…".
 */
export function findSourceSections(tex: string): SourceSection[] {
  const heads: { title: string; command: string; level: number; start: number }[] = [];
  const cmdRe =
    /\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\s*(?:\[[^\]]*\])?\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = cmdRe.exec(tex)) !== null) {
    const command = m[1] ?? "section";
    const braceIndex = cmdRe.lastIndex - 1;
    const { title, after } = readBracedTitle(tex, braceIndex);
    heads.push({ title: title.trim(), command, level: LEVELS[command] ?? 9, start: m.index });
    cmdRe.lastIndex = after;
  }

  const sections: SourceSection[] = [];
  for (let i = 0; i < heads.length; i++) {
    const h = heads[i]!;
    let end = tex.length;
    for (let j = i + 1; j < heads.length; j++) {
      if (heads[j]!.level <= h.level) {
        end = heads[j]!.start;
        break;
      }
    }
    sections.push({
      title: h.title,
      kind: classifyTitle(h.title),
      command: h.command,
      level: h.level,
      start: h.start,
      end,
    });
  }

  const absRe = /\\begin\{abstract\}/g;
  while ((m = absRe.exec(tex)) !== null) {
    const endRe = /\\end\{abstract\}/g;
    endRe.lastIndex = absRe.lastIndex;
    const e = endRe.exec(tex);
    sections.push({
      title: "Abstract",
      kind: "abstract",
      command: "abstract",
      level: 2,
      start: m.index,
      end: e ? e.index + e[0].length : tex.length,
    });
  }

  sections.sort((a, b) => a.start - b.start);
  return sections;
}
