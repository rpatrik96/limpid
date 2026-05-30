/**
 * @coach/rubric — the writing canon encoded as DATA.
 *
 * A pure, side-effect-free package: it imports types from @coach/contract and
 * exports a single `RubricConfig` value, `defaultRubric`. No vscode, no network,
 * no fs at runtime (AGENTS.md hard rule). The coach consumes this to score prose
 * and surface findings; the rubric itself makes no judgments — it is the canon.
 *
 * Grounding for the rules and structural sources lives in the markdown notes
 * under `sources/` (strunk-white.md, gopen-swan.md), referenced from each rule's
 * `source` field.
 */
import type { RubricConfig } from "@coach/contract";

import { dimensions } from "./dimensions.js";
import { thresholds } from "./thresholds.js";
import { rules } from "./rules.js";
import { patterns } from "./patterns.js";
import { voiceGuards } from "./voiceGuards.js";
import { gradeBands } from "./gradeBands.js";

export const defaultRubric: RubricConfig = {
  dimensions,
  thresholds,
  rules,
  patterns,
  voiceGuards,
  gradeBands,
};

export { dimensions, thresholds, rules, patterns, voiceGuards, gradeBands };
