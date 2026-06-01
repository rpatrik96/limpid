/**
 * The LLM lens schema: the JSON shape the coach asks a {@link LanguageModel} to
 * return, plus a structural validator. The coach never trusts model output — it
 * validates against {@link LensResult} and, on malformed JSON, retries once and
 * then degrades to deterministic-only (AGENTS.md robustness rule).
 *
 * The four lenses mirror `writing-verify.md` Step 3 and Gopen & Swan:
 *   stressTopic   — stress (sentence-end) + topic (sentence-start) placement.
 *   cohesion      — old→new paragraph cohesion (the Orphan Transition engine).
 *   altitude      — audience-altitude read (over/under-explanation).
 *   argumentFlow  — buried lede / claim–evidence alignment.
 *   patterns      — named-pattern diagnoses keyed to rubric.patterns ids.
 */
import type { DimensionKey, Severity, Span } from "@coach/contract";

/** A single span the model points at, given as offsets into the analyzed text. */
export interface LensSpan {
  start: number;
  end: number;
}

/** One flagged item inside a lens. before/after are optional concrete rewrites. */
export interface LensFinding {
  /** short "what" — one line. */
  message: string;
  /** the cognitive reason it fails — teaching payload. */
  why?: string;
  /** how to fix, in prose. */
  suggestion?: string;
  before?: string;
  after?: string;
  /** spans into the analyzed text; may be omitted for doc-level findings. */
  spans?: LensSpan[];
  /** model self-rated severity; clamped to the Severity union by the coach. */
  severity?: string;
}

/** A named-pattern diagnosis. `id` must match a rubric DiagnosisPattern id. */
export interface LensPatternHit {
  id: string;
  /** the model's evidence / one-line justification. */
  evidence?: string;
  before?: string;
  after?: string;
  spans?: LensSpan[];
  severity?: string;
}

export interface LensAltitude {
  assumedAudience: string;
  /** true if the model inferred the audience; false if the user supplied it. */
  inferred: boolean;
  verdict: string;
  signals?: string[];
}

export interface LensResult {
  /** Gopen–Swan stress/topic-position findings. */
  stressTopic: LensFinding[];
  /** old→new paragraph cohesion findings. */
  cohesion: LensFinding[];
  /** audience-altitude read. */
  altitude: LensAltitude;
  /** argument flow: buried lede, claim–evidence, unsupported claims. */
  argumentFlow: LensFinding[];
  /** named-pattern diagnoses keyed to rubric.patterns ids. */
  patterns: LensPatternHit[];
  /** 1..10 precision score the coach folds into the weighted grade. */
  precisionScore: number;
}

// ── Validation ───────────────────────────────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isSpan(v: unknown): v is LensSpan {
  return (
    isObject(v) &&
    typeof v.start === "number" &&
    typeof v.end === "number" &&
    Number.isFinite(v.start) &&
    Number.isFinite(v.end)
  );
}

function validateSpans(v: unknown): LensSpan[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) return undefined;
  const spans = v.filter(isSpan);
  return spans.length ? spans : undefined;
}

function validateFinding(v: unknown): LensFinding | null {
  if (!isObject(v)) return null;
  if (typeof v.message !== "string" || v.message.trim() === "") return null;
  const out: LensFinding = { message: v.message };
  if (typeof v.why === "string") out.why = v.why;
  if (typeof v.suggestion === "string") out.suggestion = v.suggestion;
  if (typeof v.before === "string") out.before = v.before;
  if (typeof v.after === "string") out.after = v.after;
  if (typeof v.severity === "string") out.severity = v.severity;
  const spans = validateSpans(v.spans);
  if (spans) out.spans = spans;
  return out;
}

function validateFindings(v: unknown): LensFinding[] {
  if (!Array.isArray(v)) return [];
  const out: LensFinding[] = [];
  for (const item of v) {
    const f = validateFinding(item);
    if (f) out.push(f);
  }
  return out;
}

function validatePatternHit(v: unknown): LensPatternHit | null {
  if (!isObject(v)) return null;
  if (typeof v.id !== "string" || v.id.trim() === "") return null;
  const out: LensPatternHit = { id: v.id };
  if (typeof v.evidence === "string") out.evidence = v.evidence;
  if (typeof v.before === "string") out.before = v.before;
  if (typeof v.after === "string") out.after = v.after;
  if (typeof v.severity === "string") out.severity = v.severity;
  const spans = validateSpans(v.spans);
  if (spans) out.spans = spans;
  return out;
}

function validateAltitude(v: unknown): LensAltitude | null {
  if (!isObject(v)) return null;
  if (typeof v.assumedAudience !== "string" || v.assumedAudience.trim() === "") {
    return null;
  }
  if (typeof v.verdict !== "string") return null;
  const out: LensAltitude = {
    assumedAudience: v.assumedAudience,
    inferred: typeof v.inferred === "boolean" ? v.inferred : true,
    verdict: v.verdict,
  };
  if (Array.isArray(v.signals)) {
    const signals = v.signals.filter((s): s is string => typeof s === "string");
    if (signals.length) out.signals = signals;
  }
  return out;
}

/**
 * Parse + structurally validate raw model text into a {@link LensResult}.
 * Returns null when the JSON is malformed or the required core fields
 * (a valid altitude object and a numeric precisionScore) are missing — the
 * signal the coach uses to retry, then degrade.
 */
export function parseLensResult(raw: string): LensResult | null {
  const json = extractJson(raw);
  if (json === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isObject(parsed)) return null;

  const altitude = validateAltitude(parsed.altitude);
  if (!altitude) return null;

  const precisionScore =
    typeof parsed.precisionScore === "number" && Number.isFinite(parsed.precisionScore)
      ? parsed.precisionScore
      : null;
  if (precisionScore === null) return null;

  const patterns: LensPatternHit[] = Array.isArray(parsed.patterns)
    ? parsed.patterns.map(validatePatternHit).filter((p): p is LensPatternHit => p !== null)
    : [];

  return {
    stressTopic: validateFindings(parsed.stressTopic),
    cohesion: validateFindings(parsed.cohesion),
    altitude,
    argumentFlow: validateFindings(parsed.argumentFlow),
    patterns,
    precisionScore,
  };
}

/**
 * Pull a JSON object out of raw model text. Handles three common provider
 * habits: clean JSON, ```json fenced blocks, and prose with an embedded object.
 */
export function extractJson(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  // Fenced ```json … ``` (or bare ``` …).
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fence?.[1]) {
    const inner = fence[1].trim();
    if (inner.startsWith("{")) return inner;
  }

  if (trimmed.startsWith("{")) return trimmed;

  // First balanced {...} object embedded in prose.
  const start = trimmed.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return trimmed.slice(start, i + 1);
    }
  }
  return null;
}

// ── Mapping helpers (lens → contract) ────────────────────────────────────────

/** Clamp a model-supplied severity string to the contract Severity union. */
export function coerceSeverity(raw: string | undefined, fallback: Severity): Severity {
  switch ((raw ?? "").toLowerCase()) {
    case "info":
      return "info";
    case "suggestion":
      return "suggestion";
    case "warning":
      return "warning";
    case "error":
      return "error";
    default:
      return fallback;
  }
}

/** Clamp + dedupe lens spans into contract spans bounded by the text length. */
export function coerceSpans(spans: LensSpan[] | undefined, textLength: number): Span[] {
  if (!spans) return [];
  const out: Span[] = [];
  for (const s of spans) {
    const start = Math.max(0, Math.min(Math.floor(s.start), textLength));
    const end = Math.max(start, Math.min(Math.floor(s.end), textLength));
    if (end > start) out.push({ start, end });
  }
  return out;
}

/** Map a precision lens to a DimensionKey, defaulting to precision. */
export function lensCategory(_lens: string): DimensionKey {
  return "precision";
}
