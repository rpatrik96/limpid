/**
 * Pick the extractor + section-finder for a document by its kind. Markdown files
 * (by language id, or a `.md`/`.markdown`/`.mdx` opened as plaintext) use
 * @coach/markdown — headings (`#`…`######`, setext) drive sectioning; everything
 * else (LaTeX, plain prose) uses @coach/latex. The rest of the host stays
 * format-agnostic: it just calls `fmt.extract` / `fmt.findSourceSections`.
 */
import type * as vscode from "vscode";

import type { ExtractFn } from "@coach/contract";
import type { SourceSection } from "@coach/latex";
import { extract as extractTex, findSourceSections as findTexSections } from "@coach/latex";
import { extract as extractMd, findSourceSections as findMdSections } from "@coach/markdown";

export interface DocFormat {
  extract: ExtractFn;
  findSourceSections: (source: string) => SourceSection[];
  /** Human label for the "no sections found" message. */
  sectionNoun: string;
}

export const MARKDOWN_LANGS = new Set(["markdown", "mdx", "quarto", "rmd"]);
const MARKDOWN_EXT = /\.(md|markdown|mdx|qmd|rmd)$/i;

/** True when the document should be treated as Markdown. */
export function isMarkdown(doc: vscode.TextDocument): boolean {
  if (MARKDOWN_LANGS.has(doc.languageId)) return true;
  // A .md opened as plaintext (no Markdown grammar installed) still extracts as Markdown.
  return doc.languageId === "plaintext" && MARKDOWN_EXT.test(doc.uri.fsPath);
}

export function formatFor(doc: vscode.TextDocument): DocFormat {
  if (isMarkdown(doc)) {
    return {
      extract: extractMd,
      findSourceSections: findMdSections,
      sectionNoun: "Markdown heading",
    };
  }
  return {
    extract: extractTex,
    findSourceSections: findTexSections,
    sectionNoun: "\\section/\\subsection",
  };
}
