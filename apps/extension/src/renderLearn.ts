/**
 * Pure renderer for the "Learn" view: your recurring-pattern insight (from
 * @coach/history) + the pattern library (the rubric's named failure patterns).
 * No `vscode` import — testable, and themed to the VS Code foreground so it stays
 * legible on dark themes.
 */
import type { DiagnosisPattern } from "@coach/contract";
import type { HistorySummary } from "@coach/history";

import { escapeHtml } from "./render.js";

export interface LearnOptions {
  nonce?: string;
}

function renderInsight(s: HistorySummary): string {
  if (s.runs === 0) {
    return (
      `<section class="insight"><h2>Your writing</h2>` +
      `<p class="empty">Coach some writing and your recurring patterns, grade trend, and averages appear here.</p></section>`
    );
  }
  const grades = s.recentGrades
    .map((g) => `<span class="grade-chip">${escapeHtml(g.grade)}</span>`)
    .join("");
  const max = Math.max(1, ...s.topPatterns.map((p) => p.count));
  const patterns = s.topPatterns.length
    ? s.topPatterns
        .map((p) => {
          const pct = Math.round((p.count / max) * 100);
          return (
            `<div class="pat-row"><span class="pat-name">${escapeHtml(p.name)}</span>` +
            `<span class="pat-bar"><span class="pat-fill" style="width:${pct}%"></span></span>` +
            `<span class="pat-count">${p.count}×</span></div>`
          );
        })
        .join("")
    : `<p class="muted">No named patterns yet — run with an LLM provider to diagnose them.</p>`;
  const avg = s.avg
    ? `<p class="muted">Averages — passive ${s.avg.passiveFraction}, FK ${s.avg.fk}, filler ${s.avg.fillerDensity}/100w.</p>`
    : "";
  return (
    `<section class="insight"><h2>Your writing</h2>` +
    `<p class="muted">${s.runs} run(s) across ${s.files} file(s) · latest grade ` +
    `<strong>${escapeHtml(s.latestGrade ?? "—")}</strong></p>` +
    `<div class="grades">${grades}</div>` +
    `<h3>Most recurring patterns</h3>${patterns}${avg}</section>`
  );
}

function renderCatalog(patterns: DiagnosisPattern[]): string {
  const cards = patterns
    .map((p) => {
      const ba =
        p.example && p.example.before && p.example.after
          ? `<div class="ba"><span class="before">${escapeHtml(p.example.before)}</span>` +
            `<span class="ba-arrow" aria-hidden="true">→</span>` +
            `<span class="after">${escapeHtml(p.example.after)}</span></div>`
          : "";
      return (
        `<div class="pcard"><div class="pcard-name">${escapeHtml(p.name)}</div>` +
        `<p class="pcard-def">${escapeHtml(p.definition)}</p>` +
        `<p class="pcard-row"><strong>Spot it:</strong> ${escapeHtml(p.howToSpot)}</p>` +
        `<p class="pcard-row"><strong>Why it fails:</strong> ${escapeHtml(p.whyItFails)}</p>` +
        `${ba}</div>`
      );
    })
    .join("");
  return `<section class="catalog"><h2>Pattern library</h2>${cards}</section>`;
}

export function renderLearn(
  patterns: DiagnosisPattern[],
  summary: HistorySummary,
  options: LearnOptions = {},
): string {
  const nonceAttr = options.nonce ? ` nonce="${escapeHtml(options.nonce)}"` : "";
  const cspNonce = options.nonce ? escapeHtml(options.nonce) : "";
  const csp = options.nonce
    ? `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${cspNonce}';">`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
${csp}
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Limpid · Learn</title>
<style${nonceAttr}>${STYLE}</style>
</head>
<body>
${renderInsight(summary)}
${renderCatalog(patterns)}
</body>
</html>`;
}

const STYLE = `
:root { color-scheme: light dark; --rule: rgba(127,127,127,0.22); --sev-error: #e0574a; }
* { box-sizing: border-box; }
body {
  font-family: var(--vscode-font-family, system-ui, sans-serif);
  font-size: var(--vscode-font-size, 13px);
  color: var(--vscode-foreground, #cccccc);
  background-color: var(--vscode-sideBar-background, transparent);
  margin: 0; padding: 1rem 0.75rem; line-height: 1.5;
}
h2 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.65; font-weight: 600; margin: 1.25rem 0 0.5rem; padding-bottom: 0.25rem; border-bottom: 1px solid var(--rule); }
h3 { font-size: 0.78rem; opacity: 0.8; margin: 0.75rem 0 0.35rem; }
.muted { opacity: 0.7; font-size: 0.85rem; }
.empty { opacity: 0.7; }
.grades { display: flex; flex-wrap: wrap; gap: 0.25rem; margin: 0.35rem 0; }
.grade-chip { font-size: 0.72rem; font-weight: 700; border: 1px solid currentColor; border-radius: 0.3rem; padding: 0.05rem 0.35rem; opacity: 0.85; }
.pat-row { display: grid; grid-template-columns: 1fr 4rem auto; align-items: center; gap: 0.5rem; margin: 0.2rem 0; font-size: 0.85rem; }
.pat-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pat-bar { background: rgba(127,127,127,0.2); border-radius: 0.3rem; height: 0.5rem; overflow: hidden; }
.pat-fill { display: block; height: 100%; background: var(--sev-error); }
.pat-count { opacity: 0.6; font-size: 0.78rem; }
.pcard { border: 1px solid var(--rule); border-radius: 0.4rem; padding: 0.6rem; margin: 0.5rem 0; }
.pcard-name { font-weight: 700; }
.pcard-def { margin: 0.25rem 0; opacity: 0.9; }
.pcard-row { margin: 0.2rem 0; font-size: 0.88rem; }
.ba { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.4rem; font-size: 0.85rem; }
.before, .after { padding: 0.25rem 0.45rem; border-radius: 0.3rem; flex: 1 1 100%; }
.before { background: rgba(224,87,74,0.1); }
.after { background: rgba(91,191,106,0.12); }
.ba-arrow { align-self: center; opacity: 0.5; }
`;
