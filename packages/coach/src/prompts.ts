/**
 * Prompt construction for the LLM judgment layer.
 *
 * The coach feeds the model the EXTRACTED PROSE plus the deterministic findings
 * as evidence, and asks for a single JSON object covering the four lenses and a
 * named-pattern diagnosis. The system prompt fixes the voice contract (keep the
 * author's em-dashes / colon-payoffs / scope-hedging) so the model does not
 * "correct" the signature style the rubric's guards protect.
 *
 * Pure: builds strings only. No I/O, no network.
 */
import type {
  DiagnosisPattern,
  EngineResult,
  Finding,
  LMRequest,
  SectionThresholds,
} from "@coach/contract";

export interface PromptContext {
  /** the extracted prose the model judges (spans index into THIS string). */
  text: string;
  engine: EngineResult;
  patterns: DiagnosisPattern[];
  /** user-supplied audience, or undefined to make the model infer it. */
  audience?: string;
  /** the resolved section threshold (for the altitude / accessibility frame). */
  threshold?: SectionThresholds;
  /** soften the ask when extraction confidence is low (math-heavy prose). */
  lowProseConfidence?: boolean;
}

const SYSTEM = `You are a writing coach for academic machine-learning prose. You judge structure and reader experience — the things a script cannot measure — and you TEACH, never rewrite wholesale.

Voice contract (do NOT violate):
- KEEP the author's signature moves: em-dash interpolations, colon-then-payoff constructions, and long clause-stacking THAT RESOLVES CLEANLY on first read. The test for an over-long sentence is the Economist's "must it be read twice?", not raw word count.
- Scope-hedging is a virtue ("sufficient but not necessary", "under mild assumptions", "on the benchmarks we tested"). Conviction-hedging is a fault ("arguably", "it could be argued", "we believe that"). Flag only conviction-hedging.
- Do not impose a single house style. Diagnose structural failures that cost the reader comprehension.

Output ONLY a single JSON object. No prose outside it, no markdown fences. All character offsets ("start"/"end") index into the ANALYZED TEXT exactly as provided.`;

/** Render the deterministic findings compactly as evidence for the model. */
function renderEvidence(findings: Finding[]): string {
  if (findings.length === 0) return "(no deterministic findings)";
  const lines = findings.slice(0, 40).map((f) => {
    const where =
      f.spans.length > 0 && f.spans[0]
        ? `@${f.spans[0].start}-${f.spans[0].end}`
        : "@doc";
    return `- [${f.category}/${f.severity}] ${f.ruleId} ${where}: ${f.message}`;
  });
  const more = findings.length > 40 ? `\n… and ${findings.length - 40} more.` : "";
  return lines.join("\n") + more;
}

/** Render the named patterns the model may diagnose (id + one-line definition). */
function renderPatterns(patterns: DiagnosisPattern[]): string {
  return patterns
    .map((p) => `- ${p.id} (${p.name}): ${p.definition}`)
    .join("\n");
}

function renderMetrics(engine: EngineResult): string {
  const m = engine.metrics;
  return [
    `words=${m.wordCount}`,
    `sentences=${m.sentenceStats.count}`,
    `fk=${m.readability.fleschKincaidGrade.toFixed(1)}`,
    `avgSentLen=${m.readability.avgSentenceLength.toFixed(1)}`,
    `passiveFraction=${m.passiveFraction.toFixed(2)}`,
    `hedge/100w=${m.hedgeDensity.toFixed(2)}`,
    `filler/100w=${m.fillerDensity.toFixed(2)}`,
    `cv=${m.sentenceStats.cv.toFixed(2)}`,
    `monotony=${m.sentenceStats.monotony.toFixed(2)}`,
  ].join(", ");
}

/** The JSON schema sketch the model must fill (kept terse but unambiguous). */
const SCHEMA_HINT = `Return JSON of EXACTLY this shape:
{
  "stressTopic":   [{"message": str, "why": str, "suggestion": str, "before": str, "after": str, "spans": [{"start": int, "end": int}], "severity": "info|suggestion|warning|error"}],
  "cohesion":      [ ... same item shape ... ],
  "altitude":      {"assumedAudience": str, "inferred": bool, "verdict": str, "signals": [str]},
  "argumentFlow":  [ ... same item shape ... ],
  "patterns":      [{"id": "<one of the pattern ids above>", "evidence": str, "before": str, "after": str, "spans": [{"start": int, "end": int}], "severity": str}],
  "precisionScore": <number 1..10>
}
Every array may be empty. "before"/"after"/"spans"/"signals" are optional. "precisionScore" and "altitude" are REQUIRED.`;

/** One worked example to steer adherence on weaker models (shape, not content). */
const EXAMPLE = `EXAMPLE (illustrative — copy the SHAPE, not the content; use pattern ids from the list above):
{"stressTopic":[{"message":"The sentence trails off into 'in this paper'; the contribution should land last.","why":"The stress position (sentence end) carries the new, important idea.","spans":[{"start":0,"end":24}],"severity":"warning"}],"cohesion":[],"altitude":{"assumedAudience":"ML reviewer","inferred":true,"verdict":"appropriately pitched for a reviewer","signals":["uses 'loss' without defining it"]},"argumentFlow":[{"message":"Buried lede: the key idea appears in sentence 3.","why":"Readers decide whether to continue from the first sentence.","severity":"warning"}],"patterns":[{"id":"buried-lede","evidence":"main idea is in the third sentence"}],"precisionScore":6}`;

/**
 * Build the {@link LMRequest} for the single-call lens pass.
 * `json: true` asks adapters that support it for raw JSON; the coach validates
 * regardless, so a provider that ignores the flag still works.
 */
export function buildLensRequest(ctx: PromptContext): LMRequest {
  const audienceClause = ctx.audience
    ? `The target reader is GIVEN as: "${ctx.audience}". Judge over/under-explanation against THAT reader. Set "inferred": false and echo this audience in "assumedAudience".`
    : `The target reader is NOT given. INFER it from the text (topic, jargon, what is and isn't explained), then judge over/under-explanation against that inferred reader. Set "inferred": true.`;

  const softenClause = ctx.lowProseConfidence
    ? `\n\nNOTE: extraction confidence is LOW (math-heavy source). Be conservative — only flag issues you are confident survived extraction; prefer lower severities.`
    : "";

  const prompt = `## ANALYZED TEXT (character offsets index into this string)
"""
${ctx.text}
"""

## DETERMINISTIC METRICS
${renderMetrics(ctx.engine)}

## DETERMINISTIC FINDINGS (evidence — already surfaced mechanically; do not repeat verbatim, but you may build on them)
${renderEvidence(ctx.engine.findings)}

## NAMED PATTERNS YOU MAY DIAGNOSE (use the exact id)
${renderPatterns(ctx.patterns)}

## YOUR FOUR LENSES
1. STRESS / TOPIC POSITION (Gopen & Swan): does each sentence put new, important material in the stress position (its end) and known material in the topic position (its start)? Flag sentences that trail off into old/trivial words or open with the unfamiliar.
2. OLD→NEW PARAGRAPH COHESION: does each paragraph open by linking to the previous one (old information) before introducing new material? Flag orphan transitions where the thread breaks.
3. AUDIENCE ALTITUDE: ${audienceClause} Report assumedAudience, inferred, a one-line verdict (e.g. "over-explained for a reviewer" / "jargon cliff for a newcomer"), and the signals that drove it.
4. ARGUMENT FLOW: where is the lede? Flag buried ledes (main point in sentence 3–4), claim–evidence scale mismatches, and assertions presented without evidence in core-claims sections.

Also diagnose any NAMED PATTERNS that apply, by id, with evidence.

Score "precisionScore" 1..10: 10 = every paragraph leads with its claim, claims are backed by specific evidence, terminology is consistent, transitions are logical; 1 = buried ledes throughout, unsupported claims, orphan transitions.${softenClause}

${SCHEMA_HINT}

${EXAMPLE}`;

  return {
    system: SYSTEM,
    prompt,
    json: true,
    temperature: 0.2,
    maxTokens: 2048,
  };
}
