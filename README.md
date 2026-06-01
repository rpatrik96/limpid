# Limpid

> *Clear writing, and the reason it's clear.*

An educational writing coach for academic prose, in VS Code. Limpid scores your
writing against **good** writing — Orwell, Strunk & White, Hemingway, the
Economist, Pinker's curse-of-knowledge — not the way academics usually write, and
it **teaches *why*** a passage fails: it names the failure pattern, explains the
cognitive reason, and shows a before/after. It runs locally; your drafts never
leave your machine.

It is built for LaTeX (and plain prose): point it at a `.tex` selection and it
strips the markup, scores four dimensions, and coaches it.

## Where it lives

Limpid adds a **Coach** view to the Activity Bar (the Limpid icon in the left
sidebar). Trigger an analysis from there, or:

- **right-click** a selection → *Limpid: Coach this selection / section*,
- press **⌘⌥L / Ctrl+Alt+L** (coaches the selection, or the whole file if nothing
  is selected),
- run **Limpid: Coach a section…** to pick a `\section`/`\subsection`/… and coach
  just that (it includes nested subsections),
- or click **Coach selection** / **Coach section…** in the view itself.

Whatever you coached is remembered, so **saving the file re-runs the same scope**
(re-analysis happens on save only, never on keystroke — toggle with
`limpid.reanalyzeOnSave`).

## What it does

- **Highlights** the extracted prose, Hemingway-style — long sentences, passive
  voice, hedges, fillers, weak openers.
- **Coaches** with cards: a named pattern (Buried Lede, Idea Soup, Hedge
  Stacking…) → *why it fails* → a before/after fix → the rule it comes from.
- **Audience altitude:** judges whether the prose sits at the right level for its
  reader. Limpid infers the reader, and you can change it in the view to re-run.
- **Grade + dimensions** (Accessibility / Clarity / Flow / Precision) with a
  delta vs. your last run on the same file.
- **Protects your voice:** it will not punish em-dashes, colon-payoffs, or long
  sentences that resolve cleanly — the test is the Economist's "must it be read
  twice?", not raw length. Scope-hedging is a virtue; conviction-hedging is a fault.

The mechanical checks are deterministic (auditable, instant). The four judgment
calls that need understanding — stress position, paragraph cohesion, audience
altitude, argument flow — use a language model. Pick one with `limpid.provider`
(default `auto`):

| `limpid.provider` | What it uses | Key? |
|---|---|---|
| `auto` | free Copilot, then any API key you've set | — |
| `copilot` | GitHub Copilot via the VS Code LM API — **the free tier works** | no |
| `claude-code` | the local Claude Code CLI (`claude -p`), your subscription auth | no |
| `ollama` | a local model via Ollama (`limpid.ollama.baseURL`) | no |
| `anthropic` | the Anthropic API | yes |
| `openai` / `openrouter` / `groq` / `together` / `mistral` | those APIs | yes |
| `openai-compatible` | any OpenAI-compatible endpoint (`limpid.openaiCompatible.baseURL`) | optional |

With no provider available it runs **deterministic-only** — still a useful report,
just without the four LLM lenses.

**Keys live in the OS keychain, never settings.** Run **“Limpid: Set API Key”** to
store one (masked input → `SecretStorage`), and **“Limpid: Clear API Key”** to
remove it. The keyless paths (Copilot, Claude Code CLI, Ollama) need no key at all.

> **Copilot Free is enough.** Sign into GitHub in VS Code and enable Copilot
> (Free plan, no card); the first coach run asks for one-time consent. The Free
> tier shares a small monthly request quota, so on `Blocked`/quota errors Limpid
> degrades to a deterministic report and tells you.

## Try it

```bash
npm install
npm test                       # 192 tests across the core + extension
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

## Architecture

A front-end-agnostic core (so a web app can reuse it) plus one VS Code front-end:

| Package | Job |
|---|---|
| `@coach/contract` | shared types (`CoachReport`, `Finding`, `Extraction`, `RubricConfig`, `LanguageModel`) |
| `@coach/engine` | deterministic metrics + findings (pure) |
| `@coach/latex` | `.tex` → extracted prose + coarse source map (pure) |
| `@coach/rubric` | the canon as data: rules, 12 named patterns, thresholds, voice guards |
| `@coach/coach` | LLM judgment (4 lenses + diagnosis) → `CoachReport`; the `eval/` golden-set harness |
| `@coach/providers` | host-side `LanguageModel` adapters (OpenAI-compatible, Anthropic, Claude-Code-CLI) shared by the extension + eval |
| `apps/extension` | command + webview coach panel; Copilot adapter + the `@coach/providers` adapters; SecretStorage keys |

See [DESIGN.md](DESIGN.md) for the full spec and [AGENTS.md](AGENTS.md) for repo
conventions.

## Status

v0/v1: the deterministic path and the webview (highlights, cards, audience
control, reveal-in-editor) work end-to-end; the LLM lenses are implemented and
unit-tested against a mock model, and wired in the host to Copilot, the Claude
Code CLI, Ollama, and the API providers (Anthropic / OpenAI / OpenRouter / Groq /
Together / Mistral) with SecretStorage-backed keys and graceful deterministic
fallback. Not yet built: the editable-rules GUI, the learning center /
gamification, trends over time, the public web surface, and inline `.tex`
squiggles (all v2).
