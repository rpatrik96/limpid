/**
 * Deterministic LaTeX markup stripping.
 *
 * Ported and extended from `research-agora/scripts/writing_verify.py` (`strip_latex`).
 * The original returned a single cleaned string; here we keep coarse source-line
 * provenance so the extension can do best-effort reveal-in-editor.
 *
 * Strategy: we never run a `re.DOTALL` regex across the whole document (that loses
 * line numbers). Instead we tokenize the input into physical lines, drop non-prose
 * block environments span-aware (tracking which source line each surviving line came
 * from), then apply inline transforms line-by-line. This keeps `sourceLine` exact for
 * every retained newline without an exact char-level map.
 */

/** Environments whose entire body is dropped (replaced by a blank line). */
const DROP_ENVS = [
  // display math
  "equation",
  "align",
  "gather",
  "multline",
  "eqnarray",
  "displaymath",
  "math",
  "flalign",
  "alignat",
  // floats / non-prose blocks
  "figure",
  "figure*",
  "table",
  "table*",
  "tabular",
  "tabularx",
  "algorithm",
  "algorithmic",
  "verbatim",
  "lstlisting",
  "minted",
] as const;

/** A physical line carried through stripping with its 1-based original line number. */
export interface SourceLine {
  text: string;
  /** 1-based line number in the original .tex this content came from. */
  sourceLine: number;
}

const DROP_ENV_SET = new Set<string>(DROP_ENVS);

/**
 * Remove comments (`% … EOL`, but not the escaped `\%`) from a single line.
 * Walks char-by-char so we honour the backslash escape precisely.
 */
export function stripComment(line: string): string {
  let out = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\\") {
      // Keep the escape and the following char verbatim (handles \% \$ \& …).
      out += ch;
      if (i + 1 < line.length) {
        out += line[i + 1];
        i++;
      }
      continue;
    }
    if (ch === "%") break; // start of a comment → drop the rest of the line
    out += ch;
  }
  return out;
}

const BEGIN_RE = /\\begin\s*\{([a-zA-Z*]+)\}/;
const END_RE = /\\end\s*\{([a-zA-Z*]+)\}/;

/**
 * Phase 1 — comment removal + drop of non-prose block environments, line-aware.
 *
 * Returns the surviving lines, each tagged with the source line it originated from.
 * A dropped environment is replaced by a single blank line so paragraph structure
 * around it is preserved (and `\section` adjacency is not glued together).
 */
export function preprocessLines(tex: string): SourceLine[] {
  const rawLines = tex.split("\n");
  const out: SourceLine[] = [];
  // Stack of currently-open dropped environments (handles nesting, e.g. tabular in table).
  const dropStack: string[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const sourceLine = i + 1;
    const line = stripComment(rawLines[i] ?? "");

    if (dropStack.length > 0) {
      // Inside a dropped environment: scan only for nested begins/ends to balance.
      scanEnvTransitions(line, dropStack);
      // Emit nothing for the body; once the outermost env closes we drop a blank.
      if (dropStack.length === 0) {
        out.push({ text: "", sourceLine });
      }
      continue;
    }

    // Not inside a dropped env. Does this line OPEN one?
    const begin = BEGIN_RE.exec(line);
    if (begin && DROP_ENV_SET.has(begin[1] ?? "")) {
      // Push and consume the rest of the line for further nested transitions.
      dropStack.push(begin[1] ?? "");
      const rest = line.slice((begin.index ?? 0) + begin[0].length);
      scanEnvTransitions(rest, dropStack);
      if (dropStack.length === 0) {
        // Single-line environment (\begin{eq}…\end{eq} on one line): drop, emit blank.
        out.push({ text: "", sourceLine });
      }
      continue;
    }

    out.push({ text: line, sourceLine });
  }

  return out;
}

/**
 * Advance the drop-stack across all `\begin{drop-env}` / `\end{…}` markers in a
 * fragment. Only dropped envs are pushed; an `\end` pops when it matches the top.
 */
function scanEnvTransitions(fragment: string, dropStack: string[]): void {
  let s = fragment;
  for (;;) {
    const b = BEGIN_RE.exec(s);
    const e = END_RE.exec(s);
    const bIdx = b ? b.index : Infinity;
    const eIdx = e ? e.index : Infinity;
    if (bIdx === Infinity && eIdx === Infinity) return;

    if (bIdx < eIdx) {
      const name = b?.[1] ?? "";
      if (DROP_ENV_SET.has(name)) dropStack.push(name);
      s = s.slice(bIdx + (b?.[0].length ?? 0));
    } else {
      // an \end — pop only if it closes the current dropped env
      const name = e?.[1] ?? "";
      if (dropStack.length > 0 && dropStack[dropStack.length - 1] === name) {
        dropStack.pop();
      }
      s = s.slice(eIdx + (e?.[0].length ?? 0));
    }
  }
}

const CITE_LIKE =
  /\\(?:cite[a-zA-Z]*|cref|Cref|ref|eqref|autoref|pageref|nameref)\*?\s*(?:\[[^\]]*\])?\s*\{[^}]*\}/g;
const SECTIONING =
  /\\(?:section|subsection|subsubsection|paragraph|subparagraph)\*?\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g;
const ABSTRACT_BEGIN = /\\begin\s*\{abstract\}/g;
const ABSTRACT_END = /\\end\s*\{abstract\}/g;
/**
 * Structural commands whose brace argument is metadata, NOT prose. We drop the
 * command AND its argument(s) so package names / labels / file paths never leak
 * into the extracted text (which would also inflate proseRatio).
 */
const DROP_WITH_ARG =
  /\\(?:documentclass|usepackage|RequirePackage|input|include|includegraphics|bibliography|bibliographystyle|label|hypersetup|usetikzlibrary|newcommand|renewcommand|def|setlength|geometry|graphicspath)\b\*?\s*(?:\[[^\]]*\])?(?:\s*\{(?:[^{}]|\{[^{}]*\})*\})*/g;
/** `\begin{env}` / `\end{env}` markers that survived phase 1 (prose-bearing envs). */
const ENV_DELIM = /\\(?:begin|end)\s*\{[a-zA-Z*]+\}(?:\[[^\]]*\])?/g;
const INLINE_DOLLAR = /\$[^$]*\$/g;
const INLINE_PAREN_MATH = /\\\(.*?\\\)/g;
const DISPLAY_BRACKET_MATH = /\\\[.*?\\\]/g;
/** Text-bearing wrappers whose single argument we keep. */
const UNWRAP =
  /\\(?:textbf|textit|textsc|texttt|textrm|textsf|textmd|textup|emph|underline|uline|mbox|text|mathrm)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g;
/** `\command[opt]{arg}` — keep the argument, drop the command + optional. */
const CMD_WITH_ARG = /\\[a-zA-Z]+\*?\s*(?:\[[^\]]*\])?\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g;
/** A bare command with no brace argument, optionally with a `[opt]`. */
const BARE_CMD = /\\[a-zA-Z@]+\*?(?:\[[^\]]*\])?/g;
/** Unescape the common escaped specials so they read as plain prose. */
const ESCAPED_SPECIAL = /\\([%$&#_{}])/g;

/**
 * Phase 2 — inline transforms applied to a single (comment-free) line.
 * Order matters: citations and sectioning first, then math, then unwrap, then
 * the generic command sweep, last the brace/whitespace cleanup.
 *
 * Section titles are emitted verbatim (just the title text) so they survive as prose.
 */
export function transformInline(line: string): string {
  let t = line;

  // Abstract environment delimiters → drop (the section detector handles the kind).
  t = t.replace(ABSTRACT_BEGIN, " ");
  t = t.replace(ABSTRACT_END, " ");

  // Structural commands whose argument is metadata, not prose → drop entirely.
  t = t.replace(DROP_WITH_ARG, " ");
  // Surviving \begin{env}/\end{env} of prose environments → drop the delimiter only.
  t = t.replace(ENV_DELIM, " ");

  // Citations / references → a single token.
  t = t.replace(CITE_LIKE, "[ref]");

  // Sectioning commands → keep only the title text.
  t = t.replace(SECTIONING, (_m, title: string) => stripInnerCommands(title));

  // Math: display \[..\] and $$..$$ first, then inline.
  t = t.replace(DISPLAY_BRACKET_MATH, " ");
  t = t.replace(/\$\$[^$]*\$\$/g, " ");
  t = t.replace(INLINE_PAREN_MATH, " ");
  t = t.replace(INLINE_DOLLAR, " ");

  // Unwrap text-bearing formatting wrappers (may nest one level): keep the argument.
  for (let pass = 0; pass < 3; pass++) {
    const next = t.replace(UNWRAP, (_m, inner: string) => inner);
    if (next === t) break;
    t = next;
  }

  // Generic `\cmd[opt]{arg}` → keep the arg (drop label/footnote-style? we keep text).
  for (let pass = 0; pass < 3; pass++) {
    const next = t.replace(CMD_WITH_ARG, (_m, inner: string) => ` ${inner} `);
    if (next === t) break;
    t = next;
  }

  // Remaining bare commands (\maketitle, \item, \\ , \noindent, …) → space.
  t = t.replace(/\\\\/g, " ");
  t = t.replace(BARE_CMD, " ");

  // Unescape specials, drop stray braces and ties.
  t = t.replace(ESCAPED_SPECIAL, "$1");
  t = t.replace(/[{}]/g, " ");
  t = t.replace(/~/g, " ");
  t = t.replace(/[ \t]+/g, " ");

  return t.trim();
}

/** Strip leftover control sequences from an extracted section title. */
function stripInnerCommands(title: string): string {
  let s = title;
  s = s.replace(CMD_WITH_ARG, (_m, inner: string) => inner);
  s = s.replace(BARE_CMD, "");
  s = s.replace(/[{}]/g, "");
  s = s.replace(/\s+/g, " ");
  return s.trim();
}
