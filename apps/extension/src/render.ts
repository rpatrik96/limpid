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
import type { CoachReport, DimensionScore, Finding, Severity, Span } from "@coach/contract";

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
  parts.push(
    `<div class="card-head"><span class="badge">${escapeHtml(f.category)}</span>` +
      `<span class="card-title">${escapeHtml(heading)}</span>${reveal}</div>`,
  );
  parts.push(`<p class="card-msg">${escapeHtml(f.message)}</p>`);
  // Why / Fix as a tight definition list — labels recede, bodies run inline.
  const wf: string[] = [];
  if (f.why) wf.push(`<dt>Why</dt><dd>${escapeHtml(f.why)}</dd>`);
  if (f.suggestion) wf.push(`<dt>Fix</dt><dd>${escapeHtml(f.suggestion)}</dd>`);
  if (wf.length) parts.push(`<dl class="card-wf">${wf.join("")}</dl>`);
  if (f.before !== undefined && f.after !== undefined) {
    parts.push(
      `<div class="ba"><span class="before">${escapeHtml(f.before)}</span>` +
        `<span class="ba-arrow" aria-hidden="true">→</span>` +
        `<span class="after">${escapeHtml(f.after)}</span></div>`,
    );
  }
  // Source: kept verbatim, demoted to a muted citation line behind a § glyph.
  if (f.source) parts.push(`<small class="card-src">${escapeHtml(f.source)}</small>`);
  parts.push("</div>");
  return parts.join("");
}

/** Map a 1–10 score to a qualitative band (label + css modifier). */
function scoreBand(score: number): { label: string; cls: string } {
  if (score >= 8) return { label: "strong", cls: "band-strong" };
  if (score >= 6) return { label: "fair", cls: "band-fair" };
  if (score >= 4) return { label: "weak", cls: "band-weak" };
  return { label: "poor", cls: "band-poor" };
}

/** Render the dimension bars (scored out of 10) with weights and optional notes. */
function renderDimensions(dimensions: DimensionScore[]): string {
  const caption =
    `<p class="dim-caption">Each dimension is scored <strong>out of 10</strong>; ` +
    `<em>% weight</em> is its share of the overall grade.</p>`;
  const rows = dimensions.map((d) => {
    const pct = Math.max(0, Math.min(100, (d.score / 10) * 100));
    const note = d.notes ? `<div class="dim-note">${escapeHtml(d.notes)}</div>` : "";
    const weight = Math.round(d.weight * 100);
    const band = scoreBand(d.score);
    return (
      `<div class="dim">` +
      `<div class="dim-top">` +
      `<span class="dim-label">${escapeHtml(d.key)}` +
      `<span class="dim-weight" title="weight in the overall grade">${weight}% weight</span></span>` +
      `<span class="dim-score"><span class="dim-num">${d.score.toFixed(1)}</span>` +
      `<span class="dim-max">/ 10</span>` +
      `<span class="dim-band ${band.cls}">${band.label}</span></span>` +
      `</div>` +
      `<div class="dim-bar" role="meter" aria-valuemin="0" aria-valuemax="10" ` +
      `aria-valuenow="${d.score.toFixed(1)}" title="${d.score.toFixed(1)} out of 10">` +
      `<div class="dim-fill ${band.cls}" style="width:${pct.toFixed(0)}%"></div></div>` +
      `${note}</div>`
    );
  });
  return caption + rows.join("");
}

/** A compact severity → meaning legend for the prose highlights. */
function renderLegend(): string {
  const items: [Severity, string][] = [
    ["error", "error"],
    ["warning", "warning"],
    ["suggestion", "suggestion"],
    ["info", "note"],
  ];
  const swatches = items
    .map(
      ([sev, label]) =>
        `<span class="legend-item"><span class="legend-swatch sev-${sev}"></span>${label}</span>`,
    )
    .join("");
  return `<div class="legend" aria-label="Highlight legend">${swatches}</div>`;
}

/** Render the grade-delta-vs-last-run summary, when a previous run exists. */
function renderDelta(report: CoachReport): string {
  const delta = report.delta;
  if (!delta) return "";
  const bits: string[] = [];
  if (delta.previousGrade) {
    bits.push(
      `<span>was ${escapeHtml(delta.previousGrade)} → now ${escapeHtml(report.grade)}</span>`,
    );
  }
  if (delta.changed) {
    for (const [key, change] of Object.entries(delta.changed)) {
      const arrow = change.to >= change.from ? "↑" : "↓";
      bits.push(`<span>${escapeHtml(key)} ${change.from} ${arrow} ${change.to}</span>`);
    }
  }
  if (bits.length === 0) return "";
  return `<div class="delta">${bits.join("")}</div>`;
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

/** The nonce'd controller: posts setAudience/reveal/coach to the host; inert elsewhere. */
function renderController(nonceAttr: string): string {
  return `<script${nonceAttr}>
const api = typeof acquireVsCodeApi !== "undefined" ? acquireVsCodeApi() : null;
function post(m) { if (api) api.postMessage(m); }
const sel = document.getElementById("audience");
if (sel) sel.addEventListener("change", function () { post({ type: "setAudience", audience: sel.value }); });
const coachBtn = document.getElementById("coach-btn");
if (coachBtn) coachBtn.addEventListener("click", function () { post({ type: "coach" }); });
const sectionBtn = document.getElementById("coach-section-btn");
if (sectionBtn) sectionBtn.addEventListener("click", function () { post({ type: "coachSection" }); });
document.querySelectorAll("[data-finding]").forEach(function (el) {
  el.addEventListener("click", function () { post({ type: "reveal", finding: Number(el.getAttribute("data-finding")) }); });
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
<div class="actions">
  <button id="coach-btn" class="action-btn">Coach selection</button>
  <button id="coach-section-btn" class="action-btn">Coach section…</button>
</div>
${renderMeta(report)}
${renderAltitude(report, audiences, current)}
<section class="dimensions"><h2>Dimensions</h2>${renderDimensions(report.dimensions)}</section>
<section class="prose"><h2>Prose</h2>${renderLegend()}<div class="prose-body">${renderHighlightedText(
    report.extractedText,
    report.findings,
  )}</div></section>
${cardsBlock}
${renderController(nonceAttr)}
</body>
</html>`;
}

/** The empty-state document (no report yet): a prompt + the action buttons. */
export function renderPlaceholder(options: RenderOptions = {}): string {
  const nonceAttr = options.nonce ? ` nonce="${escapeHtml(options.nonce)}"` : "";
  const cspNonce = options.nonce ? escapeHtml(options.nonce) : "";
  const csp = options.nonce
    ? `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${cspNonce}'; script-src 'nonce-${cspNonce}';">`
    : "";

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
<div class="empty-state">
  <h2>Limpid</h2>
  <p>Coach a passage against good writing — and learn why. Select text in your editor (or nothing, for the whole file), then:</p>
  <div class="actions">
    <button id="coach-btn" class="action-btn">Coach selection</button>
    <button id="coach-section-btn" class="action-btn">Coach section…</button>
  </div>
  <p class="hint">⌘⌥L / Ctrl+Alt+L coaches the selection. Re-analysis also runs when you save.</p>
</div>
${renderController(nonceAttr)}
</body>
</html>`;
}

const STYLE = `
:root {
  color-scheme: light dark;
  --sp-1: 0.25rem;
  --sp-2: 0.5rem;
  --sp-3: 0.75rem;
  --sp-4: 1rem;
  --sp-5: 1.5rem;
  --radius: 0.4rem;
  --rule: rgba(127,127,127,0.22);
  --sev-info: #6aa0ff;
  --sev-suggestion: #5bbf6a;
  --sev-warning: #e0a44a;
  --sev-error: #e0574a;
}
* { box-sizing: border-box; }
body {
  font-family: var(--vscode-font-family, system-ui, sans-serif);
  font-size: var(--vscode-font-size, 13px);
  margin: 0;
  padding: var(--sp-4) var(--sp-3);
  line-height: 1.5;
}
h2 {
  font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em;
  opacity: 0.65; font-weight: 600;
  margin: var(--sp-5) 0 var(--sp-2);
  padding-bottom: var(--sp-1);
  border-bottom: 1px solid var(--rule);
}
.topbar { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
.grade {
  font-size: 1.6rem; font-weight: 700; line-height: 1;
  border: 2px solid currentColor; border-radius: var(--radius);
  padding: 0.2rem 0.55rem; flex: none;
}
.topbar-meta { min-width: 0; flex: 1 1 8rem; }
.section-name { font-weight: 600; }
.delta {
  font-size: 0.8rem; opacity: 0.8; margin-top: var(--sp-1);
  display: flex; flex-wrap: wrap; gap: 0 var(--sp-2);
}
.delta > span:not(:last-child)::after { content: "·"; opacity: 0.45; margin-left: var(--sp-2); }
.meta-note { margin-top: var(--sp-2); font-size: 0.85rem; padding: var(--sp-2); border-radius: var(--radius); background: rgba(127,127,127,0.12); }
.controls { display: flex; flex-direction: column; align-items: stretch; gap: var(--sp-1); margin-top: var(--sp-4); }
.controls label { opacity: 0.65; text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.7rem; }
.controls select {
  width: 100%;
  background: var(--vscode-dropdown-background, rgba(127,127,127,0.15));
  color: var(--vscode-dropdown-foreground, inherit);
  border: 1px solid var(--vscode-dropdown-border, rgba(127,127,127,0.4));
  border-radius: 0.3rem; padding: 0.25rem 0.4rem; font-size: 0.85rem;
}
.altitude { margin-top: var(--sp-2); padding: var(--sp-2) var(--sp-3); border-left: 3px solid var(--sev-info); background: rgba(106,160,255,0.08); border-radius: 0.3rem; }
.alt-verdict { opacity: 0.85; }
.signals { margin: var(--sp-1) 0 0; padding-left: 1.1rem; font-size: 0.85rem; opacity: 0.8; }
.dim-caption { font-size: 0.78rem; opacity: 0.7; margin: 0 0 var(--sp-2); }
.dim-caption em { font-style: normal; opacity: 0.9; }
.dim { margin: 0 0 var(--sp-3); }
.dim-top { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-2); margin-bottom: var(--sp-1); }
.dim-label { font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dim-weight { font-weight: 400; opacity: 0.55; font-size: 0.72rem; margin-left: var(--sp-2); white-space: nowrap; }
.dim-score { flex: none; display: inline-flex; align-items: baseline; gap: 0.3rem; }
.dim-num { font-weight: 700; font-size: 0.95rem; }
.dim-max { opacity: 0.5; font-size: 0.72rem; }
.dim-band { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.04em; padding: 0.05rem 0.35rem; border-radius: 0.6rem; }
.dim-bar { background: rgba(127,127,127,0.2); border-radius: 0.3rem; height: 0.5rem; overflow: hidden; }
.dim-fill { height: 100%; border-radius: inherit; }
.dim-note { font-size: 0.78rem; opacity: 0.7; margin-top: var(--sp-1); }
.band-strong { background-color: var(--sev-suggestion); }
.band-fair { background-color: var(--sev-warning); }
.band-weak { background-color: var(--sev-error); }
.band-poor { background-color: var(--sev-error); }
.dim-band { color: #1a1a1a; }
.legend { display: flex; flex-wrap: wrap; gap: 0 var(--sp-3); margin-bottom: var(--sp-2); font-size: 0.72rem; opacity: 0.75; }
.legend-item { display: inline-flex; align-items: center; gap: 0.3rem; }
.legend-swatch { display: inline-block; width: 0.7rem; height: 0; border-bottom: 2px solid; }
.legend-swatch.sev-info { border-color: var(--sev-info); }
.legend-swatch.sev-suggestion { border-color: var(--sev-suggestion); }
.legend-swatch.sev-warning { border-color: var(--sev-warning); }
.legend-swatch.sev-error { border-color: var(--sev-error); }
.prose-body { white-space: pre-wrap; word-break: break-word; padding: var(--sp-3); border-radius: var(--radius); background: rgba(127,127,127,0.06); }
mark { background: transparent; border-bottom: 2px solid; padding: 0 0.05em; }
mark.sev-info { border-color: var(--sev-info); }
mark.sev-suggestion { border-color: var(--sev-suggestion); }
mark.sev-warning { border-color: var(--sev-warning); }
mark.sev-error { border-color: var(--sev-error); }
.card { border: 1px solid var(--rule); border-left-width: 3px; border-radius: var(--radius); padding: var(--sp-2); margin: var(--sp-2) 0; }
.card.sev-warning { border-left-color: var(--sev-warning); }
.card.sev-error { border-left-color: var(--sev-error); }
.card.sev-suggestion { border-left-color: var(--sev-suggestion); }
.card.sev-info { border-left-color: var(--sev-info); }
.card-head { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.badge { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em; padding: 0.1rem 0.4rem; border-radius: 0.3rem; background: rgba(127,127,127,0.18); }
.card-title { font-weight: 600; min-width: 0; }
.reveal { margin-left: auto; font-size: 0.7rem; padding: 0.1rem 0.45rem; border: 1px solid rgba(127,127,127,0.4); border-radius: 0.3rem; background: transparent; color: inherit; cursor: pointer; flex: none; }
.reveal:hover { background: rgba(127,127,127,0.15); }
.card-msg { margin: var(--sp-2) 0 var(--sp-1); }
.card-wf { margin: var(--sp-1) 0; display: grid; grid-template-columns: auto 1fr; gap: 0 var(--sp-2); font-size: 0.9rem; }
.card-wf dt { font-weight: 600; opacity: 0.7; }
.card-wf dd { margin: 0 0 var(--sp-1); min-width: 0; overflow-wrap: anywhere; }
.ba { display: flex; flex-wrap: wrap; align-items: stretch; gap: var(--sp-1); margin: var(--sp-2) 0; font-size: 0.88rem; }
.before, .after { padding: 0.25rem 0.45rem; border-radius: 0.3rem; flex: 1 1 100%; min-width: 0; overflow-wrap: anywhere; }
.before { background: rgba(224,87,74,0.1); }
.after { background: rgba(91,191,106,0.12); }
.ba-arrow { align-self: center; opacity: 0.5; flex: none; }
.card-src { display: block; font-size: 0.72rem; opacity: 0.5; margin-top: var(--sp-1); }
.card-src::before { content: "§ "; opacity: 0.7; }
.empty { opacity: 0.7; }
.actions { display: flex; flex-direction: column; gap: var(--sp-2); margin-top: var(--sp-3); }
.action-btn {
  width: 100%; text-align: center;
  font-size: 0.85rem; padding: 0.4rem 0.7rem;
  border: 1px solid var(--vscode-button-border, rgba(127,127,127,0.4));
  border-radius: 0.3rem;
  background: var(--vscode-button-background, rgba(127,127,127,0.18));
  color: var(--vscode-button-foreground, inherit); cursor: pointer;
}
.action-btn:hover { background: var(--vscode-button-hoverBackground, rgba(127,127,127,0.32)); }
.empty-state { padding: var(--sp-4) var(--sp-1); }
.empty-state p { opacity: 0.85; }
.empty-state .hint { font-size: 0.8rem; opacity: 0.6; margin-top: var(--sp-4); }
`;
