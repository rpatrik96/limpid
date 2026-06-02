/**
 * @coach/history — pure aggregation of coaching runs over time.
 *
 * The extension records one {@link HistoryEntry} per coach run (to
 * `.limpid/history.json`) and asks this package to {@link summarize} it for the
 * Learning Center's "your recurring patterns / grade trend" view. No fs, no
 * vscode — the extension owns I/O; this owns the (testable) shaping + stats.
 */
import type { CoachReport, DimensionKey } from "@coach/contract";

/** The four scored dimensions, in canonical render order. */
export const DIMENSION_KEYS: readonly DimensionKey[] = [
  "accessibility",
  "clarity",
  "flow",
  "precision",
];

/** Per-dimension scores (1..10), one slot per {@link DIMENSION_KEYS}. */
export type DimensionScores = Record<DimensionKey, number>;

export interface HistoryEntry {
  /** epoch milliseconds. */
  at: number;
  file: string;
  grade: string;
  /** patternName of every LLM-diagnosed finding in the run. */
  patterns: string[];
  passiveFraction: number;
  fk: number;
  fillerDensity: number;
  /** the four dimension scores (1..10); 0 for any dimension the report omitted. */
  dims: DimensionScores;
  /** the section this run targeted, when the report carried one. */
  section?: string;
}

/** -1 falling · 0 flat · 1 rising, over the most recent window. */
export type TrendDirection = -1 | 0 | 1;

export interface DimensionTrend {
  key: DimensionKey;
  /** mean score (1..10) across all recorded runs. */
  avg: number;
  /** direction of the recent window (latest minus its start). */
  direction: TrendDirection;
  /** the recent per-run scores used to read the direction (oldest→newest). */
  recent: number[];
}

export interface SectionRollup {
  section: string;
  runs: number;
  /** grade of the most recent run targeting this section. */
  latestGrade: string;
  /** the most recent run's per-dimension scores. */
  latestDims: DimensionScores;
}

export interface HistorySummary {
  runs: number;
  files: number;
  latestGrade: string | null;
  topPatterns: { name: string; count: number }[];
  recentGrades: { at: number; grade: string }[];
  /** averages across all recorded runs, for a deterministic-only trend. */
  avg: { passiveFraction: number; fk: number; fillerDensity: number } | null;
  /** per-dimension average score (1..10) + recent direction, in canonical order. */
  dimensions: DimensionTrend[];
  /** latest grade + scores per targeted section (alphabetical), when any run carried one. */
  sections: SectionRollup[];
}

const round = (x: number, d: number): number => {
  const p = 10 ** d;
  return Math.round(x * p) / p;
};

/** Build a zeroed per-dimension record. */
function zeroDims(): DimensionScores {
  return { accessibility: 0, clarity: 0, flow: 0, precision: 0 };
}

/** Build a history entry from a report. `file` should be a display name. */
export function entryFromReport(report: CoachReport, at: number, file: string): HistoryEntry {
  const patterns = report.findings
    .map((f) => f.patternName)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  const m = report.metrics;
  const dims = zeroDims();
  for (const d of report.dimensions ?? []) {
    if (d && d.key in dims) dims[d.key] = round(d.score, 1);
  }
  const section = report.target?.section;
  return {
    at,
    file,
    grade: report.grade,
    patterns,
    passiveFraction: round(m?.passiveFraction ?? 0, 3),
    fk: round(m?.readability?.fleschKincaidGrade ?? 0, 1),
    fillerDensity: round(m?.fillerDensity ?? 0, 2),
    dims,
    ...(typeof section === "string" && section.length > 0 ? { section } : {}),
  };
}

/** True when `v` carries the legacy-required fields (dims/section are optional). */
function isEntry(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e["at"] === "number" &&
    typeof e["file"] === "string" &&
    typeof e["grade"] === "string" &&
    Array.isArray(e["patterns"]) &&
    e["patterns"].every((p) => typeof p === "string") &&
    typeof e["passiveFraction"] === "number" &&
    typeof e["fk"] === "number" &&
    typeof e["fillerDensity"] === "number"
  );
}

/** Coerce a raw `dims` blob to a full DimensionScores, defaulting missing keys to 0. */
function coerceDims(raw: unknown): DimensionScores {
  const dims = zeroDims();
  if (typeof raw === "object" && raw !== null) {
    const r = raw as Record<string, unknown>;
    for (const k of DIMENSION_KEYS) {
      if (typeof r[k] === "number") dims[k] = r[k] as number;
    }
  }
  return dims;
}

/**
 * Lenient parse of the persisted history JSON (drops malformed entries).
 * Old entries lacking the per-dimension/section fields still parse: `dims`
 * defaults to all-zero and `section` is left absent.
 */
export function parseHistory(json: unknown): HistoryEntry[] {
  if (!Array.isArray(json)) return [];
  return json.filter(isEntry).map((e): HistoryEntry => {
    const section = e["section"];
    return {
      at: e["at"] as number,
      file: e["file"] as string,
      grade: e["grade"] as string,
      patterns: e["patterns"] as string[],
      passiveFraction: e["passiveFraction"] as number,
      fk: e["fk"] as number,
      fillerDensity: e["fillerDensity"] as number,
      dims: coerceDims(e["dims"]),
      ...(typeof section === "string" && section.length > 0 ? { section } : {}),
    };
  });
}

/** Append an entry, capping to the most recent `cap` runs. */
export function appendEntry(
  history: HistoryEntry[],
  entry: HistoryEntry,
  cap = 500,
): HistoryEntry[] {
  const next = [...history, entry];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

export function summarize(history: HistoryEntry[], topN = 5, recentN = 12): HistorySummary {
  const counts = new Map<string, number>();
  for (const e of history) {
    for (const p of e.patterns) counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  const topPatterns = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, topN);

  const files = new Set(history.map((e) => e.file)).size;
  const latest = history.length > 0 ? history[history.length - 1]! : null;
  const recentGrades = history.slice(-recentN).map((e) => ({ at: e.at, grade: e.grade }));

  const avg =
    history.length > 0
      ? {
          passiveFraction: round(mean(history.map((e) => e.passiveFraction)), 3),
          fk: round(mean(history.map((e) => e.fk)), 1),
          fillerDensity: round(mean(history.map((e) => e.fillerDensity)), 2),
        }
      : null;

  const dimensions: DimensionTrend[] =
    history.length === 0
      ? []
      : DIMENSION_KEYS.map((key): DimensionTrend => {
          const scores = history.map((e) => e.dims[key]);
          const recent = scores.slice(-recentN);
          return {
            key,
            avg: round(mean(scores), 1),
            direction: trend(recent),
            recent,
          };
        });

  const sections = rollupSections(history);

  return {
    runs: history.length,
    files,
    latestGrade: latest ? latest.grade : null,
    topPatterns,
    recentGrades,
    avg,
    dimensions,
    sections,
  };
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
}

/** Read the direction of a recent window: sign of (last − first). */
function trend(recent: number[]): TrendDirection {
  if (recent.length < 2) return 0;
  const first = recent[0]!;
  const last = recent[recent.length - 1]!;
  const delta = last - first;
  return delta > 0 ? 1 : delta < 0 ? -1 : 0;
}

/** Latest grade + per-dimension scores per targeted section, alphabetical. */
function rollupSections(history: HistoryEntry[]): SectionRollup[] {
  const bySection = new Map<string, { runs: number; latest: HistoryEntry }>();
  for (const e of history) {
    if (!e.section) continue;
    const prev = bySection.get(e.section);
    // History is chronological; the last seen entry per section is the latest.
    bySection.set(e.section, { runs: (prev?.runs ?? 0) + 1, latest: e });
  }
  return [...bySection.entries()]
    .map(([section, { runs, latest }]) => ({
      section,
      runs,
      latestGrade: latest.grade,
      latestDims: latest.dims,
    }))
    .sort((a, b) => a.section.localeCompare(b.section));
}
