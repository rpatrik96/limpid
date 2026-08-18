/**
 * @coach/engine — the deterministic prose analyzer.
 *
 * A faithful TypeScript port of research-agora/scripts/writing_verify.py: same
 * word lists, passive pattern, Flesch–Kincaid + vowel-group syllable counter,
 * abbreviation-protected sentence splitter, sentence-length stats / CV / monotony.
 * Unlike the Python script, every finding carries character spans into the input
 * text so the panel can highlight the extracted prose (Hemingway-style).
 *
 * Pure: no vscode, no fs, no network. Input is already-extracted prose.
 */

import type {
  AnalyzeFn,
  EngineResult,
  Finding,
  Metrics,
  ReadabilityMetrics,
  Span,
} from "@coach/contract";

import {
  splitSentences,
  tokenizeWords,
  countSyllables,
  fleschKincaid,
  fleschReadingEase,
} from "./text.js";
import { sentenceStats } from "./metrics.js";
import {
  findWords,
  findPhrases,
  findAdverbs,
  findUndefinedAcronyms,
  isPassive,
  passiveMatch,
  startsWithWeak,
  meanSubjectVerbDistance,
  type Match,
} from "./detectors.js";
import {
  FILLER_WORDS,
  FILLER_PHRASES,
  HEDGE_WORDS,
  HEDGE_PHRASES,
  BOOSTER_WORDS,
  WEAK_OPENERS,
} from "./wordlists.js";

// Re-export the pure helpers so consumers (and tests) can use them directly.
export {
  splitSentences,
  tokenizeWords,
  countWords,
  countSyllables,
  fleschKincaid,
  fleschReadingEase,
} from "./text.js";
export { sentenceStats, monotony } from "./metrics.js";
export {
  findWords,
  findPhrases,
  findAdverbs,
  findUndefinedAcronyms,
  isPassive,
  passiveMatch,
  startsWithWeak,
} from "./detectors.js";
export * from "./wordlists.js";
export type { SentenceSpan, WordToken } from "./text.js";

/** Threshold above which the adverb-overuse doc-level finding fires (per 100w). */
const ADVERB_OVERUSE_THRESHOLD = 4;

const span = (start: number, end: number): Span => ({ start, end });

/**
 * Analyze already-extracted prose into deterministic metrics + findings.
 */
export const analyze: AnalyzeFn = (text: string): EngineResult => {
  const sentences = splitSentences(text);
  const words = tokenizeWords(text);
  const wordCount = words.length;
  const per100 = (n: number): number => (wordCount ? (n / wordCount) * 100 : 0);

  // ── Readability ────────────────────────────────────────────────────────────
  const sentenceTexts = sentences.map((s) => s.text);
  const totalSyll = words.reduce((a, w) => a + countSyllables(w.text), 0);
  const readability: ReadabilityMetrics = {
    fleschKincaidGrade: fleschKincaid(sentenceTexts),
    fleschReadingEase: fleschReadingEase(sentenceTexts),
    avgSentenceLength: sentences.length ? wordCount / sentences.length : 0,
    avgSyllablesPerWord: wordCount ? totalSyll / wordCount : 0,
  };

  // ── Sentence stats ───────────────────────────────────────────────────────────
  const stats = sentenceStats(sentences);

  // ── Lexical detectors (with spans) ───────────────────────────────────────────
  const fillerWordHits = findWords(text, FILLER_WORDS);
  const fillerPhraseHits = findPhrases(text, FILLER_PHRASES);
  const hedgeWordHits = findWords(text, HEDGE_WORDS);
  const hedgePhraseHits = findPhrases(text, HEDGE_PHRASES);
  const boosterHits = findWords(text, BOOSTER_WORDS);
  const adverbHits = findAdverbs(text);

  const fillerCount = fillerWordHits.length + fillerPhraseHits.length;
  const hedgeCount = hedgeWordHits.length + hedgePhraseHits.length;
  const boosterCount = boosterHits.length;
  const adverbCount = adverbHits.length;

  // ── Passive (per sentence, heuristic) ────────────────────────────────────────
  const passiveSentences: { sentence: (typeof sentences)[number]; span: Span }[] = [];
  for (const s of sentences) {
    if (!isPassive(s.text)) continue;
    const local = passiveMatch(s.text);
    const sp = local ? span(s.start + local.start, s.start + local.end) : span(s.start, s.end);
    passiveSentences.push({ sentence: s, span: sp });
  }
  const passiveFraction = sentences.length ? passiveSentences.length / sentences.length : 0;

  // ── Weak openers ─────────────────────────────────────────────────────────────
  const weakOpeners: { sentence: (typeof sentences)[number]; opener: string }[] = [];
  for (const s of sentences) {
    const opener = startsWithWeak(s.text, WEAK_OPENERS);
    if (opener) weakOpeners.push({ sentence: s, opener });
  }

  // ── Undefined acronyms ───────────────────────────────────────────────────────
  const { undefinedUses, undefinedAcronyms } = findUndefinedAcronyms(text);

  // ── Metrics ──────────────────────────────────────────────────────────────────
  const svDistance = meanSubjectVerbDistance(sentences);
  const metrics: Metrics = {
    wordCount,
    sentenceStats: stats,
    readability,
    fillerDensity: per100(fillerCount),
    hedgeDensity: per100(hedgeCount),
    boosterDensity: per100(boosterCount),
    adverbDensity: per100(adverbCount),
    passiveFraction,
    weakOpenerCount: weakOpeners.length,
    undefinedAcronyms,
    ...(svDistance !== undefined ? { subjectVerbDistance: svDistance } : {}),
  };

  // ── Findings ─────────────────────────────────────────────────────────────────
  const findings: Finding[] = [];

  // Filler words (deterministic).
  for (const h of fillerWordHits) {
    findings.push({
      ruleId: "orwell.cut-needless-words",
      category: "precision",
      method: "deterministic",
      severity: "suggestion",
      message: `Filler word "${h.text}" adds no information.`,
      why: "Empty intensifiers and discourse fillers dilute the claim without changing its meaning.",
      suggestion: `Delete "${h.text}" or replace it with a precise word.`,
      spans: [span(h.start, h.end)],
      source:
        "Orwell, Politics and the English Language (1946); Strunk, The Elements of Style (1918)",
      confidence: 1,
    });
  }

  // Filler phrases (deterministic).
  for (const h of fillerPhraseHits) {
    findings.push({
      ruleId: "strunk.omit-needless-words",
      category: "precision",
      method: "deterministic",
      severity: "suggestion",
      message: `Wordy phrase "${h.text}".`,
      why: "Throat-clearing phrases delay the sentence's content and signal low information density.",
      suggestion:
        h.text.toLowerCase() === "in order to"
          ? 'Replace "in order to" with "to".'
          : `Cut "${h.text}" — the sentence stands without it.`,
      spans: [span(h.start, h.end)],
      source: "Strunk, The Elements of Style (1918), Rule 13 / 4th ed. 17: Omit needless words",
      confidence: 1,
    });
  }

  // Weak openers (deterministic).
  for (const w of weakOpeners) {
    findings.push({
      ruleId: "strunk.expletive-openers",
      patternName: "Weak Opener",
      category: "clarity",
      method: "deterministic",
      severity: "suggestion",
      message: `Sentence opens with the expletive/weak construction "${w.opener}".`,
      why: 'Expletive openers ("It is…", "There is…") bury the subject and postpone the verb, weakening the sentence.',
      suggestion: "Lead with the real subject and an active verb.",
      spans: [span(w.sentence.start, w.sentence.end)],
      source: "Strunk, The Elements of Style (1918), Rule 13 / 4th ed. 17: Omit needless words",
      confidence: 0.9,
    });
  }

  // Passive (heuristic, low confidence).
  for (const p of passiveSentences) {
    findings.push({
      ruleId: "orwell.active-voice",
      patternName: "Passive Voice",
      category: "clarity",
      method: "heuristic",
      severity: "suggestion",
      message: "Possible passive construction.",
      why: "Passive voice hides the agent and adds words; prefer the active voice unless the agent genuinely doesn't matter.",
      suggestion: "Name the actor and use an active verb, unless the passive is deliberate.",
      spans: [p.span],
      source: "Orwell, Politics and the English Language (1946)",
      confidence: 0.6,
    });
  }

  // Adverb overuse (heuristic, doc-level + per-token spans).
  if (per100(adverbCount) > ADVERB_OVERUSE_THRESHOLD && adverbHits.length > 0) {
    findings.push({
      ruleId: "writersdiet.adjectives",
      patternName: "Adverb Overuse",
      category: "precision",
      method: "heuristic",
      severity: "suggestion",
      message: `High adverb density (${per100(adverbCount).toFixed(1)} per 100 words).`,
      why: "A pile-up of -ly adverbs often props up weak verbs; a stronger verb usually carries the meaning alone.",
      suggestion: "Replace adverb+verb pairs with one precise verb where possible.",
      spans: adverbHits.map((h: Match) => span(h.start, h.end)),
      source:
        "Strunk, The Elements of Style (1918), Rule 12 / 4th ed. 16: Use definite, specific, concrete language",
      confidence: 0.6,
    });
  }

  // Undefined acronyms (deterministic — definite once we see use-before-definition).
  for (const u of undefinedUses) {
    findings.push({
      ruleId: "economist.acronym-penalty",
      patternName: "Undefined Acronym",
      category: "accessibility",
      method: "deterministic",
      severity: "warning",
      message: `Acronym "${u.acronym}" is used before it is defined.`,
      why: "An undefined acronym is a jargon cliff: a reader who doesn't already know it stalls at first use.",
      suggestion: `Expand "${u.acronym}" on first use, e.g. "Full Name (${u.acronym})".`,
      spans: [span(u.start, u.end)],
      source: "Academic writing convention; Economist Style Guide",
      confidence: 0.85,
    });
  }

  return { metrics, findings };
};
