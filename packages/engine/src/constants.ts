/**
 * Regex-source constants shared across the engine.
 * Kept separate so word lists and text helpers don't import each other.
 */

/**
 * Abbreviations protected before sentence splitting, ported from `_ABBREV` in
 * writing_verify.py. Each alternative is a token immediately followed by a period;
 * the splitter masks that period so it can't end a sentence.
 */
export const ABBREV_PATTERN_SOURCE =
  "(?:Mr|Mrs|Dr|Prof|Jr|Sr|vs|etc|Fig|Eq|Tab|et\\s+al|i\\.e|e\\.g" +
  "|cf|approx|est|dept|avg|max|min|std|Sec|App|Alg|Def|Thm|Prop|Lem|Cor)\\.";
