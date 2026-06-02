/**
 * The engine's lexicon.
 *
 * The canonical word/phrase lists (filler, hedge, booster, weak-opener, …) live
 * ONCE in `@coach/rubric` — the documented "canon as data" — and the engine
 * imports and re-exports them here so there is a single source of truth. The
 * lists that are purely engine-internal mechanics (irregular participles for the
 * passive heuristic, be-verbs, the -ly adverb stoplist) stay local.
 */

export {
  FILLER_WORDS,
  FILLER_PHRASES,
  HEDGE_WORDS,
  HEDGE_PHRASES,
  BOOSTER_WORDS,
  WEAK_OPENERS,
} from "@coach/rubric";

/**
 * Irregular past participles for the passive heuristic.
 * Ported verbatim from PASSIVE_PATTERN's alternation in writing_verify.py.
 */
export const IRREGULAR_PARTICIPLES: readonly string[] = [
  "written",
  "given",
  "taken",
  "driven",
  "spoken",
  "chosen",
  "known",
  "shown",
  "grown",
  "drawn",
  "thrown",
  "blown",
  "sewn",
  "done",
  "gone",
  "run",
  "seen",
  "eaten",
  "come",
  "become",
  "gotten",
  "set",
  "put",
  "cut",
  "hit",
  "let",
  "built",
  "sent",
  "spent",
  "left",
  "lost",
  "found",
  "kept",
  "thought",
  "brought",
  "bought",
  "taught",
  "caught",
  "fought",
  "sought",
  "held",
  "told",
  "sold",
  "read",
  "heard",
  "stood",
  "understood",
  "met",
  "begun",
  "broken",
  "fallen",
  "forgotten",
  "hidden",
  "risen",
  "shaken",
  "stolen",
  "woken",
  "worn",
  "wound",
  "bound",
  "fed",
  "fled",
  "hung",
  "led",
  "lit",
  "paid",
  "said",
  "sat",
  "shot",
  "slid",
  "slung",
  "spun",
  "stung",
  "struck",
  "stuck",
  "swum",
  "swung",
  "torn",
  "woven",
];

/** Be-verbs that head a passive construction. */
export const BE_VERBS: readonly string[] = ["is", "are", "was", "were", "be", "been", "being"];

/**
 * Adverb stoplist: tokens ending in "-ly" that are NOT adverbs (or are common
 * false positives we never want to flag). Lowercased.
 */
export const ADVERB_STOPLIST: ReadonlySet<string> = new Set([
  "only",
  "family",
  "apply",
  "reply",
  "supply",
  "early",
  "likely",
  "italy",
  "holy",
  "ally",
  "rally",
  "fully",
  "duly",
  "imply",
  "comply",
  "multiply",
  "anomaly",
  "assembly",
  "monopoly",
  "panoply",
  "wholly",
  "ugly",
  "jelly",
  "belly",
  "folly",
  "bully",
  "dolly",
  "rely",
  "july",
  "lily",
  "lonely",
  "friendly",
  "unlikely",
]);

/**
 * Common all-caps English words and tokens that are NOT undefined acronyms.
 * The acronym detector skips these so a stress-marked word ("NOT"), a section
 * heading token ("METHODS"), or a settled initialism ("IID") is not flagged as
 * a jargon cliff. Lowercased lookups; stored upper-case for readability.
 */
export const ACRONYM_STOPLIST: ReadonlySet<string> = new Set([
  // Common all-caps English / discourse words people write for emphasis.
  "A",
  "I",
  "OK",
  "NOT",
  "AND",
  "OR",
  "BUT",
  "THE",
  "ALL",
  "ANY",
  "YES",
  "NO",
  "TODO",
  "FIXME",
  "NOTE",
  "WARNING",
  // Section-heading tokens (a lone all-caps heading is not a jargon cliff).
  "ABSTRACT",
  "INTRODUCTION",
  "METHODS",
  "METHOD",
  "RESULTS",
  "DISCUSSION",
  "CONCLUSION",
  "CONCLUSIONS",
  "RELATED",
  "WORK",
  "BACKGROUND",
  "APPENDIX",
  "REFERENCES",
  "ACKNOWLEDGMENTS",
  "ACKNOWLEDGEMENTS",
  // Settled initialisms a reader does not need spelled out.
  "IID",
  "OK",
]);
