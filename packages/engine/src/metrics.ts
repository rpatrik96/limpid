/**
 * Sentence-length statistics and monotony, ported from analyze_document /
 * monotony_score in writing_verify.py.
 */

import type { SentenceStats } from "@coach/contract";
import type { SentenceSpan } from "./text.js";
import { countWords } from "./text.js";

/**
 * Monotony score in [0, 1], ported verbatim from monotony_score:
 *   bucket each length S(<12) / M(12..25) / L(>25); combine the longest same-
 *   bucket run with the fraction of adjacent same-bucket pairs (50/50 blend).
 * Higher = more monotonous rhythm.
 */
export function monotony(lengths: number[]): number {
  if (lengths.length < 2) return 0;
  const buckets = lengths.map((n) => (n < 12 ? "S" : n <= 25 ? "M" : "L"));
  let maxRun = 1;
  let cur = 1;
  for (let i = 1; i < buckets.length; i++) {
    if (buckets[i] === buckets[i - 1]) {
      cur += 1;
      if (cur > maxRun) maxRun = cur;
    } else {
      cur = 1;
    }
  }
  let samePairs = 0;
  for (let i = 1; i < buckets.length; i++) {
    if (buckets[i] === buckets[i - 1]) samePairs += 1;
  }
  const pairRatio = samePairs / (buckets.length - 1);
  const runScore = Math.min(1, (maxRun - 1) / Math.max(1, lengths.length - 1));
  return 0.5 * runScore + 0.5 * pairRatio;
}

/**
 * Sentence-length distribution stats. Buckets follow the contract
 * (short ≤ 14, long ≥ 30, medium between), while long/veryLong counts follow
 * the Python thresholds (> 40 / > 60). Population std (÷ n), as in the script.
 */
export function sentenceStats(sentences: SentenceSpan[]): SentenceStats {
  const lengths = sentences.map((s) => countWords(s.text));
  const count = lengths.length;
  if (count === 0) {
    return {
      count: 0,
      meanWords: 0,
      stdWords: 0,
      cv: 0,
      longCount: 0,
      veryLongCount: 0,
      buckets: { short: 0, medium: 0, long: 0 },
      monotony: 0,
    };
  }
  const total = lengths.reduce((a, b) => a + b, 0);
  const mean = total / count;
  const variance = lengths.reduce((a, n) => a + (n - mean) ** 2, 0) / count;
  const std = Math.sqrt(variance);
  const cv = mean ? std / mean : 0;

  let longCount = 0;
  let veryLongCount = 0;
  let short = 0;
  let medium = 0;
  let long = 0;
  for (const n of lengths) {
    if (n > 40) longCount += 1;
    if (n > 60) veryLongCount += 1;
    if (n <= 14) short += 1;
    else if (n >= 30) long += 1;
    else medium += 1;
  }

  return {
    count,
    meanWords: mean,
    stdWords: std,
    cv,
    longCount,
    veryLongCount,
    buckets: { short, medium, long },
    monotony: monotony(lengths),
  };
}
