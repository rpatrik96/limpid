/**
 * The canonical word/phrase lexicon — the rubric is the documented "canon as
 * data", so the lists live here ONCE and the engine imports them. Ported
 * faithfully from research-agora/scripts/writing_verify.py; structural lists
 * (clichés, hype, boosters) extend the canon along the axes the engine's metrics
 * track. Keep these in sync with the Python source where they overlap.
 *
 * Detector kinds that consume these:
 *   words   — whole-word match (engine/detector add \b boundaries)
 *   phrases — substring match, lowercased
 *   opener  — sentence-initial prefix match
 */

/** Filler words (single tokens), matched on word boundaries, case-insensitive. */
export const FILLER_WORDS: readonly string[] = [
  "basically",
  "simply",
  "just",
  "actually",
  "really",
  "very",
  "quite",
  "rather",
  "somewhat",
  "perhaps",
  "fairly",
  "literally",
  "essentially",
  "obviously",
  "clearly",
  "certainly",
  "definitely",
  "practically",
];

/** Multi-word filler phrases, matched as substrings (longest first to avoid nesting). */
export const FILLER_PHRASES: readonly string[] = [
  "in order to",
  "it should be noted that",
  "it is important to note that",
  "it is worth noting that",
  "as a matter of fact",
  "it goes without saying",
  "needless to say",
  "at the end of the day",
  "for all intents and purposes",
  "in the final analysis",
  "it can be seen that",
  "as we all know",
  "it is well known that",
  "it is interesting to note that",
];

/** Hedge words — these soften conviction (the engine reports density; the coach judges). */
export const HEDGE_WORDS: readonly string[] = [
  "might",
  "may",
  "could",
  "possibly",
  "potentially",
  "perhaps",
  "seemingly",
  "apparently",
  "arguably",
  "presumably",
  "conceivably",
  "likely",
  "unlikely",
  "probable",
  "plausible",
];

export const HEDGE_PHRASES: readonly string[] = [
  "to some extent",
  "in some cases",
  "it is possible that",
  "it seems that",
  "it appears that",
  "we believe that",
  "it is likely that",
  "we feel that",
  "one might argue",
  "it could be argued",
  "there is reason to believe",
];

/** Weak sentence openers (prefix match on the lowercased, trimmed sentence). */
export const WEAK_OPENERS: readonly string[] = [
  "it is",
  "it was",
  "there is",
  "there are",
  "there was",
  "there were",
  "it has been",
  "it should be noted",
  "it is important",
  "it is worth",
  "it is interesting",
  "it can be seen",
  "as we all know",
  "as is well known",
];

/**
 * Booster words — the conviction-inflating mirror image of hedges. Empty
 * intensifiers that assert importance instead of demonstrating it. One
 * reconciled, single-token list (multi-word boosters that overlapped the filler
 * and cliché lists, e.g. "needless to say", live there). Matched whole-word.
 */
export const BOOSTER_WORDS: readonly string[] = [
  "clearly",
  "obviously",
  "evidently",
  "undoubtedly",
  "undeniably",
  "unquestionably",
  "indisputably",
  "certainly",
  "definitely",
  "surely",
  "naturally",
  "absolutely",
  "always",
  "never",
  "completely",
  "totally",
  "entirely",
  "extremely",
  "highly",
  "vastly",
  "significantly",
];

/** Marketing adjectives papers should demonstrate, not assert. */
export const HYPE_WORDS: readonly string[] = [
  "novel",
  "powerful",
  "revolutionary",
  "groundbreaking",
  "cutting-edge",
  "state-of-the-art",
  "seminal",
  "remarkable",
  "significant",
  "tremendous",
];

/** Dead metaphors / clichés (substring match, lowercased). */
export const CLICHES: readonly string[] = [
  "paradigm shift",
  "low-hanging fruit",
  "the tip of the iceberg",
  "a double-edged sword",
  "at the end of the day",
  "think outside the box",
  "push the envelope",
  "move the needle",
  "in this day and age",
  "last but not least",
  "the elephant in the room",
  "a perfect storm",
  "boils down to",
  "when all is said and done",
];
