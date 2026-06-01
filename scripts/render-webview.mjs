#!/usr/bin/env node
/**
 * Render the Limpid webview panel to a real HTML file (and, if Playwright is
 * available, a PNG screenshot) — using the SAME pure renderer the extension
 * ships, so the demo asset can never drift from the shipped UI.
 *
 * Pipeline:
 *   1. esbuild bundles apps/extension/src/render.ts to a temp ESM module.
 *   2. import { renderReport } and feed it a realistic CoachReport.
 *   3. write media/demo/webview.html = renderReport(report, { nonce: "demo" }).
 *   4. if Playwright imports, screenshot a sidebar-width viewport to
 *      media/demo/webview.png; otherwise print how to enable it.
 *
 * Run (from repo root):  node scripts/render-webview.mjs
 */
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const renderSrc = join(repoRoot, "apps", "extension", "src", "render.ts");
const outDir = join(repoRoot, "media", "demo");
const htmlOut = join(outDir, "webview.html");
const pngOut = join(outDir, "webview.png");

/** Build a span that points at the first occurrence of `needle` in `text`. */
function span(text, needle) {
  const start = text.indexOf(needle);
  if (start < 0) throw new Error(`demo span not found in extractedText: ${JSON.stringify(needle)}`);
  return { start, end: start + needle.length };
}

/**
 * A short, realistic paragraph the panel highlights over. Spans below are
 * derived from this exact string so the offsets are always valid.
 */
const extractedText =
  "A great deal of prior work has explored the topic, and a variety of methods " +
  "have been proposed over the years. Experiments were performed by the authors " +
  "on a standard suite. We show that a simple identifiability criterion predicts " +
  "when a learned representation recovers the latent factors.";

/** A valid CoachReport per @coach/contract — grade B+, four dimensions, findings. */
const report = {
  version: "0.1.0",
  target: { file: "sample.tex", section: "Introduction", audience: "NeurIPS / ICML reviewer" },
  extractedText,
  metrics: {
    wordCount: 48,
    sentenceStats: {
      count: 4,
      meanWords: 12,
      stdWords: 6.2,
      cv: 0.52,
      longCount: 1,
      veryLongCount: 0,
      buckets: { short: 1, medium: 2, long: 1 },
      monotony: 0.34,
    },
    readability: {
      fleschKincaidGrade: 13.7,
      fleschReadingEase: 38.0,
      avgSentenceLength: 19.5,
      avgSyllablesPerWord: 1.7,
    },
    fillerDensity: 2.1,
    hedgeDensity: 1.0,
    boosterDensity: 0.0,
    adverbDensity: 1.2,
    passiveFraction: 0.5,
    weakOpenerCount: 1,
    undefinedAcronyms: ["SGD"],
    subjectVerbDistance: 3.4,
  },
  findings: [
    {
      ruleId: "coach.buried-lede",
      patternName: "Buried Lede",
      category: "flow",
      method: "llm",
      severity: "warning",
      message:
        "The paper's claim lands last; the opening spends two sentences on generic background.",
      why:
        "A reviewer decides what your paper is about in the first sentence. Background that any reader " +
        "could write tells them nothing — the identifiability result is the news, so it should lead.",
      suggestion: "Open on the contribution, then situate it against prior work.",
      before:
        "A great deal of prior work has explored the topic… We show that a simple identifiability criterion predicts…",
      after:
        "We give a simple identifiability criterion that predicts when a representation recovers the latent factors — sharpening a question prior work left open.",
      spans: [span(extractedText, "A great deal of prior work has explored the topic")],
      source:
        "Strunk & White, The Elements of Style — put the emphatic words at the end; lead with the point.",
      confidence: 0.78,
    },
    {
      ruleId: "engine.passive-voice",
      category: "clarity",
      method: "heuristic",
      severity: "suggestion",
      message: "Passive voice hides who acted.",
      why: "“were performed by the authors” buries the agent and adds words. Name the actor: you ran the experiments.",
      suggestion: "Rewrite in the active voice.",
      before: "Experiments were performed by the authors on a standard suite.",
      after: "We ran the experiments on a standard suite.",
      spans: [span(extractedText, "Experiments were performed by the authors")],
      source:
        "Orwell, Politics and the English Language (1946) — never use the passive where you can use the active.",
      confidence: 0.7,
    },
    {
      ruleId: "engine.undefined-acronym",
      category: "accessibility",
      method: "deterministic",
      severity: "info",
      message: "Acronym “SGD” is used before it is defined.",
      why: "An undefined acronym is a small cliff for any reader outside the immediate subfield — spell it out on first use.",
      suggestion: "Expand on first use: “stochastic gradient descent (SGD)”.",
      spans: [],
      source: "The Economist Style Guide — define abbreviations at first appearance.",
      confidence: 0.95,
    },
    {
      ruleId: "engine.wordiness",
      category: "precision",
      method: "heuristic",
      severity: "suggestion",
      message: "“a variety of methods have been proposed over the years” is filler.",
      why: "It states nothing a reader did not assume. Cut the throat-clearing and name the methods that matter.",
      suggestion: "Replace with the specific prior approaches you build on.",
      spans: [span(extractedText, "a variety of methods have been proposed over the years")],
      source: "Strunk & White — omit needless words.",
      confidence: 0.66,
    },
  ],
  dimensions: [
    {
      key: "clarity",
      score: 7.5,
      weight: 0.3,
      notes: "One passive construction; otherwise direct.",
    },
    { key: "precision", score: 6.8, weight: 0.3, notes: "Some throat-clearing in the opener." },
    { key: "flow", score: 6.0, weight: 0.2, notes: "Buried lede costs the opening its punch." },
    { key: "accessibility", score: 8.2, weight: 0.2, notes: "One undefined acronym (SGD)." },
  ],
  grade: "B+",
  altitude: {
    assumedAudience: "NeurIPS / ICML reviewer",
    inferred: true,
    verdict:
      "Pitched about right for a reviewer, but the generic opener under-sells a sharp result.",
    signals: [
      "dense methods vocabulary",
      "an identifiability claim",
      "no tutorial-level scaffolding",
    ],
  },
  delta: {
    previousGrade: "B",
    changed: { clarity: { from: 6, to: 7 }, flow: { from: 5, to: 6 } },
  },
  meta: {
    deterministicOnly: false,
    lowProseConfidence: false,
    note: "Demo render — fixture report, not a live analysis.",
  },
};

async function bundleRenderer() {
  const esbuild = await import("esbuild");
  const tmp = await mkdtemp(join(tmpdir(), "limpid-render-"));
  const bundlePath = join(tmp, "render.mjs");
  await esbuild.build({
    entryPoints: [renderSrc],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    outfile: bundlePath,
    logLevel: "silent",
  });
  return { bundlePath, cleanup: () => rm(tmp, { recursive: true, force: true }) };
}

async function screenshot(htmlPath) {
  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    console.log(
      "[render-webview] Playwright not installed — wrote webview.html only.\n" +
        "  For the PNG:  npm i -D playwright && npx playwright install chromium && node scripts/render-webview.mjs",
    );
    return false;
  }
  let browser;
  try {
    browser = await playwright.chromium.launch();
    const page = await browser.newPage({ viewport: { width: 460, height: 900 } });
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
    await page.screenshot({ path: pngOut, fullPage: true });
    console.log(`[render-webview] wrote ${pngOut}`);
    return true;
  } catch (err) {
    console.log(
      `[render-webview] Playwright screenshot failed (${err?.message ?? err}); webview.html is still written.`,
    );
    return false;
  } finally {
    if (browser) await browser.close();
  }
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const { bundlePath, cleanup } = await bundleRenderer();
  try {
    const mod = await import(pathToFileURL(bundlePath).href);
    const { renderReport } = mod;
    if (typeof renderReport !== "function") {
      throw new Error("renderReport not exported from apps/extension/src/render.ts");
    }
    const html = renderReport(report, { nonce: "demo" });
    await writeFile(htmlOut, html, "utf8");
    console.log(`[render-webview] wrote ${htmlOut}`);
  } finally {
    await cleanup();
  }
  await screenshot(htmlOut);
}

main().catch((err) => {
  console.error("[render-webview] failed:", err);
  process.exit(1);
});
