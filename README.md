# Limpid

> _Clear writing, and the reason it's clear._

[![CI](https://github.com/rpatrik96/limpid/actions/workflows/ci.yml/badge.svg)](https://github.com/rpatrik96/limpid/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.91-007ACC.svg)](https://code.visualstudio.com/)
[![tests](https://img.shields.io/badge/tests-400-brightgreen.svg)](#develop)

An educational writing coach for academic prose, in VS Code. Limpid scores your
writing against **good** writing — Orwell, Strunk, the Economist, Gopen &
Swan, Pinker's curse-of-knowledge — not the way academics usually write, and
it **teaches _why_** a passage fails: it names the failure pattern, explains the
cognitive reason, and shows a before/after. It runs locally; your drafts never
leave your machine.

It is built for LaTeX and Markdown (and plain prose): point it at a `.tex` or
`.md` selection and it strips the markup, scores four dimensions, and coaches it.
In Markdown, headings (`#`…`######`) drive sectioning the way `\section` does in
LaTeX.

Limpid judges **rhetoric** — clarity, structure, flow, voice — **not spelling or
grammar**. It complements a grammar/spell checker (Grammarly, LanguageTool); it does
not replace one. If your first need is articles, tense, and typos, reach for those;
reach for Limpid when the sentences are correct but the writing still doesn't land.

Sources, quotations and their copyright status are recorded in [NOTICE.md](NOTICE.md).

## Contents

- [Demo](#demo)
- [Install](#install)
- [Where it lives](#where-it-lives)
- [What it does](#what-it-does)
- [Editable rules (playground)](#editable-rules-playground)
- [Registers](#registers)
- [Sources](#sources)
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

Limpid is in **internal testing ahead of a public release**, so it isn't on the
Marketplace yet. Download the latest **`.vsix`** — or the full
`limpid-share-<version>.zip` bundle (extension + an LLM-readable operator guide + the
CLI + example configs) — from the repo's
[Releases](https://github.com/rpatrik96/limpid/releases) page, or build one below.
Then install:

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

Whatever you coached is remembered, so **saving the file re-runs the same scope** —
but a save refresh is deterministic-only (it never spends an LLM request), so a tight
save loop can't burn your quota; the writing lenses re-run on an explicit coach.
Toggle save-refresh with `limpid.reanalyzeOnSave`.

## What it does

- **Highlights** the extracted prose inline — long sentences, passive voice,
  hedges, fillers, weak openers.
- **Coaches** with cards: a named pattern (Buried Lede, Idea Soup, Hedge
  Stacking…) → _why it fails_ → a before/after fix. Each
  card can **reveal** the passage in the editor; where there's a concrete rewrite,
  **apply fix** inserts it (and falls back to your clipboard when the source carries
  markup).
- **Audience altitude:** judges whether the prose sits at the right level for its
  reader. Limpid infers the reader, and you can change it in the view to re-run.
- **Grade + dimensions** (Accessibility / Clarity / Flow / Precision) with a
  delta vs. your last run on the same file.
- **Protects your voice:** it will not punish em-dashes, colon-payoffs, or long
  sentences that resolve cleanly — the test is the Economist's "must it be read
  twice?", not raw length. Scope-hedging is a virtue; conviction-hedging is a fault.
- **Citations & cross-refs:** flags author-prominent framing (_"[ref] shows that…"_ →
  lead with the claim, cite it), citation pile-ups (three-plus stacked refs), and
  reference openers (_"As shown in [ref], …"_ → state it, then point) — over every
  `\cite`/`\citet` and `\ref`/`\cref`. Suggestions, not errors.
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
remove it (the picker shows which slots already hold a key). The keyless paths
(Copilot, Claude Code CLI, Ollama) need no key at all.

### Bring your own key

Limpid never bundles a key — every paid provider is bring-your-own. Set `limpid.provider`,
then store the matching key with **Limpid: Set API Key**:

- **Anthropic** — `limpid.provider: anthropic`, key slot `anthropic`.
- **OpenAI / OpenRouter / Groq / Together / Mistral** — `limpid.provider: <name>`, key slot
  `<name>`. Override the model with `limpid.model` (e.g. `gpt-4o`, `mistral-large-latest`).
- **Any other OpenAI-compatible endpoint** (DeepSeek, Fireworks, xAI/Grok, Perplexity, Cerebras,
  Azure OpenAI, Gemini's OpenAI-compatible endpoint, a local proxy…) — set `limpid.provider:
openai-compatible`, point `limpid.openaiCompatible.baseURL` at the endpoint, set
  `limpid.openaiCompatible.model`, and store the key under the **`openai-compatible`** slot. For
  example, for DeepSeek:

  ```jsonc
  // settings.json
  "limpid.provider": "openai-compatible",
  "limpid.openaiCompatible.baseURL": "https://api.deepseek.com/v1",
  "limpid.openaiCompatible.model": "deepseek-chat"
  // then: Limpid: Set API Key → openai-compatible → paste your key
  ```

  The custom endpoint has its own key slot, so it never clobbers your OpenAI key; a keyless
  local proxy needs no key at all.

> **Copilot Free is enough to start.** Sign into GitHub in VS Code and enable
> Copilot (Free plan, no card); the first coach run asks for one-time consent. It's
> the lightest LLM path: the Free tier shares a small monthly quota, so under heavy
> use Limpid degrades to a deterministic report and tells you — for sustained use,
> set a provider key (**Limpid: Set API Key**). Saving a file refreshes only the
> deterministic metrics, so a tight save loop never spends a request; the four
> judgment lenses re-run on an explicit coach.

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

## Sources

Every rule names the authority behind it, so you can go read the argument instead of
taking the rule on faith. The canon Limpid encodes:

- **George Orwell, "Politics and the English Language" (1946).** The six rules, one
  Limpid rule each: the dying metaphor, the long word where a short one will do, the
  word that can be cut, the passive where the active will serve, jargon with an everyday
  equivalent, and breaking any of them sooner than saying anything barbarous.
- **William Strunk Jr., _The Elements of Style_ (1918).** Rule 13, omit needless words —
  which also grounds the expletive-opener and "the fact that" checks — and Rule 10, use
  the active voice. Rule numbers are given as _1918 / 4th ed._ pairs (`13 / 17`,
  `10 / 14`), the second being the numbering readers of the modern edition know.
- **_The Economist Style Guide_.** The "must it be read twice?" test that decides whether
  a long sentence is actually a problem, plus undefined acronyms, redundant temporals,
  and "so-called".
- **Helen Sword, _The Writer's Diet_ (2016).** The four categories of verbal bloat:
  be-verbs, nominalizations, prepositional pile-up, and adjective/adverb bloat.
- **Ken Hyland, _Metadiscourse_ (2005).** The hedge/booster distinction, which grounds
  the boosters rule.
- **George D. Gopen and Judith A. Swan, "The Science of Scientific Writing," _American
  Scientist_ 78(6):550–558 (1990).** Subject–verb proximity, the stress position, and
  old-before-new cohesion — and three of the four LLM lenses.
- **John M. Swales and Christine B. Feak, _Academic Writing for Graduate Students_.**
  Integral versus non-integral citation, behind the citation-as-subject and
  weak-reference-opener rules.
- **[rpatrik96/research-agora](https://github.com/rpatrik96/research-agora)** (MIT, ©
  Patrik Reizinger). This project's own upstream: the twelve named failure patterns and
  the hedge and hype word lists, ported from `writing_verify.py`, `writing-diagnosis.md`,
  and `editorial-brain.md`.

A few rules cite **Limpid house style** instead — the citation pile-up threshold, for
one. Those are this project's calls, not anyone else's, and they say so.

[NOTICE.md](NOTICE.md) carries the detail: which passages are quoted and under what
right, which sources are named but never reproduced, and the copyright status of each.
The Strunk quotations come from the 1918 first edition, which is in the public domain;
E. B. White's revision is not quoted here.

## CLI gate

The `limpid` CLI runs the deterministic path headless — useful as a pre-commit or
CI gate that fails when prose regresses. Build it, then run it over a file:

```bash
npm run build -w apps/cli            # -> apps/cli/dist/cli.js
node apps/cli/dist/cli.js path/to/draft.tex --register paper
```

It shares the same engine, rubric, and registers as the extension, so the score
matches what you see in the editor. It also honours your house rules: the gate walks
up from each file to the nearest `.limpid/rules.json`, so one command over two
workspaces applies each workspace's own rules.

| Flag                                          | Effect                                           |
| --------------------------------------------- | ------------------------------------------------ |
| `--register paper\|blog\|grant\|sop`          | Grade for the kind of writing (default `paper`). |
| `--rules <path>`                              | Use this rules file instead of discovering one.  |
| `--no-user-rules`                             | Score against the shipped rubric alone.          |
| `--json`                                      | Machine-readable output.                         |
| `--max-passive` / `--max-fk` / `--max-filler` | Fail above these thresholds.                     |
| `--min-grade`                                 | Fail below this grade.                           |

A malformed or invalid rules file is reported on stderr and skipped — the gate still
runs, matching the extension's fail-soft behaviour.

## Develop

Day-to-day workflow lives in [CONTRIBUTING.md](CONTRIBUTING.md); the design and
package boundaries are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (with the
original spec in [DESIGN.md](DESIGN.md) and repo conventions in
[AGENTS.md](AGENTS.md)).

```bash
npm install
npm test            # 395 vitest tests across core + extension
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
a rule playground (`.limpid/rules.json`, whose detector rules feed the grade), the
`limpid` CLI gate, multi-register coaching, inline `.tex`/`.md` diagnostics,
one-click **apply-fix** on coach cards, and the **Learn** view (pattern library +
per-dimension and per-section trends over time) all ship. Reveal-in-editor and
apply-fix map a finding back to source with a whitespace-tolerant locator (so they
land on the right occurrence and survive markup); inline diagnostics use the same
locator, with a precise per-character source map still to come. Not yet built: the
public web surface, a precise source map, and learning-center quizzes / gamification.
