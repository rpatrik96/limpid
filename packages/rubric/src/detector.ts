/**
 * Run a {@link RuleDetector} against text and return matches with spans. Pure —
 * powers the "Test Rule" playground and is a step toward unifying the engine's
 * built-in word lists with the rubric's declared detectors.
 */
import type { RuleDetector } from "@coach/contract";

import { isSafeUserRegex } from "./userRules.js";

export interface DetectorMatch {
  start: number;
  end: number;
  text: string;
}

/**
 * Cap the input a user regex runs against. `matchRegex` is the only path that
 * runs an arbitrary (possibly user-authored) pattern, and JS regex is
 * synchronous — a pathological pattern on long input hangs the host. Built-in
 * word/phrase/opener detectors compile fixed, escaped alternations and are safe,
 * but they funnel through `matchRegex` too, so the cap is generous.
 */
export const MAX_REGEX_INPUT_LENGTH = 200_000;

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function runDetector(detector: RuleDetector, text: string): DetectorMatch[] {
  switch (detector.kind) {
    case "words":
      return matchAlternation(
        detector.words.map((w) => `\\b${escapeRegExp(w)}\\b`),
        text,
      );
    case "phrases":
      return matchAlternation(detector.phrases.map(escapeRegExp), text);
    case "regex":
      // Only the user-regex path runs an arbitrary pattern. Reject ReDoS-shaped
      // / over-long patterns up front (fail soft) so it can never hang the host,
      // and bound the input the regex scans.
      if (!isSafeUserRegex(detector.pattern)) return [];
      return matchRegex(detector.pattern, detector.flags, text.slice(0, MAX_REGEX_INPUT_LENGTH));
    case "opener":
      return matchOpeners(detector.prefixes, text);
    default:
      return [];
  }
}

function matchAlternation(parts: string[], text: string): DetectorMatch[] {
  const nonEmpty = parts.filter((p) => p.length > 0);
  if (nonEmpty.length === 0) return [];
  return matchRegex(`(?:${nonEmpty.join("|")})`, "gi", text);
}

function matchRegex(pattern: string, flags: string | undefined, text: string): DetectorMatch[] {
  let re: RegExp;
  try {
    re = new RegExp(pattern, ensureGlobal(flags));
  } catch {
    return []; // invalid user regex — fail soft
  }
  const out: DetectorMatch[] = [];
  let m: RegExpExecArray | null;
  let guard = 0;
  while ((m = re.exec(text)) !== null) {
    const matched = m[0];
    if (matched === undefined || matched.length === 0) {
      re.lastIndex++;
      continue;
    }
    out.push({ start: m.index, end: m.index + matched.length, text: matched });
    if (++guard > 10_000) break;
  }
  return out;
}

function ensureGlobal(flags: string | undefined): string {
  const f = flags ?? "gi";
  return f.includes("g") ? f : f + "g";
}

function matchOpeners(prefixes: string[], text: string): DetectorMatch[] {
  const lower = prefixes.map((p) => p.toLowerCase()).filter((p) => p.length > 0);
  if (lower.length === 0) return [];

  // Sentence starts: index 0, and after each sentence-ending punctuation + space.
  const starts: number[] = [0];
  const re = /[.!?]\s+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) starts.push(m.index + m[0].length);

  const out: DetectorMatch[] = [];
  for (const start of starts) {
    const lowerRest = text.slice(start).toLowerCase();
    for (const p of lower) {
      if (lowerRest.startsWith(p)) {
        out.push({ start, end: start + p.length, text: text.slice(start, start + p.length) });
        break;
      }
    }
  }
  return out;
}
