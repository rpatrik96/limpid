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
