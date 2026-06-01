/**
 * @coach/history — pure aggregation of coaching runs over time.
 *
 * The extension records one {@link HistoryEntry} per coach run (to
 * `.limpid/history.json`) and asks this package to {@link summarize} it for the
 * Learning Center's "your recurring patterns / grade trend" view. No fs, no
 * vscode — the extension owns I/O; this owns the (testable) shaping + stats.
 */
import type { CoachReport } from "@coach/contract";

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
}

export interface HistorySummary {
  runs: number;
  files: number;
  latestGrade: string | null;
  topPatterns: { name: string; count: number }[];
  recentGrades: { at: number; grade: string }[];
  /** averages across all recorded runs, for a deterministic-only trend. */
  avg: { passiveFraction: number; fk: number; fillerDensity: number } | null;
}

const round = (x: number, d: number): number => {
  const p = 10 ** d;
  return Math.round(x * p) / p;
};

/** Build a history entry from a report. `file` should be a display name. */
export function entryFromReport(report: CoachReport, at: number, file: string): HistoryEntry {
  const patterns = report.findings
    .map((f) => f.patternName)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  const m = report.metrics;
  return {
    at,
    file,
    grade: report.grade,
    patterns,
    passiveFraction: round(m?.passiveFraction ?? 0, 3),
    fk: round(m?.readability?.fleschKincaidGrade ?? 0, 1),
    fillerDensity: round(m?.fillerDensity ?? 0, 2),
  };
}

function isEntry(v: unknown): v is HistoryEntry {
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

/** Lenient parse of the persisted history JSON (drops malformed entries). */
export function parseHistory(json: unknown): HistoryEntry[] {
  if (!Array.isArray(json)) return [];
  return json.filter(isEntry);
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

  return {
    runs: history.length,
    files,
    latestGrade: latest ? latest.grade : null,
    topPatterns,
    recentGrades,
    avg,
  };
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
}
