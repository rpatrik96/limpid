# Limpid — operator guide

> **Audience: an AI coding assistant** helping a user install, configure, and run
> Limpid (and the user, too). Everything here is self-contained and current; you do
> not need the source repo to act on it. Commands are exact. Relay facts plainly.
> If the user dropped this file into their own project (e.g. as `AGENTS.md` or
> `llms.txt`), treat it as the source of truth for how Limpid works.

## What Limpid is

A **local-first writing coach for academic prose**. It scores writing against _good_
writing — Orwell, Strunk & White, Hemingway, the Economist, Gopen & Swan, Pinker —
and **teaches why** a passage fails: it names the failure pattern (Buried Lede, Idea
Soup, Hedge Stacking…), gives the cognitive reason, and shows a before/after. Built
for LaTeX and Markdown (and plain prose).

**It judges rhetoric — clarity, structure, flow, voice — NOT grammar or spelling.**
It is a complement to a grammar/spell checker (Grammarly, LanguageTool), not a
replacement. If the user's need is articles/tense/typos, point them elsewhere; reach
for Limpid when the sentences are correct but the writing doesn't land.

**Local-first / privacy.** The deterministic checks run entirely offline. The four
LLM "lenses" send only the coached selection (or section) to the user's _own_ chosen
provider — never a whole project, never to any Limpid-operated server. API keys live
in the OS keychain, never in settings files.

## Two ways to use it

1. **VS Code extension** (`limpid-<version>.vsix`) — interactive coaching in the editor.
2. **`limpid` CLI** (`cli/limpid.js`) — a headless, deterministic writing gate for CI
   or a pre-commit hook. No editor, no LLM, no API key required.

This bundle contains both. Layout:

```
limpid-share-<version>/
  README.md              start-here for a human
  LIMPID_FOR_LLMS.md     this file
  limpid-<version>.vsix  the VS Code extension
  cli/limpid.js          the headless CLI (Node >= 20)
  examples/
    rules.json           starter .limpid/rules.json (house-style rules)
    .pre-commit-config.yaml
    github-action.yml
```

## Install the extension

```bash
code --install-extension limpid-<version>.vsix   # replace <version>, e.g. 0.0.14
```

Then reload VS Code. A **Limpid** icon appears in the Activity Bar with two views:
**Coach** (per-run report) and **Learn** (pattern library + your trends).

Coach a passage: open a `.tex` or `.md` file, select a paragraph (or select nothing
to coach the whole file), then either

- run **“Limpid: Coach this selection / section”** from the Command Palette,
- press **⌘⌥L** (macOS) / **Ctrl+Alt+L**,
- right-click → _Limpid: Coach…_, or
- run **“Limpid: Coach a section…”** to pick a `\section` / `#` heading.

The Coach view shows: highlighted prose, coach cards (pattern → why → before/after →
source, each with **reveal** and, for LLM findings, **apply fix**), an
audience-altitude control, and a grade with four dimensions (Accessibility, Clarity,
Flow, Precision).

**Inline diagnostics:** the deterministic checks also appear as editor squiggles +
Problems-panel entries with a hover and a “Coach this in Limpid” quick-fix.

**Save behaviour (important):** saving a file refreshes the _deterministic_ metrics
only — it never spends an LLM request, so a tight save loop or autosave cannot exhaust
a quota. The four LLM lenses re-run only on an explicit coach.

## Run the CLI

The CLI scores `.tex` and `.md` files (it picks the LaTeX or Markdown extractor by
extension) and exits non-zero on a threshold violation — drop it into CI or a
pre-commit hook. Requires **Node >= 20**.

```bash
node cli/limpid.js paper.tex                                  # report only (exit 0)
node cli/limpid.js --max-passive 0.4 --min-grade C intro.tex # gate (exit 1 if violated)
node cli/limpid.js --json sections/*.md                      # machine-readable
```

| Flag                 | Effect                                                                   |
| -------------------- | ------------------------------------------------------------------------ |
| `--max-passive <f>`  | fail if passive-voice fraction exceeds `f` (e.g. `0.4`)                  |
| `--max-fk <n>`       | fail if Flesch–Kincaid grade exceeds `n`                                 |
| `--max-filler <n>`   | fail if filler density (per 100 words) exceeds `n`                       |
| `--min-grade <G>`    | fail if the grade is below `G` (e.g. `C`)                                |
| `--register <r>`     | `paper` (default) \| `blog` \| `grant` \| `sop` \| `notes`               |
| `--json`             | emit JSON instead of one line per file                                   |
| `--rules <path>`     | use this house-rules file instead of discovering one                     |
| `--no-user-rules`    | score against the shipped rubric alone                                   |
| `--max-severity <s>` | fail if any finding is at least `info`\|`suggestion`\|`warning`\|`error` |

`--register` also accepts `notes`: internal analytic prose — research notes, audits,
decision records, written for one reader who already has the context and re-read cold
months later. It weights flow above `paper`'s, because the failure mode there is a wall
of text rather than an imprecise claim, and it targets a lower reading grade.

**`--json` carries the findings themselves**, not just a count — `ruleId`, `category`,
`severity`, `message`, the 1-based `line` in the _source_ file (via the extraction's
source map), and a trimmed `excerpt`. Ordered most severe first, then by line, so a
caller can truncate without losing the important ones. This is what makes the gate
actionable: "grade dropped to B+" is not something a hook can fix, whereas
"house.changelog-voice at line 62" is.

**House rules in the gate.** For each file the CLI walks up from that file's
directory to the filesystem root and uses the nearest `.limpid/rules.json`, so
gating files from two workspaces in one command applies each workspace's own
rules. The file is read and validated once per path. A malformed file, or an
individual rule that fails validation, is reported on stderr and skipped — a bad
house rule never takes the gate down. In non-JSON mode the CLI prints how many
house rules it loaded and from where.

Exit codes: `0` = all files within thresholds; `1` = a violation or an unreadable
file; `2` = a usage error (e.g. a non-numeric threshold). A malformed numeric flag
fails loudly rather than silently disabling the gate.

The CLI is deterministic only — it never calls an LLM and needs no API key, so it is
safe in CI. (The LLM judgment lenses are extension-only.)

## Language models / bring your own key

The deterministic checks need no setup. The four judgment lenses (stress position,
paragraph cohesion, audience altitude, argument flow) need a model. Set
`limpid.provider` (default `auto`) in VS Code settings:

| `limpid.provider`                                         | Uses                                                 | Key? |
| --------------------------------------------------------- | ---------------------------------------------------- | ---- |
| `auto`                                                    | free Copilot, then any API key you've stored         | —    |
| `copilot`                                                 | GitHub Copilot via the VS Code LM API (Free tier OK) | no   |
| `claude-code`                                             | local Claude Code CLI (`claude -p`), your sub        | no   |
| `ollama`                                                  | local model via `limpid.ollama.baseURL`              | no   |
| `anthropic`                                               | Anthropic API                                        | yes  |
| `openai` / `openrouter` / `groq` / `together` / `mistral` | those APIs                                           | yes  |
| `openai-compatible`                                       | any OpenAI-compatible endpoint                       | opt. |

**Storing a key (BYO).** Run **“Limpid: Set API Key”**, pick the provider slot, paste
the key — it goes to the OS keychain (never settings). “Limpid: Clear API Key” removes
it; the picker shows which slots already hold a key.

**Any other provider** (DeepSeek, Fireworks, xAI/Grok, Perplexity, Cerebras, Azure
OpenAI, Gemini's OpenAI-compatible endpoint, a local proxy…) works via the
`openai-compatible` provider — it has its own key slot, so it never clobbers a real
OpenAI key. Example (DeepSeek):

```jsonc
// VS Code settings.json
"limpid.provider": "openai-compatible",
"limpid.openaiCompatible.baseURL": "https://api.deepseek.com/v1",
"limpid.openaiCompatible.model": "deepseek-chat"
// then: Command Palette → "Limpid: Set API Key" → openai-compatible → paste key
```

**Copilot Free is the lightest path but the weakest:** it shares a small monthly quota,
so under heavy use Limpid degrades to a deterministic report and says so. For sustained
use, store a provider key. With no provider available at all, every run is
deterministic-only (still useful — just without the four lenses).

## All settings (`limpid.*`)

| Setting                    | Type    | Default                     | Meaning                                                             |
| -------------------------- | ------- | --------------------------- | ------------------------------------------------------------------- |
| `provider`                 | enum    | `auto`                      | which model powers the LLM lenses (table above)                     |
| `model`                    | string  | `""`                        | override the model id for the chosen provider                       |
| `audience`                 | string  | `""`                        | default reader to judge altitude against; empty = inferred          |
| `register`                 | enum    | `auto`                      | `paper` \| `blog` \| `grant` \| `sop`; `auto` = blog for `.md`      |
| `reanalyzeOnSave`          | boolean | `true`                      | refresh deterministic metrics on save (never spends an LLM request) |
| `diagnostics.enabled`      | boolean | `true`                      | inline editor squiggles for the deterministic checks                |
| `history.enabled`          | boolean | `true`                      | record each run to `.limpid/history.json` for the Learn view        |
| `ollama.baseURL`           | string  | `http://localhost:11434/v1` | Ollama endpoint                                                     |
| `claudeCode.command`       | string  | `claude`                    | path to the Claude Code CLI binary                                  |
| `openaiCompatible.baseURL` | string  | `""`                        | custom OpenAI-compatible endpoint                                   |
| `openaiCompatible.model`   | string  | `""`                        | model id for the custom endpoint                                    |

## Editable rules (house style)

A team can encode its own rules in **`.limpid/rules.json`** at the workspace root (run
**“Limpid: Edit Rules”** to scaffold it). Each coach run merges them into the defaults
(same `id` overrides a built-in; a new `id` adds). Detector-backed rules feed the grade
and the Coach cards (and the deterministic CLI gate); test one against the current
selection with **“Limpid: Test Rule”**. A starter is in `examples/rules.json`.

Shape:

```jsonc
{
  "rules": [
    {
      "id": "house.no-foobar", // unique; reuse a built-in id to override it
      "name": "Avoid placeholder text",
      "category": "clarity", // accessibility | clarity | flow | precision | voice-guard | typography
      "source": "house style", // grounding citation
      "method": "deterministic", // deterministic | heuristic | hybrid | llm
      "severity": "warning", // info | suggestion | warning | error
      "rationale": "Placeholders like 'foobar' must not survive into a draft.",
      "detector": { "kind": "words", "words": ["foobar", "TODO"] },
      "examples": [{ "before": "the foobar baseline", "after": "the linear baseline" }],
    },
  ],
  "patterns": [], // optional: extra named LLM patterns
}
```

Detector kinds — **each carries its own payload key, and the key is not `words` for
three of the four**. Getting this wrong is the easiest mistake to make here: an
unrecognised detector is dropped and the rule is kept, so it loads, reports no error,
and silently never fires.

| Kind      | Shape                                                         | Matches               |
| --------- | ------------------------------------------------------------- | --------------------- |
| `words`   | `{ "kind": "words", "words": ["utilize"] }`                   | whole words           |
| `phrases` | `{ "kind": "phrases", "phrases": ["In recent years"] }`       | substrings            |
| `opener`  | `{ "kind": "opener", "prefixes": ["Moreover"] }`              | sentence-initial only |
| `regex`   | `{ "kind": "regex", "pattern": "\\bvery\\b", "flags": "gi" }` | the pattern           |

User regexes are guarded against catastrophic backtracking (no nested quantifiers,
≤ 500 chars) and fail soft if rejected.

**Verify a new rule fires before trusting it.** In the editor use "Limpid: Test Rule";
headless, write a file containing the thing you want caught and check the id appears:

```bash
node cli/limpid.js --json probe.md | grep '"ruleId": "house.'
```

## Behavioural notes to relay accurately

- **Voice is protected.** Limpid will not punish em-dashes, colon-payoffs, or long
  sentences that resolve cleanly; the test is "must it be read twice?", not raw length.
  Scope-hedging ("sufficient but not necessary") is fine; conviction-hedging
  ("arguably", stacked "might possibly") is the fault.
- **Apply-fix** is offered only on the LLM lenses' span-specific rewrites. A
  deterministic/heuristic rule's before/after is a _generic illustration_, so its card
  shows it but offers no apply button.
- **Reveal / apply-fix** map a finding back to the source with a whitespace-tolerant
  locator; on heavily-marked-up `.tex` a passage may occasionally not be locatable, in
  which case the rewrite is copied to the clipboard instead.
- **Citations & cross-refs:** every `\cite`/`\citet`/`\citep` and `\ref`/`\cref`/`\eqref`
  is read as a `[ref]` token; Limpid flags citation-as-subject, ≥3 stacked refs, and
  reference-led sentence openers as low-severity suggestions.
- **Markdown vs LaTeX:** `.md` uses a dedicated extractor (headings drive sectioning);
  a `.md` opened as plaintext is still treated as Markdown by extension.

## Troubleshooting

| Symptom                                      | Cause                                             | Fix                                                             |
| -------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------- |
| Report says "deterministic-only (no LLM)"    | no provider configured, or Copilot quota hit      | pick `limpid.provider` and store a key (Limpid: Set API Key)    |
| "no `<provider>` API key stored"             | provider chosen but no key                        | Limpid: Set API Key → that provider                             |
| "Copilot request blocked"                    | Free monthly quota or a content filter            | set a provider key, or switch `limpid.provider`                 |
| "couldn't locate that passage in the source" | markup-heavy span; best-effort mapping            | expected on dense `.tex`; the rewrite is on the clipboard       |
| "Coach a section…" finds nothing             | no `\section`/`#` headings in the file            | coach a selection or the whole file instead                     |
| no "apply fix" on a card                     | that finding is deterministic (illustrative only) | use the before/after as guidance; apply-fix is for LLM rewrites |
| CLI exits 0 but prose looks bad              | no thresholds were passed                         | add `--max-passive` / `--min-grade` etc. to make it gate        |

## Build from source (if given the repo instead of this bundle)

TypeScript monorepo, npm workspaces, **Node 22**, no build step for tests.

```bash
npm install
npm test                       # full suite
npm run build                  # build every workspace (extension .cjs + cli)
npm run build -w apps/extension && (cd apps/extension && npx --yes @vscode/vsce package --no-dependencies)
```

The analysis core (`@coach/contract`, `engine`, `extract-core`, `latex`, `markdown`,
`rubric`, `coach`) is pure and front-end-agnostic, so a different surface (e.g. a web
app) can reuse the same `CoachReport`. The host adapters live in `@coach/providers`;
the VS Code front-end is `apps/extension`, the gate is `apps/cli`.

## Provenance

Generated from Limpid. Match the `<version>` to the `.vsix` in this bundle. This guide
reflects the extension's behaviour and settings at that version; if you also have the
repo, `README.md`, `DESIGN.md`, and `docs/ARCHITECTURE.md` are the long-form sources.
