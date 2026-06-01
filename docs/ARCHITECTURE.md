# Architecture

Limpid is an educational VS Code writing coach for academic prose. It scores a passage against _good_
writing — Orwell, Strunk & White, Hemingway, the Economist, Pinker — and teaches _why_ a passage fails:
a named failure pattern, the reason it fails, and a before/after rewrite. The grade is secondary; the
lesson is the product.

This document is the map of how the code is laid out and why. For the full design rationale — principles,
the rubric content, the staging plan — see [DESIGN.md](../DESIGN.md).

## The shape: agnostic core + host layer + front-ends

Limpid is a TypeScript monorepo (npm workspaces, ESM, Node 22) split into three rings:

- **The core is front-end-agnostic.** `@coach/{contract,engine,latex,rubric,coach}` know nothing about
  VS Code, the network, or the filesystem. They take text in and produce a `CoachReport` out. A web
  front-end can reuse the same core unchanged.
- **The host layer adapts the core to a real environment.** `@coach/providers` holds the host adapters
  that _do_ reach out — `fetch` to an HTTP API, `child_process` to a CLI. It is the only core-adjacent
  package allowed I/O.
- **The front-ends consume the core.** `apps/extension` is the VS Code extension; `apps/cli` is the
  deterministic `limpid` gate. Each owns its own host concerns (a webview, a process exit code) and
  leans on the core for everything else.

Everything communicates through `@coach/contract`. Import the contract; never redefine its types.

## Packages

| Package            | Job                                                                                                                                                                                                                                              | Purity                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| `@coach/contract`  | Shared types — `CoachReport`, `Finding`, `Extraction`, `RubricConfig`, `LanguageModel`. Everything imports it; nothing else depends on the others through anything but this.                                                                     | types only                       |
| `@coach/engine`    | Deterministic metrics and findings — filler, Flesch–Kincaid grade, sentence-length variance, passive voice, hedges, adverbs, acronyms. Runs in milliseconds. `analyze(text) → EngineResult`.                                                     | pure                             |
| `@coach/latex`     | `.tex` → extracted prose plus a coarse source map and per-section split. `extract(tex) → Extraction`. Spans are offsets into the _extracted_ prose, never the raw `.tex`.                                                                        | pure                             |
| `@coach/rubric`    | The canon as data — rules, the named failure patterns, section thresholds, voice guards, grade bands. Also the editable-rules surface (`runDetector`, `parseUserRules`, `mergeRubric`).                                                          | pure                             |
| `@coach/coach`     | LLM judgment — the four lenses, named-pattern diagnosis, _why_ + before/after, scoring — assembled into a `CoachReport`. Talks to a model only through the `LanguageModel` contract interface; ships a mock model and a golden-set eval harness. | pure (one LM interface)          |
| `@coach/providers` | Host adapters behind `LanguageModel` — an OpenAI-compatible HTTP adapter (OpenAI / OpenRouter / Groq / Together / Mistral), an Anthropic adapter, and a CLI adapter (`claude -p`, Ollama). Per-provider JSON-mode flags.                         | host (`fetch` / `child_process`) |
| `apps/extension`   | The VS Code extension (publisher `rpatrik96`, name `limpid`). Activity-Bar "Coach" view, command + webview panel, Copilot via the `vscode.lm` API, SecretStorage keys, save-triggered re-analysis.                                               | VS Code host                     |
| `apps/cli`         | The `limpid` CLI — a deterministic gate for CI and pre-commit, with an example GitHub Action.                                                                                                                                                    | Node host                        |

## Data flow

```
latex.extract(tex)                  →  Extraction      (prose + source map + sections)
engine.analyze(extraction.text)     →  EngineResult    (deterministic metrics + findings)
coach.review({ extraction, engine,  →  CoachReport     (lenses + diagnosis + grade + altitude)
               rubric, audience?, model? })
CoachReport                         →  webview / CLI exit code
```

The extractor turns a `.tex` file into clean prose plus a coarse source map. The engine scores that
prose deterministically. The coach takes the extraction, the engine result, and the rubric, optionally
calls a `LanguageModel`, and emits a `CoachReport`. The front-end renders it — the extension paints
highlights, coach cards, a grade with dimension bars, and an altitude banner; the CLI turns it into a
pass/fail exit code.

## Form is scriptable; meaning is not

The split between the engine and the coach is the central design decision. Roughly ten of the fourteen
checks are deterministic — filler, readability grade, sentence variance, passive, hedges, adverbs,
acronyms — and need no model. The four that carry the most signal — stress position, old→new cohesion,
audience altitude, argument flow — are genuine judgment calls and need an LLM. The scorer is hybrid by
necessity: the script grounds and feeds the model, and the model judges. When no model is available the
report degrades to deterministic-only and stays useful, which is exactly what the CLI gate relies on.

## The provider abstraction

The coach depends on one interface, `LanguageModel` (in `@coach/contract`), and nothing else about how a
model is reached. That keeps `@coach/coach` pure and unit-testable against a mock. The concrete adapters
live in `@coach/providers` and the extension:

- **Copilot** through the VS Code `vscode.lm` API — the free tier works, subject to consent and shared
  quota. Only the extension can reach it, so it lives in `apps/extension`.
- **OpenAI-compatible** HTTP — one adapter covers OpenAI, OpenRouter, Groq, Together, and Mistral.
- **Anthropic** HTTP, and a **CLI adapter** for the keyless Claude Code CLI (`claude -p`) and Ollama.

`limpid.provider` defaults to `auto`: prefer free Copilot, then any configured API key. Keys live in the
OS keychain via SecretStorage (the _Set/Clear API Key_ commands), never in settings. On any model error
the host degrades to a deterministic report.

## Testing strategy

Tests run on the TypeScript source with **no build step**. Each package's `package.json` points `main`,
`types`, and `exports` at `./src/index.ts`, so vitest and the bundler consume source directly; `npm test`
runs the full suite (226 tests) across the workspaces.

- **engine** — golden-case unit tests per check, including the false-positive tails (copular "is
  important" is not passive; "optimization" / "distribution" are terms of art, not zombie nouns; the
  `-ly` adverb stoplist).
- **latex** — fixture `.tex` → expected prose and prose ratio.
- **rubric** — schema validation and rule-firing tests, plus the editable-rules detector.
- **coach** — contract tests against the mock `LanguageModel` and recorded fixtures; the
  deterministic-only path is tested with no model. The golden-set eval (`npm run eval`) scores a real
  provider against labelled cases.
- **providers** — the pure adapters (`openaiCompatible`, `claude`, `cliModel`) have no `vscode` import
  and are unit-tested directly.
- **extension** — renders a `CoachReport` to webview HTML as a smoke test.

The extension is the one package that is CommonJS at runtime: esbuild bundles it to `dist/extension.cjs`
(`format: "cjs"`, `platform: "node"`, `external: ["vscode"]`) via `npm run build -w apps/extension`. The
CLI builds to `apps/cli/dist/cli.js` via `npm run build -w apps/cli`.

## Extending

- **Add a rule.** Most rules are data in `@coach/rubric`; add the rule and its detector there, with a
  rule-firing test. Users add their own through `.limpid/rules.json`, parsed by `parseUserRules` and
  merged via `mergeRubric` — exercise it in the _Test Rule_ playground.
- **Add a provider.** Implement the `LanguageModel` interface in `@coach/providers` (or wrap a host API
  in the extension), register it in the provider presets, and add JSON-mode flags if the backend needs
  them. Keep the adapter free of `vscode` so the eval harness can run it.
- **Add a register.** Registers (paper / blog / grant / sop) select thresholds and altitude defaults in
  `@coach/rubric`; add the register's profile there and wire it to `limpid.register` / `--register` and
  the file-type auto-detection.

For the principles behind these seams — voice guards, audience altitude, the local-first stance — read
[DESIGN.md](../DESIGN.md).
