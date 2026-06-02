import type { SectionKind } from "@coach/contract";

/**
 * A sectioning unit located in the RAW source (offsets index into it), powering
 * "Coach a section…". Shared shape across formats: LaTeX `\section`/`\subsection`/
 * `abstract`, or Markdown `h1`…`h6`.
 */
export interface SourceSection {
  title: string;
  kind: SectionKind;
  /** sectioning token: LaTeX "section"/"subsection"/"abstract", Markdown "h1".."h6". */
  command: string;
  /** nesting depth — smaller is higher-level (e.g. LaTeX section=2, Markdown h1=1). */
  level: number;
  /** source offset of the heading start. */
  start: number;
  /** source offset where the unit ends (exclusive). */
  end: number;
}
