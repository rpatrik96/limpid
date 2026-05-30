# Limpid

> *Clear writing, and the reason it's clear.*

An educational writing coach for academic prose, in VS Code. Limpid scores your
writing against **good** writing — Orwell, Strunk & White, Hemingway, the
Economist, Pinker's curse-of-knowledge — and **teaches *why*** a passage fails:
it names the failure pattern, explains the cognitive reason, and shows a
before/after. It runs locally; your drafts never leave your machine.

## Use it

Open a `.tex` (or any prose) file, select a paragraph — or nothing, to coach the
whole file — and run **“Limpid: Coach this selection / section”** from the Command
Palette. A panel opens with:

- **highlighted prose** (long sentences, passive voice, hedges, fillers),
- **coach cards**: pattern → *why* → before/after → source, each with a **reveal**
  button that selects the span back in your editor,
- an **audience** control — change the target reader to re-score at a new altitude,
- a **grade** + dimension bars + delta vs. your last run.

## The LLM lenses

The mechanical checks are deterministic. The four judgment calls — stress
position, paragraph cohesion, audience altitude, argument flow — use a model when
available: **Copilot** (VS Code LM API), else **Claude** (set
`limpid.anthropicApiKey`), else a **deterministic-only** report.

## Settings

- `limpid.audience` — default target reader (empty = infer).
- `limpid.anthropicApiKey` — used only when Copilot is unavailable.

Source and design notes: <https://github.com/rpatrik96/limpid>.
