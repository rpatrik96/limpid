/**
 * Run the rubric's detector-backed rules over the analyzed prose and turn each
 * match into a {@link Finding}.
 *
 * The engine ships a fixed set of built-in deterministic checks whose ruleIds
 * are aligned to rubric rule ids (e.g. "orwell.cut-needless-words",
 * "strunk.expletive-openers"). A user editing `.limpid/rules.json` adds NEW
 * detector-backed rules (or overrides existing ones); those must actually change
 * findings / diagnostics / grade, not only show up in the "Test Rule"
 * playground.
 *
 * This helper closes that gap: it runs `runDetector` over every rubric rule that
 * carries a deterministic/heuristic detector and is NOT already represented by a
 * built-in engine ruleId, emitting one finding per match. The engine's own
 * findings stay authoritative for the built-in checks, so existing fixture
 * grades are preserved; only user-added (or non-built-in) rules additionally
 * fire.
 */
import type { Finding, Rule, RubricConfig } from "@coach/contract";
import { runDetector } from "@coach/rubric";

/**
 * RuleIds the engine already emits as built-in deterministic/heuristic findings.
 * A rubric rule with one of these ids is covered by the engine — running its
 * detector again would double-count it (and the engine's version carries richer
 * teaching copy), so we skip it here.
 */
export const BUILTIN_ENGINE_RULE_IDS: ReadonlySet<string> = new Set([
  "orwell.cut-needless-words", // filler words
  "strunk.omit-needless-words", // filler phrases
  "strunk.expletive-openers", // weak openers
  "orwell.active-voice", // passive voice
  "writersdiet.adjectives", // adverb / intensifier overuse
  "economist.acronym-penalty", // undefined acronyms
]);

/** Detector methods we run deterministically (no LLM). */
const SCRIPTABLE_METHODS = new Set(["deterministic", "heuristic", "hybrid"]);

/** True if this rule has a runnable detector and is not a built-in engine check. */
function isAdditionalDetectorRule(rule: Rule): boolean {
  if (!rule.detector) return false;
  if (!SCRIPTABLE_METHODS.has(rule.method)) return false;
  if (BUILTIN_ENGINE_RULE_IDS.has(rule.id)) return false;
  return true;
}

function ruleToFinding(rule: Rule, match: { start: number; end: number; text: string }): Finding {
  const example = rule.examples?.[0];
  const finding: Finding = {
    ruleId: rule.id,
    category: rule.category,
    method: rule.method,
    severity: rule.severity,
    message: `${rule.name}: "${match.text}".`,
    why: rule.rationale,
    spans: [{ start: match.start, end: match.end }],
    source: rule.source,
    // Detector-backed rubric rules are mechanical string matches: high confidence
    // for deterministic word/phrase/opener checks, a touch lower for heuristics.
    confidence: rule.method === "heuristic" ? 0.7 : 0.9,
  };
  if (rule.detector?.kind === "regex") {
    // Surface the matched construct as the pattern name when the rule is a named
    // structural check; otherwise leave it off.
    finding.patternName = rule.name;
  }
  if (example) {
    finding.before = example.before;
    finding.after = example.after;
  }
  return finding;
}

/**
 * Run every additional detector-backed rubric rule over `text`, returning the
 * findings they fire. Pure: no LLM, no fs, no network.
 *
 * @param rubric  the (possibly user-merged) rubric whose rules to run.
 * @param text    the analyzed prose (spans index into this string).
 * @param skipIds extra ruleIds to skip (e.g. ids already present in engine
 *                findings), beyond the built-in set.
 */
export function runRubricDetectors(
  rubric: RubricConfig,
  text: string,
  skipIds: ReadonlySet<string> = new Set(),
): Finding[] {
  const out: Finding[] = [];
  for (const rule of rubric.rules) {
    if (!isAdditionalDetectorRule(rule)) continue;
    if (skipIds.has(rule.id)) continue;
    const detector = rule.detector;
    if (!detector) continue;
    for (const match of runDetector(detector, text)) {
      out.push(ruleToFinding(rule, match));
    }
  }
  return out;
}
