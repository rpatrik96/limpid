/**
 * @coach/contract — the shared vocabulary for the writing coach.
 *
 * Every other package compiles against these types. The dependency graph is:
 *
 *   contract  ◄── engine    (deterministic metrics + findings)
 *   contract  ◄── latex     (.tex → extracted prose + coarse source map)
 *   contract  ◄── rubric    (the canon as data: rules, patterns, thresholds, guards)
 *   contract, engine, latex, rubric  ◄── coach   (LLM judgment → CoachReport)
 *   all of the above                 ◄── apps/extension
 *
 * Design rule: spans are offsets into the EXTRACTED prose (Extraction.text),
 * NOT the .tex source. The webview renders the extracted prose and highlights
 * those spans inline, so v1 needs no exact source-offset mapping.
 * A coarse Extraction.sourceMap supports best-effort "reveal in editor".
 */

// ────────────────────────────────────────────────────────────────────────────
// Primitives
// ────────────────────────────────────────────────────────────────────────────

export type Severity = "info" | "suggestion" | "warning" | "error";

/** How a check reaches its verdict. form is scriptable; meaning is not. */
export type CheckMethod = "deterministic" | "heuristic" | "llm" | "hybrid";

/** A half-open [start, end) character span into Extraction.text. */
export interface Span {
  start: number;
  end: number;
}

export type DimensionKey = "accessibility" | "clarity" | "flow" | "precision";

// ────────────────────────────────────────────────────────────────────────────
// Findings — the unit the coach surfaces and the panel renders
// ────────────────────────────────────────────────────────────────────────────

export interface Finding {
  /** Stable id of the rule/check that fired, e.g. "orwell.cut-needless-words". */
  ruleId: string;
  /** Human-facing pattern name when this is a named failure, e.g. "Buried Lede". */
  patternName?: string;
  category: DimensionKey | "voice-guard" | "typography";
  method: CheckMethod;
  severity: Severity;
  /** Short "what" — one line. */
  message: string;
  /** The cognitive reason it fails — the teaching payload. */
  why?: string;
  /** How to fix, in prose. */
  suggestion?: string;
  /** Optional concrete rewrite. */
  before?: string;
  after?: string;
  /** Where in the extracted prose this finding applies (may be empty for doc-level). */
  spans: Span[];
  /** Citation, e.g. "Orwell, Politics and the English Language (1946)". */
  source?: string;
  /** 0..1; lower for heuristic checks with known false-positive tails. */
  confidence?: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Engine output — deterministic metrics
// ────────────────────────────────────────────────────────────────────────────

export interface ReadabilityMetrics {
  fleschKincaidGrade: number;
  fleschReadingEase: number;
  avgSentenceLength: number;
  avgSyllablesPerWord: number;
}

export interface SentenceStats {
  count: number;
  meanWords: number;
  stdWords: number;
  /** coefficient of variation = std / mean; low + long runs ⇒ monotony. */
  cv: number;
  longCount: number; // > 40 words
  veryLongCount: number; // > 60 words
  buckets: { short: number; medium: number; long: number };
  /** 0..1; higher = more monotonous rhythm. */
  monotony: number;
}

export interface Metrics {
  wordCount: number;
  sentenceStats: SentenceStats;
  readability: ReadabilityMetrics;
  /** densities are per 100 words unless noted. */
  fillerDensity: number;
  hedgeDensity: number;
  boosterDensity: number;
  adverbDensity: number;
  /** fraction of sentences flagged passive, 0..1 (heuristic). */
  passiveFraction: number;
  weakOpenerCount: number;
  undefinedAcronyms: string[];
  /** mean subject→verb token distance where computable (heuristic). */
  subjectVerbDistance?: number;
}

export interface EngineResult {
  metrics: Metrics;
  /** deterministic + heuristic findings (filler, passive, weak openers, …). */
  findings: Finding[];
}

/** The engine's public entry point (implemented in @coach/engine). */
export type AnalyzeFn = (text: string) => EngineResult;

// ────────────────────────────────────────────────────────────────────────────
// LaTeX extraction
// ────────────────────────────────────────────────────────────────────────────

export type SectionKind =
  | "abstract"
  | "introduction"
  | "related"
  | "methods"
  | "results"
  | "discussion"
  | "proof"
  | "caption"
  | "unknown";

export interface ExtractedSection {
  kind: SectionKind;
  title?: string;
  /** span into Extraction.text. */
  range: Span;
  /** approximate 1-based source line where this section starts. */
  sourceLineStart?: number;
}

export interface SourceMapEntry {
  /** offset into Extraction.text. */
  textOffset: number;
  /** approximate 1-based line in the original .tex. */
  sourceLine: number;
}

export interface Extraction {
  /** cleaned prose the engine analyzes and the panel renders. */
  text: string;
  sections: ExtractedSection[];
  /** coarse, monotonic map for best-effort reveal-in-editor (may be sparse). */
  sourceMap: SourceMapEntry[];
  /** fraction of the source that survived as prose; low ⇒ math-heavy, low confidence. */
  proseRatio: number;
}

/** The latex package's public entry point (implemented in @coach/latex). */
export type ExtractFn = (tex: string) => Extraction;

// ────────────────────────────────────────────────────────────────────────────
// Rubric — the canon as data (editable markdown/JSON later)
// ────────────────────────────────────────────────────────────────────────────

export type RuleDetector =
  | { kind: "words"; words: string[] }
  | { kind: "phrases"; phrases: string[] }
  | { kind: "regex"; pattern: string; flags?: string }
  | { kind: "opener"; prefixes: string[] };

export interface Rule {
  id: string;
  name: string;
  category: DimensionKey | "voice-guard" | "typography";
  /** citation grounding the rule. */
  source: string;
  method: CheckMethod;
  severity: Severity;
  /** the teaching "why". */
  rationale: string;
  detector?: RuleDetector;
  examples?: { before: string; after: string }[];
}

/** One of the named failure patterns (the educational headline). */
export interface DiagnosisPattern {
  id: string;
  name: string; // "Buried Lede"
  definition: string;
  howToSpot: string;
  whyItFails: string;
  example: { before: string; after: string };
  detectableBy: CheckMethod; // usually "llm"
}

export interface SectionThresholds {
  section: SectionKind;
  /** acceptable Flesch–Kincaid grade band. */
  fkGrade: [number, number];
  passiveFractionMax: number;
}

/** Protects the author's signature voice from naive length-and-passive penalties. */
export interface VoiceGuard {
  id: string;
  description: string;
  /** ruleIds whose findings this guard suppresses or down-weights. */
  suppresses: string[];
}

export interface GradeBand {
  grade: string; // "A+", "A", … "F"
  min: number; // minimum weighted score (0..10) to earn this grade
  action: string; // recommended next step
}

export interface RubricConfig {
  dimensions: { key: DimensionKey; weight: number }[];
  thresholds: SectionThresholds[];
  rules: Rule[];
  patterns: DiagnosisPattern[];
  voiceGuards: VoiceGuard[];
  gradeBands: GradeBand[];
}

// ────────────────────────────────────────────────────────────────────────────
// LLM provider abstraction — adapters: vscode.lm (Copilot), Claude, mock
// ────────────────────────────────────────────────────────────────────────────

export interface LMRequest {
  system?: string;
  prompt: string;
  /** ask the provider for raw JSON (the coach validates it). */
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface LMResponse {
  text: string;
}

export interface LanguageModel {
  readonly id: string;
  complete(request: LMRequest): Promise<LMResponse>;
}

// ────────────────────────────────────────────────────────────────────────────
// Coach output — the stable contract every front-end renders
// ────────────────────────────────────────────────────────────────────────────

export interface DimensionScore {
  key: DimensionKey;
  score: number; // 1..10
  weight: number; // 0..1
  notes?: string;
}

export interface AltitudeRead {
  /** the reader the prose is judged against. */
  assumedAudience: string;
  /** true if inferred from the text; false if the user set it. */
  inferred: boolean;
  /** e.g. "over-explained for a reviewer" / "jargon cliff for a newcomer". */
  verdict: string;
  signals?: string[];
}

export interface GradeDelta {
  previousGrade?: string;
  changed?: Record<string, { from: number; to: number }>;
}

export interface CoachReport {
  version: string;
  target: { file?: string; section?: string; audience?: string };
  /** the prose the panel highlights over (== Extraction.text analyzed). */
  extractedText: string;
  metrics: Metrics;
  findings: Finding[];
  dimensions: DimensionScore[];
  grade: string;
  altitude?: AltitudeRead;
  delta?: GradeDelta;
  meta: {
    /** true when no LanguageModel was available (mechanical findings only). */
    deterministicOnly: boolean;
    /** true when proseRatio was low (math-heavy section). */
    lowProseConfidence: boolean;
    note?: string;
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Coach entry point
// ────────────────────────────────────────────────────────────────────────────

export interface CoachInput {
  extraction: Extraction;
  engine: EngineResult;
  rubric: RubricConfig;
  /** user override; when absent, altitude audience is inferred. */
  audience?: string;
  /** for before/after deltas across edits. */
  previous?: CoachReport;
  /** when absent, the coach returns a deterministic-only report. */
  model?: LanguageModel;
}

export interface Coach {
  review(input: CoachInput): Promise<CoachReport>;
}

export const CONTRACT_VERSION = "0.1.0";
