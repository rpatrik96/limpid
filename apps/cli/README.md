# limpid CLI

Deterministic writing checks for CI / pre-commit gates — no LLM, no secrets. It
runs the same mechanical pipeline as the extension (extract → analyze → score) and
exits non-zero when a threshold is violated.

## Build & run

```bash
npm run build -w apps/cli
node apps/cli/dist/cli.js paper.tex                       # report only (exit 0)
node apps/cli/dist/cli.js --max-passive 0.4 --min-grade C sections/*.tex   # gate
node apps/cli/dist/cli.js --json paper.tex                # machine-readable
```

After `npm install` the binary is also linked as `limpid` in `node_modules/.bin`.

## Flags

| Flag | Effect |
|---|---|
| `--max-passive <f>` | fail if passive-voice fraction exceeds `f` (e.g. `0.4`) |
| `--max-fk <n>` | fail if Flesch–Kincaid grade exceeds `n` |
| `--max-filler <n>` | fail if filler density (per 100 words) exceeds `n` |
| `--min-grade <G>` | fail if the grade is below `G` (e.g. `C`) |
| `--json` | emit JSON instead of one line per file |

With no thresholds it just reports (exit 0). Any violation, or an unreadable file,
exits `1` — so it gates a CI job or a pre-commit hook.

## Pre-commit

```yaml
# .pre-commit-config.yaml
- repo: local
  hooks:
    - id: limpid
      name: limpid writing check
      entry: node /abs/path/to/limpid/apps/cli/dist/cli.js --max-passive 0.4
      language: system
      files: \.tex$
```

## GitHub Action

See [example-github-action.yml](example-github-action.yml) — copy it into your
paper repo's `.github/workflows/`.
