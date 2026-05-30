# Repo conventions (read before editing)

A TypeScript monorepo (npm workspaces) for **Limpid**, an educational writing-coach VS Code extension.
The analysis core knows nothing about VS Code, so a web front-end can reuse it later.

## Layout

```
packages/
  contract/   @coach/contract  — shared types (DO NOT change lightly; everything imports it)
  engine/     @coach/engine    — deterministic metrics + findings; pure, no I/O
  latex/      @coach/latex     — .tex → extracted prose + coarse source map
  rubric/     @coach/rubric    — the canon as data (rules, 12 patterns, thresholds, voice guards)
  coach/      @coach/coach     — LLM judgment → CoachReport (provider-abstracted; mock provider)
apps/
  extension/                   — VS Code extension: command + webview coach panel
```

## Hard rules

- **Import the contract, don't redefine it.** All cross-package types come from `@coach/contract`.
- **Pure where possible.** `engine`, `latex`, `rubric` must have **no** dependency on `vscode`, the
  network, or the filesystem at runtime. Only `coach` touches a `LanguageModel`, and only through
  the `@coach/contract` interface. Only `apps/extension` may import `vscode`.
- **Spans are offsets into the extracted prose** (`Extraction.text`), never the raw `.tex`.
- **ESM.** Packages are `"type": "module"`; `package.json` `main`/`exports` point at `./src/index.ts`
  (tests/bundler consume TS source — no build step needed for `npm test`).
- **The extension bundles with esbuild** to CommonJS (`format: "cjs"`, `platform: "node"`,
  `external: ["vscode"]`). It is the one package that is CJS at runtime.

## Each package must ship

- `package.json` (name `@coach/<x>`, `"type":"module"`, `main`/`types`/`exports` → `./src/index.ts`,
  a `"typecheck": "tsc --noEmit"` script, deps on `@coach/contract` etc. via `"*"`).
- `tsconfig.json` extending `../../tsconfig.base.json`.
- `src/index.ts` (public surface) + focused modules.
- `src/**/*.test.ts` vitest tests, including the **false-positive tails** (e.g. copular "is important"
  is not passive; "optimization/distribution" are terms-of-art, not zombie nouns).

## Commands

- `npm install` (root) — links workspaces.
- `npm test` — vitest across all packages (no build needed).
- `npm run typecheck` — `tsc --noEmit` per package.
- `npm run build -w apps/extension` — esbuild bundle.

## Voice guardrail (important)

The first user is an ML researcher whose endorsed style **keeps** em-dash interpolations, colon-payoffs,
and long clause-stacking *that resolves cleanly*. Do NOT hard-penalize these. The operative test for an
over-long sentence is the Economist's "must it be read twice?", not raw length. Hedging **scope**
("sufficient but not necessary") is a virtue; hedging **conviction** ("arguably", "it could be argued")
is a fault. The `rubric` encodes this as `VoiceGuard`s; the `coach` must honor them.
