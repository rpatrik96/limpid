/**
 * Webview render smoke tests: a real {@link CoachReport} → HTML.
 *
 * We drive the actual core pipeline (extract → analyze → review) so the renderer
 * is exercised against a contract-shaped report, not a hand-rolled stub — this
 * also guards against silent contract drift in the panel. No `vscode` import: the
 * renderer is pure, so these run under vitest with no host.
 */
import { describe, expect, it } from "vitest";

import type { CoachReport, Finding } from "@coach/contract";
import { extract } from "@coach/latex";
import { analyze } from "@coach/engine";
import { defaultRubric } from "@coach/rubric";
import { createCoach, MockLanguageModel } from "@coach/coach";

import { collectMarks, escapeHtml, renderHighlightedText, renderReport } from "./render.js";

const TEX = String.raw`
\section{Introduction}
It is important to note that the optimization of the model was performed by us in
order to obtain results that are, arguably, somewhat better than the baseline, and
it should be noted that this was done very carefully and very thoroughly across a
large number of different experimental configurations and settings and conditions.
`;

async function buildReport(): Promise<CoachReport> {
  const extraction = extract(TEX);
  const engine = analyze(extraction.text);
  const coach = createCoach();
  return coach.review({
    extraction,
    engine,
    rubric: defaultRubric,
    model: new MockLanguageModel(),
  });
}

describe("renderReport", () => {
  it("produces a well-formed HTML document with the grade and core sections", async () => {
    const report = await buildReport();
    const html = renderReport(report);

    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html.trimEnd().endsWith("</html>")).toBe(true);
    // Grade badge present.
    expect(html).toContain(`grade-${report.grade}`);
    expect(html).toContain(report.grade);
    // The four headline sections render.
    expect(html).toContain("Dimensions");
    expect(html).toContain("Prose");
    expect(html).toContain("Coach");
  });

  it("renders every dimension as a labelled bar", async () => {
    const report = await buildReport();
    const html = renderReport(report);
    for (const d of report.dimensions) {
      expect(html).toContain(d.key);
      expect(html).toContain(d.score.toFixed(1));
    }
  });

  it("makes the dimension scale unambiguous: '/ 10', a weight, and a meter role", async () => {
    const report = await buildReport();
    const html = renderReport(report);
    // The out-of-10 cue appears per dimension and as a section caption.
    expect(html).toContain("/ 10");
    expect(html).toContain("out of 10");
    // Weight is labelled "weight", not a bare percentage that reads as the score.
    for (const d of report.dimensions) {
      expect(html).toContain(`${Math.round(d.weight * 100)}% weight`);
    }
    // The bar exposes its 0–10 range to assistive tech.
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-valuemax="10"');
  });

  it("keeps rule citations out of the panel entirely", async () => {
    const report = await buildReport();
    const html = renderReport(report);
    // The real pipeline attaches a `source` to its findings…
    const sourced = report.findings.filter((f) => f.source);
    expect(sourced.length).toBeGreaterThan(0);
    // …and none of them is rendered: the canon lives in README.md / NOTICE.md.
    for (const f of sourced) expect(html).not.toContain(escapeHtml(f.source!));
    expect(html).not.toContain("card-src");
  });

  it("renders a highlight legend mapping severities to meanings near the prose", async () => {
    const report = await buildReport();
    const html = renderReport(report);
    expect(html).toContain('class="legend"');
    expect(html).toContain("legend-swatch sev-error");
    expect(html).toContain("legend-swatch sev-warning");
    expect(html).toContain("legend-swatch sev-suggestion");
    expect(html).toContain("legend-swatch sev-info");
  });

  it("pins text colour to the VS Code theme so prose + marks stay visible on dark themes", async () => {
    const report = await buildReport();
    const html = renderReport(report);
    // Body text uses the theme foreground, not the user-agent default.
    expect(html).toContain("color: var(--vscode-foreground");
    // <mark> inherits that colour rather than the browser's near-black mark colour
    // (which was invisible on dark themes — only the underline showed).
    expect(html).toMatch(/mark \{[^}]*color: inherit/);
  });

  it("renders the altitude banner when the LLM ran", async () => {
    const report = await buildReport();
    expect(report.altitude).toBeDefined();
    const html = renderReport(report);
    expect(html).toContain(escapeHtml(report.altitude!.assumedAudience));
  });

  it("embeds a CSP meta and nonce when a nonce is supplied", async () => {
    const report = await buildReport();
    const html = renderReport(report, { nonce: "abc123XYZ" });
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain(`nonce-abc123XYZ`);
    expect(html).toContain(`<style nonce="abc123XYZ">`);
  });

  it("escapes HTML metacharacters in the prose so markup can't break", () => {
    const report = {
      version: "0.1.0",
      target: {},
      extractedText: 'a <script>alert("x")</script> & b',
      metrics: {} as CoachReport["metrics"],
      findings: [] as Finding[],
      dimensions: [],
      grade: "B",
      meta: { deterministicOnly: false, lowProseConfidence: false },
    } satisfies CoachReport;
    const html = renderReport(report);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });
});

describe("collectMarks / renderHighlightedText", () => {
  const text = "alpha beta gamma delta";

  function finding(spans: { start: number; end: number }[]): Finding {
    return {
      ruleId: "test.rule",
      category: "clarity",
      method: "deterministic",
      severity: "warning",
      message: "m",
      spans,
    };
  }

  it("keeps non-overlapping marks in order", () => {
    const marks = collectMarks(
      [finding([{ start: 0, end: 5 }]), finding([{ start: 11, end: 16 }])],
      text.length,
    );
    expect(marks.map((m) => [m.start, m.end])).toEqual([
      [0, 5],
      [11, 16],
    ]);
  });

  it("drops a later mark that overlaps an earlier one", () => {
    const marks = collectMarks(
      [finding([{ start: 0, end: 10 }]), finding([{ start: 5, end: 16 }])],
      text.length,
    );
    expect(marks).toHaveLength(1);
    expect([marks[0]?.start, marks[0]?.end]).toEqual([0, 10]);
  });

  it("clamps out-of-range spans and drops empty/inverted ones", () => {
    const marks = collectMarks(
      [
        finding([
          { start: -5, end: 3 },
          { start: 18, end: 999 },
          { start: 7, end: 7 },
        ]),
      ],
      text.length,
    );
    expect(marks.map((m) => [m.start, m.end])).toEqual([
      [0, 3],
      [18, text.length],
    ]);
  });

  it("wraps highlighted ranges in <mark> with a severity class and leaves the rest plain", () => {
    const html = renderHighlightedText(text, [finding([{ start: 0, end: 5 }])]);
    expect(html).toContain('<mark class="sev-warning"');
    expect(html).toContain(">alpha</mark>");
    expect(html).toContain("beta gamma delta");
  });

  it("returns plain escaped text when there are no spans", () => {
    const html = renderHighlightedText("x < y", []);
    expect(html).toBe("x &lt; y");
    expect(html).not.toContain("<mark");
  });
});

describe("interactive controls", () => {
  function reportWithFinding(): CoachReport {
    return {
      version: "0.1.0",
      target: {},
      extractedText: "the optimization was performed by us",
      metrics: {} as CoachReport["metrics"],
      findings: [
        {
          ruleId: "strunk.active-voice",
          patternName: "Zombie Sentence",
          category: "clarity",
          method: "heuristic",
          severity: "warning",
          message: "passive voice",
          why: "hides the actor",
          spans: [{ start: 4, end: 16 }],
        },
      ],
      dimensions: [],
      grade: "B",
      meta: { deterministicOnly: false, lowProseConfidence: false },
    } satisfies CoachReport;
  }

  it("renders the audience selector with the supplied options and selection", () => {
    const html = renderReport(reportWithFinding(), {
      audiences: ["ML peer", "Layperson"],
      currentAudience: "ML peer",
    });
    expect(html).toContain('<select id="audience">');
    expect(html).toContain('<option value="ML peer" selected>ML peer</option>');
    expect(html).toContain("Layperson");
  });

  it("renders a reveal button carrying the finding index", () => {
    const html = renderReport(reportWithFinding());
    expect(html).toContain('data-finding="0"');
    expect(html).toContain(">reveal</button>");
  });

  it("declutters the card: Why/Fix as a definition list, no citation line", () => {
    const report = reportWithFinding();
    report.findings[0]!.source = "Strunk & White — omit needless words.";
    const html = renderReport(report);
    // Why/Fix recede into a tight definition list rather than stacked paragraphs.
    expect(html).toContain('<dl class="card-wf">');
    expect(html).toContain("<dt>Why</dt>");
    // The finding keeps its source in the data — the card just never shows it.
    expect(report.findings[0]!.source).toBe("Strunk & White — omit needless words.");
    expect(html).not.toContain("card-src");
    expect(html).not.toContain("omit needless words");
  });

  it("emits a nonce'd controller that posts setAudience and reveal messages", () => {
    const html = renderReport(reportWithFinding(), { nonce: "N1" });
    expect(html).toContain('<script nonce="N1">');
    expect(html).toContain('type: "setAudience"');
    expect(html).toContain('type: "reveal"');
    // CSP must allow the nonce'd script.
    expect(html).toContain("script-src 'nonce-N1'");
  });
});
