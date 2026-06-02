/**
 * Deterministic Markdown markup stripping, line-aware (mirrors @coach/latex/strip).
 *
 * Strategy: a single structural scan classifies every physical line — frontmatter,
 * fenced code, HTML comments, ATX/setext headings, reference/footnote definitions,
 * horizontal rules, and GFM tables — recording which lines are non-prose (dropped to
 * a blank) and where the headings are. Inline markup (emphasis, links, images, code
 * spans, HTML tags, escapes) is then stripped per line. One emitted line per physical
 * line keeps `sourceLine` exact and lets the shared assembler collapse blank runs.
 *
 * Known limits (documented, not bugs): indented (4-space) code blocks are treated as
 * prose; only single-line setext headings are recognised; deeply nested HTML is
 * stripped tag-by-tag, not parsed.
 *
 * Pure: no `vscode`, no network, no `fs`.
 */
import { lineStartOffsets, type SourceLine } from "@coach/extract-core";

export type { SourceLine };
/** Re-export the shared offset helper so callers inside this package have it locally. */
export { lineStartOffsets };

/** A heading found by {@link scanStructure}: 0-based physical line, level 1–6, title. */
export interface Heading {
  line: number;
  level: number;
  title: string;
}

export interface Structure {
  /** per physical line: true ⇒ non-prose, emit as a blank. */
  drop: boolean[];
  /** ATX + setext headings, in source order. */
  headings: Heading[];
}

const ATX_RE = /^\s{0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const SETEXT_UNDERLINE_RE = /^\s{0,3}(=+|-+)\s*$/;
const HR_RE = /^\s{0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const LIST_RE = /^\s{0,3}([-*+]|\d+[.)])[ \t]+/;
const BLOCKQUOTE_RE = /^\s{0,3}>/;
const REF_DEF_RE = /^\s{0,3}\[[^\]^][^\]]*\]:\s+\S/;
const FOOTNOTE_DEF_RE = /^\s{0,3}\[\^[^\]]+\]:/;
const TABLE_DELIM_RE = /^\s{0,3}\|?[ \t]*:?-{1,}:?[ \t]*(\|[ \t]*:?-{1,}:?[ \t]*)*\|?[ \t]*$/;

/**
 * Split into physical lines, stripping a trailing CR so CRLF files classify like
 * LF ones (the line-anchored regexes end in `[ \t]*$`, which a stray `\r` would
 * break). Line *count* is unchanged, so line indices — and thus source offsets
 * computed from {@link lineStartOffsets} on the ORIGINAL text — stay correct.
 */
export function splitLines(md: string): string[] {
  return md.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
}

/**
 * Replace HTML comment spans (`<!-- … -->`, possibly multi-line) with spaces,
 * preserving every newline so the line count and source offsets are unchanged. This
 * keeps prose BEFORE/AFTER a comment on the same line — unlike dropping the whole
 * line — mirroring how the LaTeX stripper keeps prose before a `%` comment.
 */
export function blankHtmlComments(md: string): string {
  return md.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
}

/** Detect a top-of-document YAML (`---`) / TOML (`+++`) frontmatter block, if any. */
function frontmatterEnd(raw: string[]): number {
  const first = raw[0];
  if (first === undefined || !/^(---|\+\+\+)\s*$/.test(first)) return 0;
  const fence = first.trim();
  for (let j = 1; j < raw.length; j++) {
    if (raw[j]?.trim() === fence) return j + 1; // inclusive of the closing fence
  }
  return 0; // unterminated ⇒ not frontmatter (treat line 0 normally)
}

/** Classify every physical line of `md`: which are non-prose, and where headings are. */
export function scanStructure(md: string): Structure {
  // Comments are blanked first (newline-preserving), so a comment-bearing line keeps
  // its surrounding prose and never reaches classification as `<!--`.
  const raw = splitLines(blankHtmlComments(md));
  const n = raw.length;
  const drop = new Array<boolean>(n).fill(false);
  const headings: Heading[] = [];

  const fmEnd = frontmatterEnd(raw);
  for (let i = 0; i < fmEnd; i++) drop[i] = true;

  let fence: { char: string; len: number } | null = null;

  for (let i = fmEnd; i < n; i++) {
    const line = raw[i] ?? "";

    if (fence) {
      drop[i] = true;
      const close = new RegExp(`^\\s{0,3}\\${fence.char}{${fence.len},}\\s*$`);
      if (close.test(line)) fence = null;
      continue;
    }

    // Opening code fence (``` or ~~~). A backtick info-string may not contain a backtick.
    const fm = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fm && !(fm[1]!.startsWith("`") && fm[2]!.includes("`"))) {
      fence = { char: fm[1]![0]!, len: fm[1]!.length };
      drop[i] = true;
      continue;
    }

    // ATX heading (# … ######). Title is kept; the marker stripping happens inline.
    const atx = ATX_RE.exec(line);
    if (atx) {
      headings.push({ line: i, level: atx[1]!.length, title: (atx[2] ?? "").trim() });
      continue;
    }

    // Link reference / footnote definition → metadata, drop.
    if (REF_DEF_RE.test(line) || FOOTNOTE_DEF_RE.test(line)) {
      drop[i] = true;
      continue;
    }

    // Setext underline for the previous paragraph line (single-line headings only).
    if (i > fmEnd && SETEXT_UNDERLINE_RE.test(line)) {
      const prev = raw[i - 1] ?? "";
      const prevIsParagraph =
        !drop[i - 1] &&
        prev.trim().length > 0 &&
        headings[headings.length - 1]?.line !== i - 1 &&
        !ATX_RE.test(prev) &&
        !LIST_RE.test(prev) &&
        !BLOCKQUOTE_RE.test(prev) &&
        !HR_RE.test(prev);
      if (prevIsParagraph) {
        headings.push({ line: i - 1, level: line.trim()[0] === "=" ? 1 : 2, title: prev.trim() });
        drop[i] = true;
        continue;
      }
    }

    // Horizontal rule.
    if (HR_RE.test(line)) {
      drop[i] = true;
      continue;
    }
  }

  dropTables(raw, drop, headings, fmEnd);
  return { drop, headings };
}

/** Count table cells in a row: unescaped `|` count + 1, less optional outer pipes. */
function columnCount(line: string): number {
  let cells = 1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "|" && line[i - 1] !== "\\") cells++;
  }
  const trimmed = line.trim();
  if (trimmed.startsWith("|")) cells--;
  if (trimmed.endsWith("|") && !trimmed.endsWith("\\|")) cells--;
  return cells;
}

/** Drop GFM table blocks: a delimiter row whose header row above it has the same
 *  column count (≥2). The column-count check stops a lone prose line that happens to
 *  sit above a hand-typed `--- | ---` divider from being swallowed as a table. */
function dropTables(raw: string[], drop: boolean[], headings: Heading[], from: number): void {
  const isHeading = new Set(headings.map((h) => h.line));
  for (let i = from; i < raw.length; i++) {
    if (drop[i]) continue;
    const line = raw[i] ?? "";
    if (!line.includes("|") || !TABLE_DELIM_RE.test(line)) continue;
    const cols = columnCount(line);
    if (cols < 2) continue; // single-column "divider" is not a table
    const prev = i - 1;
    if (prev < from || drop[prev] || isHeading.has(prev) || !(raw[prev] ?? "").includes("|")) {
      continue;
    }
    if (columnCount(raw[prev] ?? "") !== cols) continue; // header/delimiter must agree
    drop[prev] = true; // header row
    drop[i] = true; // delimiter row
    let j = i + 1;
    while (
      j < raw.length &&
      !drop[j] &&
      !isHeading.has(j) &&
      (raw[j] ?? "").trim().length > 0 &&
      (raw[j] ?? "").includes("|")
    ) {
      drop[j] = true; // body row
      j++;
    }
    i = j - 1;
  }
}

// ── Inline stripping ─────────────────────────────────────────────────────────

const ESCAPED_SPECIAL = /\\([\\`*_{}[\]()#+\-.!>~|])/g;

/** Strip inline Markdown from a single (already-classified) line → plain prose. */
export function transformInline(line: string): string {
  let t = line;

  // Leading block markers: blockquote(s), then list marker / task box, then ATX #s.
  t = t.replace(/^\s{0,3}(?:>\s?)+/, "");
  t = t.replace(/^\s{0,3}([-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/, "");
  t = t.replace(/^\s{0,3}#{1,6}(?:[ \t]+|$)/, "").replace(/[ \t]+#+[ \t]*$/, "");

  // Inline code spans → keep the inner text (a code term still counts as a word). The
  // fence may be multiple backticks wrapping a literal backtick; trim one pad space.
  t = t.replace(/(`+)\s?(.+?)\s?\1(?!`)/g, "$2");

  // Images (drop) before links (keep text). The URL matchers allow one level of
  // balanced parens so a `…_(bar)` destination doesn't leak a stray ')'.
  t = t.replace(/!\[[^\]]*\]\((?:[^()]|\([^()]*\))*\)/g, " ");
  t = t.replace(/!\[[^\]]*\]\[[^\]]*\]/g, " ");
  t = t.replace(/\[\^[^\]]+\]/g, " "); // footnote ref
  t = t.replace(/\[([^\]]*)\]\((?:[^()]|\([^()]*\))*\)/g, "$1"); // inline link → text
  t = t.replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1"); // reference link → text

  // Autolinks, an unterminated comment opener, and raw HTML tags → drop. The tag
  // matcher skips quoted attribute values so a '>' inside an attribute can't end it early.
  t = t.replace(/<https?:\/\/[^>\s]+>/gi, " ");
  t = t.replace(/<[^>\s@]+@[^>\s]+>/g, " ");
  t = t.replace(/<!--.*$/, " ");
  t = t.replace(/<\/?[a-zA-Z](?:[^>"']|"[^"]*"|'[^']*')*>/g, " ");

  // Emphasis / strong / strikethrough → inner text. `*` may be intraword; `_` may not.
  for (let pass = 0; pass < 3; pass++) {
    const before = t;
    t = t.replace(/\*\*\*([^*]+?)\*\*\*/g, "$1");
    t = t.replace(/\*\*([^*]+?)\*\*/g, "$1");
    t = t.replace(/\*([^*]+?)\*/g, "$1");
    t = t.replace(/(?<![\w])___([^_]+?)___(?![\w])/g, "$1");
    t = t.replace(/(?<![\w])__([^_]+?)__(?![\w])/g, "$1");
    t = t.replace(/(?<![\w])_([^_]+?)_(?![\w])/g, "$1");
    t = t.replace(/~~([^~]+?)~~/g, "$1");
    if (t === before) break;
  }

  // A line-final hard-break backslash carries no prose — drop it (but not an escaped
  // literal `\\`), before the unescape pass turns escapes into their literal char.
  t = t.replace(/(^|[^\\])\\$/, "$1");

  // Unescape backslash-escaped specials, then normalise whitespace.
  t = t.replace(ESCAPED_SPECIAL, "$1");
  t = t.replace(/[ \t]+/g, " ");
  return t.trim();
}

/** Emit one {@link SourceLine} per physical line; dropped lines become blanks. */
export function preprocessLines(md: string): SourceLine[] {
  const raw = splitLines(blankHtmlComments(md));
  const { drop } = scanStructure(md);
  return raw.map((text, i) => ({ text: drop[i] ? "" : text, sourceLine: i + 1 }));
}
