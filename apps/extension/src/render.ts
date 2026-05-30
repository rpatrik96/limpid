/**
 * Pure webview rendering: {@link CoachReport} → self-contained HTML.
 *
 * No `vscode` import here on purpose — the renderer is a pure function so it can
 * be unit-tested (smoke test) and reused by a future web front-end. The extension
 * host wraps this output in a `Webview` and injects a CSP nonce.
 *
 * The panel shows, per DESIGN.md:
 *   1. an audience control (re-run at a chosen altitude) + the four headline sections,
 *   2. the EXTRACTED prose with span highlights (long/passive/hedge/adverb/…),
 *   3. coach cards — pattern name → why → before/after → source, each with a
 *      "reveal" button that asks the host to select the span in the editor,
 *   4. grade + dimension bars + delta-vs-last-run + altitude banner.
 *
 * Spans are offsets into `report.extractedText` (the contract's invariant), so the
 * highlighter splices directly into that string — no source-offset mapping needed.
 *
 * Interactivity is delivered by a single nonce'd controller script that posts
 * messages back to the host (`setAudience`, `reveal`); the script is inert when
 * rendered outside a webview (e.g. in tests or a future web app).
 */
import type {
  CoachReport,
  DimensionScore,
  Finding,
  Severity,
  Span,
} from "@coach/contract";

/** A finding paired with the dominant span we highlight it on. */
interface HighlightMark {
  start: number;
  end: number;
  severity: Severity;
  ruleId: string;
  message: string;
}

/** Default audience personas offered in the altitude control. */
export const DEFAULT_AUDIENCES = [
  "NeurIPS / ICML reviewer",
  "ML peer",
  "ML newcomer / grad student",
  "Cross-disciplinary scientist",
  "Interested layperson",
];

/** HTML-escape text so spliced prose and messages can't break the markup. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Clamp a span to the valid [0, len] range; drop it if empty/inverted. */
function clampSpan(span: Span, len: number): Span | null {
  const start = Math.max(0, Math.min(span.start, len));
  const end = Math.max(0, Math.min(span.end, len));
  if (end <= start) return null;
  return { start, end };
}

/**
 * Flatten findings → non-overlapping highlight marks over `text`. When two marks
 * overlap, the earlier-starting one wins and the later is dropped (keeps the
 * splice simple and the markup well-formed); doc-level findings (no spans) are
 * surfaced as cards only.
 */
export function collectMarks(findings: Finding[], textLen: number): HighlightMark[] {
  const marks: HighlightMark[] = [];
  for (const f of findings) {
    for (const raw of f.spans) {
      const span = clampSpan(raw, textLen);
      if (!span) continue;
      marks.push({
        start: span.start,
        end: span.end,
        severity: f.severity,
        ruleId: f.ruleId,
        message: f.message,
      });
    }
  }
  marks.sort((a, b) => a.start - b.start || a.end - b.end);

  const result: HighlightMark[] = [];
  let cursor = 0;
  for (const m of marks) {
    if (m.start < cursor) continue; // overlaps a kept mark — drop it
    result.push(m);
    cursor = m.end;
  }
  return result;
}

/** Render the extracted prose with `<mark>` spans for each highlight. */
export function renderHighlightedText(text: string, findings: Finding[]): string {
  const marks = collectMarks(findings, text.length);
  if (marks.length === 0) return escapeHtml(text);

  let out = "";
  let cursor = 0;
  for (const m of marks) {
    if (m.start > cursor) out += escapeHtml(text.slice(cursor, m.start));
    const segment = escapeHtml(text.slice(m.start, m.end));
    const title = escapeHtml(`${m.ruleId}: ${m.message}`);
    out += `<mark class="sev-${m.severity}" title="${title}">${segment}</mark>`;
    cursor = m.end;
  }
  if (cursor < text.length) out += escapeHtml(text.slice(cursor));
  return out;
}

/** One coach card: the educational headline for a finding. */
function renderCard(f: Finding, index: number): string {
  const heading = f.patternName ?? f.ruleId;
  const reveal =
    f.spans.length > 0
      ? `<button class="reveal" data-finding="${index}" title="Reveal in editor">reveal</button>`
      : "";
  const parts: string[] = [];
  parts.push(`<div class="card sev-${f.severity}">`);
  parts.push(`<div class="card-head"><span class="badge">${escapeHtml(f.category)}</span>`);
  parts.push(`<span class="card-title">${escapeHtml(heading)}</span>${reveal}</div>`);
  parts.push(`<p class="card-msg">${escapeHtml(f.message)}</p>`);
  if (f.why) parts.push(`<p class="card-why"><strong>Why:</strong> ${escapeHtml(f.why)}</p>`);
  if (f.suggestion)
    parts.push(`<p class="card-fix"><strong>Fix:</strong> ${escapeHtml(f.suggestion)}</p>`);
  if (f.before !== undefined && f.after !== undefined) {
    parts.push(
      `<div class="ba"><div class="before">${escapeHtml(f.before)}</div>` +
        `<div class="after">${escapeHtml(f.after)}</div></div>`,
    );
  }
  if (f.source) parts.push(`<p class="card-src">${escapeHtml(f.source)}</p>`);
  parts.push("</div>");
  return parts.join("");
}

/** Render the dimension bars (1..10) with weights and optional notes. */
function renderDimensions(dimensions: DimensionScore[]): string {
  const rows = dimensions.map((d) => {
    const pct = Math.max(0, Math.min(100, (d.score / 10) * 100));
    const note = d.notes ? `<span class="dim-note">${escapeHtml(d.notes)}</span>` : "";
    const weight = Math.round(d.weight * 100);
    return (
      `<div class="dim">` +
      `<div class="dim-label">${escapeHtml(d.key)} <em>(${weight}%)</em></div>` +
      `<div class="dim-bar"><div class="dim-fill" style="width:${pct.toFixed(0)}%"></div></div>` +
      `<div class="dim-score">${d.score.toFixed(1)}</div>${note}</div>`
    );
  });
  return rows.join("");
}

/** Render the grade-delta-vs-last-run summary, when a previous run exists. */
function renderDelta(report: CoachReport): string {
  const delta = report.delta;
  if (!delta) return "";
  const bits: string[] = [];
  if (delta.previousGrade) {
    bits.push(`<span>was ${escapeHtml(delta.previousGrade)} → now ${escapeHtml(report.grade)}</span>`);
  }
  if (delta.changed) {
    for (const [key, change] of Object.entries(delta.changed)) {
      const arrow = change.to >= change.from ? "↑" : "↓";
      bits.push(`<span>${escapeHtml(key)} ${change.from} ${arrow} ${change.to}</span>`);
    }
  }
  if (bits.length === 0) return "";
  return `<div class="delta">${bits.join(" · ")}</div>`;
}

/** Render the audience-altitude control + banner. */
function renderAltitude(report: CoachReport, audiences: string[], current: string): string {
  const inferredSel = current ? "" : " selected";
  const opts = [`<option value=""${inferredSel}>Inferred (let Limpid decide)</option>`]
    .concat(
      audiences.map((a) => {
        const sel = a === current ? " selected" : "";
        return `<option value="${escapeHtml(a)}"${sel}>${escapeHtml(a)}</option>`;
      }),
    )
    .join("");
  const control =
    `<div class="controls"><label for="audience">Audience</label>` +
    `<select id="audience">${opts}</select></div>`;

  const a = report.altitude;
  if (!a) return control;
  const tag = a.inferred ? "inferred" : "set by you";
  const signals = a.signals?.length
    ? `<ul class="signals">${a.signals.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`
    : "";
  return (
    `${control}<div class="altitude">` +
    `<div class="alt-head">Audience (${tag}): <strong>${escapeHtml(a.assumedAudience)}</strong></div>` +
    `<div class="alt-verdict">${escapeHtml(a.verdict)}</div>${signals}</div>`
  );
}

/** A small banner when the run was deterministic-only or low-confidence. */
function renderMeta(report: CoachReport): string {
  const flags: string[] = [];
  if (report.meta.deterministicOnly) flags.push("deterministic-only (no LLM)");
  if (report.meta.lowProseConfidence) flags.push("low prose confidence (math-heavy)");
  const note = report.meta.note ? escapeHtml(report.meta.note) : "";
  if (flags.length === 0 && !note) return "";
  const flagHtml = flags.length ? `<strong>${escapeHtml(flags.join(" · "))}</strong> ` : "";
  return `<div class="meta-note">${flagHtml}${note}</div>`;
}

/** The nonce'd controller: posts setAudience/reveal to the host; inert elsewhere. */
function renderController(nonceAttr: string): string {
  return `<script${nonceAttr}>
const api = typeof acquireVsCodeApi !== "undefined" ? acquireVsCodeApi() : null;
const sel = document.getElementById("audience");
if (sel && api) sel.addEventListener("change", function () {
  api.postMessage({ type: "setAudience", audience: sel.value });
});
document.querySelectorAll("[data-finding]").forEach(function (el) {
  el.addEventListener("click", function () {
    if (api) api.postMessage({ type: "reveal", finding: Number(el.getAttribute("data-finding")) });
  });
});
</script>`;
}

export interface RenderOptions {
  /** CSP nonce for the inline <style>/<script> when embedded in a VS Code webview. */
  nonce?: string;
  /** Audience personas to offer in the altitude control. */
  audiences?: string[];
  /** The currently-selected audience ("" = inferred). */
  currentAudience?: string;
}

/**
 * Render a full HTML document for the coach panel. Pure: no `vscode` import.
 * `options.nonce`, when provided, is attached to the inline style + script for CSP.
 */
export function renderReport(report: CoachReport, options: RenderOptions = {}): string {
  const nonceAttr = options.nonce ? ` nonce="${escapeHtml(options.nonce)}"` : "";
  const cspNonce = options.nonce ? escapeHtml(options.nonce) : "";
  const csp = options.nonce
    ? `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${cspNonce}'; script-src 'nonce-${cspNonce}';">`
    : "";

  const audiences = options.audiences ?? DEFAULT_AUDIENCES;
  const current = options.currentAudience ?? "";
  const section = report.target.section ? escapeHtml(report.target.section) : "selection";
  const cards = report.findings.map((f, i) => renderCard(f, i)).join("");
  const cardsBlock = cards
    ? `<section class="cards"><h2>Coach</h2>${cards}</section>`
    : `<section class="cards"><h2>Coach</h2><p class="empty">No findings — this reads clean.</p></section>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
${csp}
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Limpid</title>
<style${nonceAttr}>${STYLE}</style>
</head>
<body>
<header class="topbar">
  <div class="grade grade-${escapeHtml(report.grade)}">${escapeHtml(report.grade)}</div>
  <div class="topbar-meta">
    <div class="section-name">${section}</div>
    ${renderDelta(report)}
  </div>
</header>
${renderMeta(report)}
${renderAltitude(report, audiences, current)}
<section class="dimensions"><h2>Dimensions</h2>${renderDimensions(report.dimensions)}</section>
<section class="prose"><h2>Prose</h2><div class="prose-body">${renderHighlightedText(
    report.extractedText,
    report.findings,
  )}</div></section>
${cardsBlock}
${renderController(nonceAttr)}
</body>
</html>`;
}

const STYLE = `
:root { color-scheme: light dark; }
body { font-family: var(--vscode-font-family, system-ui, sans-serif); margin: 0; padding: 1rem; line-height: 1.5; }
h2 { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.7; margin: 1.25rem 0 0.5rem; }
.topbar { display: flex; align-items: center; gap: 1rem; }
.grade { font-size: 2rem; font-weight: 700; border: 2px solid currentColor; border-radius: 0.5rem; padding: 0.25rem 0.75rem; }
.section-name { font-weight: 600; }
.delta { font-size: 0.85rem; opacity: 0.8; }
.meta-note { margin-top: 0.5rem; font-size: 0.85rem; padding: 0.5rem; border-radius: 0.4rem; background: rgba(127,127,127,0.12); }
.controls { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.75rem; font-size: 0.85rem; }
.controls label { opacity: 0.7; text-transform: uppercase; letter-spacing: 0.04em; font-size: 0.75rem; }
.controls select { background: var(--vscode-dropdown-background, rgba(127,127,127,0.15)); color: inherit; border: 1px solid rgba(127,127,127,0.4); border-radius: 0.3rem; padding: 0.15rem 0.4rem; }
.altitude { margin-top: 0.5rem; padding: 0.6rem 0.75rem; border-left: 3px solid #6aa0ff; background: rgba(106,160,255,0.08); border-radius: 0.3rem; }
.alt-verdict { opacity: 0.85; }
.signals { margin: 0.25rem 0 0; padding-left: 1.2rem; font-size: 0.85rem; opacity: 0.8; }
.dim { display: grid; grid-template-columns: 9rem 1fr 2.5rem; align-items: center; gap: 0.5rem; margin: 0.2rem 0; }
.dim-label em { opacity: 0.6; font-style: normal; }
.dim-bar { background: rgba(127,127,127,0.2); border-radius: 0.3rem; height: 0.6rem; overflow: hidden; }
.dim-fill { height: 100%; background: linear-gradient(90deg, #d97a45, #5bbf6a); }
.dim-note { grid-column: 1 / -1; font-size: 0.8rem; opacity: 0.7; }
.prose-body { white-space: pre-wrap; padding: 0.75rem; border-radius: 0.4rem; background: rgba(127,127,127,0.06); }
mark { background: transparent; border-bottom: 2px solid; padding: 0 0.05em; }
mark.sev-info { border-color: #6aa0ff; }
mark.sev-suggestion { border-color: #5bbf6a; }
mark.sev-warning { border-color: #e0a44a; }
mark.sev-error { border-color: #e0574a; }
.card { border: 1px solid rgba(127,127,127,0.25); border-left-width: 3px; border-radius: 0.4rem; padding: 0.6rem 0.75rem; margin: 0.5rem 0; }
.card.sev-warning { border-left-color: #e0a44a; }
.card.sev-error { border-left-color: #e0574a; }
.card.sev-suggestion { border-left-color: #5bbf6a; }
.card.sev-info { border-left-color: #6aa0ff; }
.card-head { display: flex; align-items: center; gap: 0.5rem; }
.badge { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; padding: 0.1rem 0.4rem; border-radius: 0.3rem; background: rgba(127,127,127,0.18); }
.card-title { font-weight: 600; }
.reveal { margin-left: auto; font-size: 0.7rem; padding: 0.1rem 0.45rem; border: 1px solid rgba(127,127,127,0.4); border-radius: 0.3rem; background: transparent; color: inherit; cursor: pointer; }
.reveal:hover { background: rgba(127,127,127,0.15); }
.card-msg { margin: 0.35rem 0; }
.ba { display: grid; gap: 0.25rem; margin: 0.4rem 0; font-size: 0.9rem; }
.before { padding: 0.3rem 0.5rem; border-radius: 0.3rem; background: rgba(224,87,74,0.1); }
.after { padding: 0.3rem 0.5rem; border-radius: 0.3rem; background: rgba(91,191,106,0.12); }
.card-src { font-size: 0.8rem; opacity: 0.65; margin: 0.25rem 0 0; }
.empty { opacity: 0.7; }
`;
