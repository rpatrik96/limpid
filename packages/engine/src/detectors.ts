/**
 * Span-producing detectors. Each returns matches as half-open [start, end)
 * offsets into the input text, so findings can highlight the extracted prose.
 *
 * The passive and adverb detectors carry the false-positive guards the contract
 * demands: copular "is + adjective" is NOT passive; "-ly" stoplist words and
 * non-adverb "-ly"-ending nouns (only, family, …) are NOT adverbs.
 */

import { ADVERB_STOPLIST, BE_VERBS, IRREGULAR_PARTICIPLES } from "./wordlists.js";
import type { SentenceSpan } from "./text.js";

export interface Match {
  start: number;
  end: number;
  text: string;
}

// ── Filler / hedge / booster words (single tokens, word-boundary, case-insensitive)

/** Find every whole-word occurrence of any term in `words`, with spans. */
export function findWords(text: string, words: readonly string[]): Match[] {
  if (words.length === 0) return [];
  const alt = words
    .map(escapeRegExp)
    .sort((a, b) => b.length - a.length)
    .join("|");
  const re = new RegExp(`\\b(?:${alt})\\b`, "gi");
  const out: Match[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
  }
  return out;
}

/** Find every occurrence of any phrase (substring, case-insensitive), with spans. */
export function findPhrases(text: string, phrases: readonly string[]): Match[] {
  if (phrases.length === 0) return [];
  // Longest first so "it is important to note that" wins over "it is".
  const alt = phrases
    .map(escapeRegExp)
    .sort((a, b) => b.length - a.length)
    .join("|");
  const re = new RegExp(`(?:${alt})`, "gi");
  const out: Match[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
  }
  return out;
}

// ── Passive voice (heuristic) ────────────────────────────────────────────────

const PARTICIPLE_ALT = "(?:\\w+ed|" + IRREGULAR_PARTICIPLES.map(escapeRegExp).join("|") + ")";

/**
 * Passive pattern, ported from PASSIVE_PATTERN:
 *   be-verb + up to 3 intervening words + past participle (regular -ed or an
 *   irregular). The {0,3} filler words let "was being carefully reviewed" match.
 *
 * Guard against copular "is/are/was + adjective": when there is NO intervening
 * word, the token after the be-verb must itself look like a participle. The
 * regex already requires a participle there; the false-positive risk is an
 * adjective that happens to end in -ed ("is important" never matches, but
 * "is interested" could). We accept the Python heuristic's recall and keep the
 * confidence low (~0.6). The explicit test "The result is important." → NOT
 * passive holds because "important" is not -ed and not in the irregular list.
 */
const PASSIVE_RE = new RegExp(
  "\\b(?:" + BE_VERBS.join("|") + ")\\s+(?:\\w+\\s+){0,3}" + PARTICIPLE_ALT + "\\b",
  "i",
);

const PASSIVE_RE_GLOBAL = new RegExp(PASSIVE_RE.source, "gi");

/** True if the sentence matches the passive heuristic. */
export function isPassive(sentence: string): boolean {
  PASSIVE_RE.lastIndex = 0;
  return PASSIVE_RE.test(sentence);
}

/**
 * Locate the passive construction within a sentence (for span highlighting).
 * Returns the [start, end) of the match relative to the sentence, or null.
 */
export function passiveMatch(sentence: string): { start: number; end: number } | null {
  PASSIVE_RE_GLOBAL.lastIndex = 0;
  const m = PASSIVE_RE_GLOBAL.exec(sentence);
  if (!m) return null;
  return { start: m.index, end: m.index + m[0].length };
}

// ── Weak openers ─────────────────────────────────────────────────────────────

/** True if the (trimmed, lowercased) sentence starts with a weak opener. */
export function startsWithWeak(sentence: string, openers: readonly string[]): string | null {
  const low = sentence.trimStart().toLowerCase();
  for (const w of openers) {
    if (low.startsWith(w)) return w;
  }
  return null;
}

// ── Adverbs (-ly minus stoplist) ─────────────────────────────────────────────

/**
 * Adverb scan: tokens ending in "-ly", minus the stoplist and minus terms-of-art
 * that merely end in "-ly". A token is an adverb candidate only if stripping
 * "ly" leaves a plausible stem (length ≥ 2). Terms like "optimization" and
 * "distribution" never end in "-ly", so they are excluded by construction; the
 * stoplist removes "only/family/apply/reply/supply/early/likely/italy/holy/…".
 */
export function findAdverbs(text: string): Match[] {
  const re = /[a-zA-Z]+ly\b/g;
  const out: Match[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const tok = m[0];
    const low = tok.toLowerCase();
    if (ADVERB_STOPLIST.has(low)) continue;
    // Need a real stem before "ly" (avoid bare "ly", and 1-char stems).
    if (tok.length < 4) continue;
    out.push({ start: m.index, end: m.index + tok.length, text: tok });
  }
  return out;
}

// ── Undefined acronyms ───────────────────────────────────────────────────────

export interface AcronymUse {
  acronym: string;
  start: number;
  end: number;
}

/**
 * Scan for /\b[A-Z]{2,}\b/ acronyms. A "Word Word (AB)" pattern is a definition:
 * the acronym is considered defined at and after that position. Flag any
 * acronym USED before its first definition.
 *
 * Returns { undefinedUses, undefinedAcronyms } where undefinedAcronyms is the
 * unique, first-seen-ordered list of acronyms used before definition.
 */
export function findUndefinedAcronyms(text: string): {
  undefinedUses: AcronymUse[];
  undefinedAcronyms: string[];
} {
  // 1. Locate definitions: a parenthesized all-caps token preceded by ≥1 words
  //    whose initials cover the acronym (loosened to "≥2 capitalized-ish words").
  //    We record the offset of each defined acronym's FIRST definition.
  const definedAt = new Map<string, number>();
  const defRe = /\b((?:[A-Za-z][A-Za-z-]*\s+){1,}?)\(([A-Z]{2,})\)/g;
  let dm: RegExpExecArray | null;
  while ((dm = defRe.exec(text)) !== null) {
    const acro = dm[2]!;
    const at = dm.index + dm[0].indexOf("(" + acro);
    if (!definedAt.has(acro)) definedAt.set(acro, at);
  }

  // 2. Walk every acronym occurrence; flag uses before the definition offset.
  const useRe = /\b[A-Z]{2,}\b/g;
  const undefinedUses: AcronymUse[] = [];
  const seen = new Set<string>();
  const order: string[] = [];
  let um: RegExpExecArray | null;
  while ((um = useRe.exec(text)) !== null) {
    const acro = um[0];
    const at = um.index;
    const defAt = definedAt.get(acro);
    // The token that sits inside the definition parens (the defining occurrence)
    // is at defAt + 1; never flag the definition itself or anything at/after it.
    if (defAt !== undefined && at >= defAt) continue;
    undefinedUses.push({ acronym: acro, start: at, end: at + acro.length });
    if (!seen.has(acro)) {
      seen.add(acro);
      order.push(acro);
    }
  }
  return { undefinedUses, undefinedAcronyms: order };
}

// ── subject→verb distance (rough heuristic) ──────────────────────────────────

/**
 * Rough mean subject→verb token distance: for each sentence, find the first
 * be-verb / common auxiliary and report how many word tokens precede it. This is
 * a coarse proxy for "buried verb" and is intentionally cheap and noisy.
 */
export function meanSubjectVerbDistance(sentences: SentenceSpan[]): number | undefined {
  const verbSet = new Set([...BE_VERBS, "has", "have", "had", "does", "do", "did"]);
  const distances: number[] = [];
  for (const s of sentences) {
    const tokens = s.text.match(/[a-zA-Z']+/g);
    if (!tokens) continue;
    const idx = tokens.findIndex((t) => verbSet.has(t.toLowerCase()));
    if (idx > 0) distances.push(idx);
  }
  if (distances.length === 0) return undefined;
  return distances.reduce((a, b) => a + b, 0) / distances.length;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
