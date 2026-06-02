# Limpid

> _Clear writing, and the reason it's clear._

[![CI](https://github.com/rpatrik96/limpid/actions/workflows/ci.yml/badge.svg)](https://github.com/rpatrik96/limpid/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.91-007ACC.svg)](https://code.visualstudio.com/)
[![tests](https://img.shields.io/badge/tests-282-brightgreen.svg)](#develop)

An educational writing coach for academic prose, in VS Code. Limpid scores your
writing against **good** writing — Orwell, Strunk & White, Hemingway, the
Economist, Pinker's curse-of-knowledge — not the way academics usually write, and
it **teaches _why_** a passage fails: it names the failure pattern, explains the
cognitive reason, and shows a before/after. It runs locally; your drafts never
leave your machine.

It is built for LaTeX and Markdown (and plain prose): point it at a `.tex` or
`.md` selection and it strips the markup, scores four dimensions, and coaches it.
In Markdown, headings (`#`…`######`) drive sectioning the way `\section` does in
LaTeX.

## Contents

- [Demo](#demo)
- [Install](#install)
- [Where it lives](#where-it-lives)
- [What it does](#what-it-does)
- [Editable rules (playground)](#editable-rules-playground)
- [Registers](#registers)
- [CLI gate](#cli-gate)
- [Develop](#develop)
- [Project layout](#project-layout)
- [Architecture](#architecture)
- [Status](#status)

## Demo

![Limpid CLI](media/demo/cli-demo.gif)

The deterministic CLI gate scoring a `.tex` section — grade, dimensions, and named
failure patterns, no editor required.

An in-editor screenshot of the sidebar Coach view (highlights + coaching cards)
lives alongside it at [`media/demo/webview.png`](media/demo/webview.png).

## Install

Grab a packaged `.vsix` (from a release, or build one below) and install it:

```bash
code --install-extension limpid-<version>.vsix
```

**Run from source (F5).** Clone, install, build the extension, then press **F5**
in VS Code to launch an Extension Development Host with Limpid loaded:

```bash
npm install
npm run build -w apps/extension
# then press F5 in VS Code
```

**Build the `.vsix` yourself:**

```bash
npm install
npm run build -w apps/extension
npx --yes @vscode/vsce package      # writes limpid-<version>.vsix
code --install-extension limpid-*.vsix
```

Open a `.tex` file, select a paragraph (or none, for the whole file), and run
**“Limpid: Coach this selection / section”** from the Command Palette.

## Where it lives

Limpid adds two views to the Activity Bar (the Limpid icon in the left sidebar):
**Coach** (the per-run report) and **Learn** (the pattern library + your trends
over time). Trigger an analysis from the Coach view, or:

- **right-click** a selection → _Limpid: Coach this selection / section_,
- press **⌘⌥L / Ctrl+Alt+L** (coaches the selection, or the whole file if nothing
  is selected),
- run **Limpid: Coach a section…** to pick a `\section`/`\subsection`/… (or, in
  Markdown, an `#`/`##`/… heading) and coach just that (nested subsections included),
- or click **Coach selection** / **Coach section…** in the view itself.

Whatever you coached is remembered, so **saving the file re-runs the same scope**
(re-analysis happens on save only, never on keystroke — toggle with
`limpid.reanalyzeOnSave`).

## What it does

- **Highlights** the extracted prose, Hemingway-style — long sentences, passive
  voice, hedges, fillers, weak openers.
- **Coaches** with cards: a named pattern (Buried Lede, Idea Soup, Hedge
  Stacking…) → _why it fails_ → a before/after fix → the rule it comes from.
- **Audience altitude:** judges whether the prose sits at the right level for its
  reader. Limpid infers the reader, and you can change it in the view to re-run.
- **Grade + dimensions** (Accessibility / Clarity / Flow / Precision) with a
  delta vs. your last run on the same file.
- **Protects your voice:** it will not punish em-dashes, colon-payoffs, or long
  sentences that resolve cleanly — the test is the Economist's "must it be read
  twice?", not raw length. Scope-hedging is a virtue; conviction-hedging is a fault.
- **Inline diagnostics:** the deterministic checks also surface as editor
  squiggles + Problems-panel entries in the `.tex` (refreshed on open/save), each
  with a hover explaining the rule and a "Coach this in Limpid" quick-fix. The LLM
  judgment lenses stay in the Coach view. Toggle with `limpid.diagnostics.enabled`.
- **Learns with you:** the **Learn** view is a browsable library of the named
  failure patterns plus a "your writing" panel — your most recurring patterns,
  recent grade trend, and metric averages across runs (recorded to
  `.limpid/history.json`; toggle with `limpid.history.enabled`).

The mechanical checks are deterministic (auditable, instant). The four judgment
calls that need understanding — stress position, paragraph cohesion, audience
altitude, argument flow — use a language model. Pick one with `limpid.provider`
(default `auto`):

| `limpid.provider`                                         | What it uses                                                       | Key?     |
| --------------------------------------------------------- | ------------------------------------------------------------------ | -------- |
| `auto`                                                    | free Copilot, then any API key you've set                          | —        |
| `copilot`                                                 | GitHub Copilot via the VS Code LM API — **the free tier works**    | no       |
| `claude-code`                                             | the local Claude Code CLI (`claude -p`), your subscription auth    | no       |
| `ollama`                                                  | a local model via Ollama (`limpid.ollama.baseURL`)                 | no       |
| `anthropic`                                               | the Anthropic API                                                  | yes      |
| `openai` / `openrouter` / `groq` / `together` / `mistral` | those APIs                                                         | yes      |
| `openai-compatible`                                       | any OpenAI-compatible endpoint (`limpid.openaiCompatible.baseURL`) | optional |

With no provider available it runs **deterministic-only** — still a useful report,
just without the four LLM lenses.

**Keys live in the OS keychain, never settings.** Run **“Limpid: Set API Key”** to
store one (masked input → `SecretStorage`), and **“Limpid: Clear API Key”** to
remove it. The keyless paths (Copilot, Claude Code CLI, Ollama) need no key at all.

> **Copilot Free is enough.** Sign into GitHub in VS Code and enable Copilot
> (Free plan, no card); the first coach run asks for one-time consent. The Free
> tier shares a small monthly request quota, so on `Blocked`/quota errors Limpid
> degrades to a deterministic report and tells you.

## Editable rules (playground)

Add or override rules without touching code: run **“Limpid: Edit Rules”** to
scaffold and open `.limpid/rules.json` in your workspace. Each coach run merges
your rules/patterns into the defaults (same `id` overrides, new `id` adds). Run a
detector-backed rule against the current selection with **“Limpid: Test Rule”**.

## Registers

`limpid.register` (or the CLI `--register`) adapts the grade to the kind of
writing — `paper` (default), `blog`, `grant`, `sop` — re-weighting the four
dimensions and shifting the readability target so a blog post isn't graded like a
paper. `auto` picks `blog` for `.md`/`.markdown`, `paper` otherwise.

## CLI gate

The `limpid` CLI runs the deterministic path headless — useful as a pre-commit or
CI gate that fails when prose regresses. Build it, then run it over a file:

```bash
npm run build -w apps/cli            # -> apps/cli/dist/cli.js
node apps/cli/dist/cli.js path/to/draft.tex --register paper
```

It shares the same engine, rubric, and registers as the extension, so the score
matches what you see in the editor.

## Develop

Day-to-day workflow lives in [CONTRIBUTING.md](CONTRIBUTING.md); the design and
package boundaries are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (with the
original spec in [DESIGN.md](DESIGN.md) and repo conventions in
[AGENTS.md](AGENTS.md)).

```bash
npm install
npm test            # 282 vitest tests across core + extension
npm run typecheck
npm run build       # build every workspace
npm run eval        # golden-set harness for the LLM lenses
```

Requires **Node 22**. Other root scripts: `test:watch`, `lint` / `lint:fix`,
`format` / `format:check`, `coverage`.

## Project layout

TypeScript monorepo, npm workspaces, ESM throughout.
`@coach/{contract,engine,extract-core,latex,markdown,rubric,history}` are pure (no
`vscode`, network, or `fs`); the host concerns live in the providers package and the
two apps.

| Workspace               | Job                                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `packages/contract`     | shared types (`CoachReport`, `Finding`, `Extraction`, `RubricConfig`, `LanguageModel`) — pure                    |
| `packages/engine`       | deterministic metrics + findings — pure                                                                          |
| `packages/extract-core` | format-agnostic extraction core: prose assembly, source map, section classification, span→source — pure          |
| `packages/latex`        | `.tex` → extracted prose + coarse source map — pure                                                              |
| `packages/markdown`     | `.md` → extracted prose + coarse source map; headings drive sectioning — pure                                    |
| `packages/rubric`       | the canon as data: rules, named patterns, thresholds, voice guards — pure                                        |
| `packages/coach`        | LLM judgment (4 lenses + diagnosis) → `CoachReport`; the `eval/` golden-set harness                              |
| `packages/providers`    | host-side `LanguageModel` adapters (OpenAI-compatible, Anthropic, Claude-Code-CLI) shared by the extension + CLI |
| `packages/history`      | pure aggregation of coaching runs over time (recurring patterns, grade trend, metric averages) — pure            |
| `apps/extension`        | the VS Code extension: Coach + Learn webviews, inline `.tex`/`.md` diagnostics, Copilot adapter, SecretStorage   |
| `apps/cli`              | the `limpid` deterministic gate (`apps/cli/dist/cli.js`)                                                         |

## Architecture

A front-end-agnostic core (so a web app can reuse it) plus a VS Code front-end and
a headless CLI. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the package
boundaries and data flow, [DESIGN.md](DESIGN.md) for the full spec, and
[AGENTS.md](AGENTS.md) for repo conventions.

## Status

The deterministic path and the webview (highlights, cards, audience control,
reveal-in-editor) work end-to-end; the LLM lenses are implemented and unit-tested
against a mock model, and wired in the host to Copilot, the Claude Code CLI,
Ollama, and the API providers (Anthropic / OpenAI / OpenRouter / Groq / Together /
Mistral) with SecretStorage-backed keys and graceful deterministic fallback.
It handles both LaTeX and Markdown — `.md` files extract through a dedicated
Markdown engine (frontmatter, fenced code, tables, and link URLs dropped; headings
drive sectioning) rather than the LaTeX stripper. Beyond the core: editable rules +
a rule playground (`.limpid/rules.json`), the `limpid` CLI gate, multi-register
coaching, inline `.tex`/`.md` diagnostics, and the **Learn** view (pattern library +
trends over time) all ship. Inline diagnostics
map findings back to source with a whitespace-tolerant snippet search — verbatim
accurate, with a precise per-character source map still to come; the Learn view's
recurring-pattern insight populates from the LLM-diagnosed patterns (the grade and
metric trend record even on deterministic-only runs). Not yet built: the public
web surface, a precise source map, and learning-center quizzes / gamification.
