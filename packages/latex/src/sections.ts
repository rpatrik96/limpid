/**
 * Map a sectioning title (or the abstract environment) to a {@link SectionKind}.
 *
 * Ported in spirit from the `SECTION_PATTERNS` table in
 * `research-agora/scripts/writing_verify.py`, generalized to the contract's kinds.
 */
import type { SectionKind } from "@coach/contract";

/** Ordered (regex → kind); first match wins so "related work" beats "work". */
const TITLE_RULES: { re: RegExp; kind: SectionKind }[] = [
  { re: /\brelated\s+work\b|\bprior\s+work\b|\bbackground\b|\bliterature\b/i, kind: "related" },
  { re: /\bintroduction\b|\bintro\b/i, kind: "introduction" },
  {
    re: /\bmethod(?:s|ology)?\b|\bapproach\b|\bmodel\b|\barchitecture\b|\bframework\b|\bpreliminaries\b|\bsetup\b/i,
    kind: "methods",
  },
  {
    re: /\bresult(?:s)?\b|\bexperiment(?:s|al)?\b|\bevaluation\b|\bablation(?:s)?\b|\bempirical\b/i,
    kind: "results",
  },
  {
    re: /\bdiscussion\b|\bconclusion(?:s)?\b|\blimitation(?:s)?\b|\bfuture\s+work\b|\bbroader\s+impact\b/i,
    kind: "discussion",
  },
  { re: /\bproof\b|\bderivation\b|\blemma\b|\btheorem\b|\bappendix\b/i, kind: "proof" },
  { re: /\babstract\b/i, kind: "abstract" },
];

/** Classify a (already markup-stripped) section title into a SectionKind. */
export function classifyTitle(title: string): SectionKind {
  for (const { re, kind } of TITLE_RULES) {
    if (re.test(title)) return kind;
  }
  return "unknown";
}

/** A sectioning unit located in the RAW .tex source (offsets index into it). */
export interface SourceSection {
  title: string;
  kind: SectionKind;
  /** sectioning command, e.g. "section", "subsection", "abstract". */
  command: string;
  /** nesting depth: part 0 … subparagraph 6 (abstract treated as 2). */
  level: number;
  /** source offset of the heading (or `\begin{abstract}`). */
  start: number;
  /** source offset where the unit ends (exclusive). */
  end: number;
}

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
