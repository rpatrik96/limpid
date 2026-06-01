# Contributing to Limpid

Thanks for helping improve Limpid — an educational VS Code writing coach for academic prose. This guide covers local setup, the project layout, the day-to-day workflow, and how to ship a release.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). To report a vulnerability, see [SECURITY.md](SECURITY.md).

## Prerequisites

- **Node 22** (the version in `.nvmrc`). With `nvm`, run `nvm use`.
- **npm** (ships with Node). The repo uses npm workspaces — do not mix in yarn or pnpm.
- **VS Code** to run and debug the extension.

```bash
nvm use            # or install Node 22 some other way
npm install        # installs all workspaces from the root
```

Install only from the repo root. npm resolves every workspace in one pass and links the internal `@coach/*` packages together.

## Monorepo layout

Limpid is a TypeScript monorepo (ESM, `"type": "module"`) split into pure packages and host adapters. The split is load-bearing: keep it.

| Workspace            | Role                                                                |
| -------------------- | ------------------------------------------------------------------- |
| `packages/contract`  | Shared types and schemas. Pure.                                     |
| `packages/engine`    | Scoring/analysis logic. Pure.                                       |
| `packages/latex`     | LaTeX parsing and span mapping. Pure.                               |
| `packages/rubric`    | Rules and registers (paper/blog/grant/sop). Pure.                   |
| `packages/providers` | Host adapters — `fetch`, `child_process`. The only impure boundary. |
| `packages/coach`     | LLM judgment: turns provider output into coaching feedback.         |
| `apps/extension`     | The VS Code extension (`publisher: rpatrik96`, name `limpid`).      |
| `apps/cli`           | The `limpid` CLI and the deterministic gate.                        |

> [!important]
> **`@coach/{contract,engine,latex,rubric}` are pure** — no `vscode`, no network, no filesystem. Side effects live in `@coach/providers` (host adapters) and `@coach/coach` (LLM calls). If you reach for `fetch`, `child_process`, or `fs` inside a pure package, you are in the wrong package. This is what keeps the core testable without a VS Code host or a network.

## Workflow loop

Run these from the root. They fan out across all workspaces.

```bash
npm test            # vitest run — 226 tests
npm run typecheck   # tsc across all workspaces
npm run lint        # eslint
npm run lint:fix    # eslint --fix
npm run format      # prettier --write
npm run format:check
npm run build       # build every workspace
npm run coverage    # vitest run --coverage
```

While iterating, `npm run test:watch` reruns affected tests on save.

Before opening a PR, the green path is: `npm run typecheck && npm test && npm run lint && npm run format:check && npm run build`. CI runs the same checks ([`ci.yml`](.github/workflows/ci.yml)), so matching it locally avoids round-trips.

## Running the extension

1. Open the repo in VS Code.
2. Press **F5** to launch the **Extension Development Host** — a second VS Code window with Limpid loaded from source.
3. Open a `.tex` or `.md` file. Use the Activity-Bar **Coach** view, the right-click menu, **Cmd+Alt+L**, or **"Coach a section…"**. Re-analysis fires on save.

Edits to extension source need a reload of the dev host (**Cmd+R** in that window). Changes in a pure package need a `npm run build -w <package>` first.

### Packaging a `.vsix`

```bash
npm run build -w apps/extension
cd apps/extension && npx @vscode/vsce package --no-dependencies
```

`--no-dependencies` is required: the bundle is produced by esbuild, so vsce should not try to re-resolve the workspace `node_modules`.

## Running the CLI

```bash
npm run build -w apps/cli        # -> apps/cli/dist/cli.js
node apps/cli/dist/cli.js --help
```

The CLI exposes the deterministic gate — the same scoring without an LLM in the loop — which is what CI and pre-commit use to keep results reproducible.

## Running the eval

The golden eval scores fixtures against the rubric and checks for regressions.

```bash
npm run eval
```

It calls a live provider, so set the relevant credentials first. Limpid reads keys from the OS keychain at runtime, but the eval picks them up from the environment:

```bash
export ANTHROPIC_API_KEY=...     # or
export OPENAI_API_KEY=...        # OpenRouter / Groq / Together / Mistral analogously
npm run eval
```

Skip the eval if you have no provider configured — it is not part of the default `npm test` run.

## Commits and pre-commit

- **[Conventional Commits](https://www.conventionalcommits.org/)**: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `perf:`. The message should explain _why_, not restate the diff.
- Keep commits atomic and focused.
- **husky + lint-staged** run on `git commit`: staged files are formatted and linted, and the deterministic checks run. If the hook rejects a commit, fix what it reports and commit again — don't bypass it.

The `prepare` script installs the husky hooks; it runs automatically after `npm install`.

## Pull requests

- Branch off `main`; keep `main` stable.
- Make sure the green path above passes locally.
- Describe the change and its motivation. Link any related issue.
- Touch only what your change needs — unrelated reformatting makes review harder.

## Release process

Releases are tag-driven.

1. Bump the version (`apps/extension/package.json`, and any package whose public surface changed).
2. Commit the bump.
3. Tag with `vX.Y.Z` and push the tag:

   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

4. The push triggers `release.yml`, which builds and publishes the artifacts.

Follow [semver](https://semver.org/): patch for fixes, minor for backward-compatible features, major for breaking changes.

## Questions

Open an issue on [rpatrik96/limpid](https://github.com/rpatrik96/limpid). For security issues, follow [SECURITY.md](SECURITY.md) instead of filing a public issue.
