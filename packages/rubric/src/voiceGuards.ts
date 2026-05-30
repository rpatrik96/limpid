import type { VoiceGuard } from "@coach/contract";

/**
 * Voice guards protect the author's endorsed style from naive Strunk/Hemingway
 * penalties (see AGENTS.md "Voice guardrail"). Each guard names the ruleIds it
 * suppresses or down-weights when its condition holds. The coach consults these
 * before surfacing a finding from a guarded rule.
 *
 * All `suppresses` ids MUST exist in rules.ts (asserted in tests).
 *
 * The author's signature: em-dash interpolations, colon-payoffs, and long
 * clause-stacking *that resolves cleanly*. The operative test for an over-long
 * sentence is the Economist's "must it be read twice?", not raw length. Hedging
 * scope ("sufficient but not necessary") is a virtue; hedging conviction
 * ("arguably", "it could be argued") is a fault.
 */
export const voiceGuards: VoiceGuard[] = [
  {
    id: "guard.clause-stacking-resolves",
    description:
      "Do NOT penalize a long, clause-stacked sentence merely for length. The operative test is the Economist's \"must it be read twice?\": a sentence that resolves cleanly on the first pass is fine, however long. Suppress raw length-based flags (be-verb, preposition, subject-verb-distance, active-voice) and the read-twice warning when the sentence parses on first read; keep them only when it genuinely forces a re-read.",
    suppresses: [
      "economist.read-twice",
      "writersdiet.be-verbs",
      "writersdiet.prepositions",
      "gopen.subject-verb-proximity",
      "orwell.active-voice",
    ],
  },
  {
    id: "guard.scope-hedging-is-a-virtue",
    description:
      "Allow scope-hedging — bounding a claim's reach (\"sufficient but not necessary\", \"under mild assumptions\", \"on the benchmarks we tested\") — while still flagging conviction-hedging (\"arguably\", \"it could be argued\", \"we believe that\") that signals the author doesn't trust the claim. Down-weight hedge findings when the hedge marks scope; keep them when it marks doubt.",
    suppresses: ["voice.hedges", "voice.hedge-phrases"],
  },
  {
    id: "guard.em-dash-and-colon-payoff",
    description:
      "Keep the author's em-dash interpolations (a definition or sharpened point set off mid-sentence) and colon-then-payoff constructions. These are signature moves, not errors. Suppress expletive-opener / be-verb / nominalization flags that fire on the well-formed setup of a colon-payoff or on the interpolated clause of an em-dash pair.",
    suppresses: [
      "strunk.expletive-openers",
      "writersdiet.be-verbs",
      "writersdiet.nominalizations",
    ],
  },
  {
    id: "guard.terms-of-art-are-not-zombies",
    description:
      "Field terms of art that happen to end in -tion/-ment/-ity (\"distribution\", \"optimization\", \"regularization\", \"representation\") are precise vocabulary, not nominalization bloat. Down-weight the nominalization and abstraction flags on established terms of art; keep them on noun phrases that hide a verb the author could use directly (\"the utilization of\").",
    suppresses: ["writersdiet.nominalizations"],
  },
];
