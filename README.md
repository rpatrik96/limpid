# Limpid

> *Clear writing, and the reason it's clear.*

An educational writing coach for academic prose, in VS Code. Limpid scores your
writing against **good** writing — Orwell, Strunk & White, Hemingway, the
Economist, Pinker's curse-of-knowledge — not the way academics usually write, and
it **teaches *why*** a passage fails: it names the failure pattern, explains the
cognitive reason, and shows a before/after. It runs locally; your drafts never
leave your machine.

It is built for LaTeX (and plain prose): point it at a `.tex` selection and it
strips the markup, scores four dimensions, and renders a coaching panel.

## What it does

- **Highlights** the extracted prose, Hemingway-style — long sentences, passive
  voice, hedges, fillers, weak openers.
- **Coaches** with cards: a named pattern (Buried Lede, Idea Soup, Hedge
  Stacking…) → *why it fails* → a before/after fix → the rule it comes from.
- **Audience altitude:** judges whether the prose sits at the right level for its
  reader. Limpid infers the reader, and you can change it in the panel to re-run.
- **Grade + dimensions** (Accessibility / Clarity / Flow / Precision) with a
  delta vs. your last run on the same file.
- **Protects your voice:** it will not punish em-dashes, colon-payoffs, or long
  sentences that resolve cleanly — the test is the Economist's "must it be read
  twice?", not raw length. Scope-hedging is a virtue; conviction-hedging is a fault.

The mechanical checks are deterministic (auditable, instant). The four judgment
calls that need understanding — stress position, paragraph cohesion, audience
altitude, argument flow — use a language model when one is available:

1. **Copilot** (VS Code Language Model API), else
2. **Claude** (set `limpid.anthropicApiKey`), else
3. **deterministic-only** — still a useful report, just without the LLM lenses.

## Try it

```bash
npm install
npm test                       # 176 tests across the core + extension
npm run build -w apps/extension
```

Then either **press F5** in VS Code (Extension Development Host) or install the
packaged build:

```bash
npx --yes @vscode/vsce package      # builds limpid-<version>.vsix
code --install-extension limpid-*.vsix
```

Open a `.tex` file, select a paragraph (or none, for the whole file), and run
**“Limpid: Coach this selection / section”** from the Command Palette.

## Architecture

A front-end-agnostic core (so a web app can reuse it) plus one VS Code front-end:

| Package | Job |
|---|---|
| `@coach/contract` | shared types (`CoachReport`, `Finding`, `Extraction`, `RubricConfig`, `LanguageModel`) |
| `@coach/engine` | deterministic metrics + findings (pure) |
| `@coach/latex` | `.tex` → extracted prose + coarse source map (pure) |
| `@coach/rubric` | the canon as data: rules, 12 named patterns, thresholds, voice guards |
| `@coach/coach` | LLM judgment (4 lenses + diagnosis) → `CoachReport` |
| `apps/extension` | command + webview coach panel; Copilot/Claude providers |

See [DESIGN.md](DESIGN.md) for the full spec and [AGENTS.md](AGENTS.md) for repo
conventions.

## Status

v0/v1: the deterministic path and the webview (highlights, cards, audience
control, reveal-in-editor) work end-to-end; the LLM lenses are implemented and
unit-tested against a mock model, and wired to Copilot/Claude in the host. Not yet
built: the editable-rules GUI, the learning center / gamification, trends over
time, the public web surface, and inline `.tex` squiggles (all v2).
