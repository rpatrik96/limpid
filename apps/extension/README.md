# Limpid

> _Clear writing, and the reason it's clear._

An educational writing coach for academic prose, in VS Code. Limpid scores your
writing against **good** writing — Orwell, Strunk, the Economist, Gopen &
Swan, Pinker's curse-of-knowledge — and **teaches _why_** a passage fails:
it names the failure pattern, explains the cognitive reason, and shows a
before/after. It runs locally; your drafts never leave your machine.

## Use it

Open a `.tex` (or any prose) file, select a paragraph — or nothing, to coach the
whole file — and run **“Limpid: Coach this selection / section”** from the Command
Palette. A panel opens with:

- **highlighted prose** (long sentences, passive voice, hedges, fillers),
- **coach cards**: pattern → _why_ → before/after → source, each with a **reveal**
  button that selects the span back in your editor,
- an **audience** control — change the target reader to re-score at a new altitude,
- a **grade** + dimension bars + delta vs. your last run.

## The LLM lenses

The mechanical checks are deterministic. The four judgment calls — stress
position, paragraph cohesion, audience altitude, argument flow — use a language
model chosen by `limpid.provider` (default `auto`):

- **Copilot** — the VS Code LM API; **the free tier works** (sign in + one-time
  consent), no key.
- **Claude Code CLI** (`claude-code`) — runs `claude -p` against your Claude
  subscription, no key.
- **Ollama** — a local model, no key.
- **API providers** — Anthropic, OpenAI, OpenRouter, Groq, Together, Mistral, or
  any OpenAI-compatible endpoint.

With none available it returns a **deterministic-only** report and tells you.

**API keys live in the OS keychain, never settings.** Run **“Limpid: Set API
Key”** to store one and **“Limpid: Clear API Key”** to remove it.

## Settings

- `limpid.provider` — which provider (default `auto`).
- `limpid.model` — override the model id (empty = provider default).
- `limpid.audience` — default target reader (empty = infer).
- `limpid.ollama.baseURL`, `limpid.claudeCode.command`,
  `limpid.openaiCompatible.baseURL` / `.model` — endpoint config for the local /
  custom providers.

Source and design notes: <https://github.com/rpatrik96/limpid>.
