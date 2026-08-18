# Limpid — an educational coach for academic prose (design spec)

> **Limpid** — _clear writing, and the reason it's clear._ (Internal package scope stays `@coach/*`;
> the brand lives in the repo name + the extension manifest. Backup name considered: Plumbline.)

A **local-first VS Code extension** that scores academic writing against _good_ writing — Orwell,
Strunk & White, Hemingway, the Economist, Pinker — and **teaches _why_ a passage
fails**, not just where. It is modeled on the coaching UX of Microsoft's _AI-Engineering-Coach_ (a
VS Code dashboard: scored feedback, trends, editable rules, a learning surface), turned on prose.
The benchmark is good writing, **not** typical-academic writing, which the tool treats as the failure
mode to score against (Proustian sentences, hedging, jargon-for-show, pomposity).

First user is an ML researcher who edits LaTeX in VS Code with AI assistance; the next rings are his
students and a public release (a web front-end reusing the same core comes later).

## Principles

- **Teach, don't just flag.** The headline output is a _named failure pattern_ (Buried Lede, Idea
  Soup, Hedge Stacking…) with the cognitive reason it fails and a before/after — so the writer learns
  pattern recognition that transfers. The grade is secondary.
- **Form is scriptable; meaning is not.** ~10 of 14 checks are deterministic/heuristic (filler, FK
  grade, sentence variance, passive, hedges, adverbs, acronyms) and run in milliseconds. The four that
  matter most — stress position, old→new cohesion, **audience altitude**, argument flow — need an LLM.
  The scorer is **hybrid by necessity**: the script grounds and feeds the model; the model judges.
- **A front-end-agnostic core.** The analysis core (`engine`, `latex`, `rubric`, `coach`) knows
  nothing about VS Code. The extension is one front-end; a web app reuses the same `CoachReport`.
- **The panel renders its own prose.** A Hemingway-style webview highlights the _extracted_ text, so
  v1 needs **no** exact source-offset mapping. Inline `.tex` squiggles (TeXtidote/YaLafi) are a v2
  upgrade behind the same `latex` interface.
- **Audience altitude is inferred, but reconfigurable.** "Good" is reader-relative ("you talk to your
  colleagues and grandma differently"); the tool infers the target reader and lets the user override.
- **Protect the author's voice.** A naive Strunk/Hemingway scorer punishes prose this user calls good
  (em-dashes, clause-stacking that resolves cleanly, scope-hedging). `VoiceGuard`s temper those checks.
- **Local-first.** Unpublished papers never leave the machine; LLM calls go through the user's own
  Copilot subscription (VS Code LM API) or Claude, with a deterministic-only fallback.

## Architecture

A handful of units, each one job, communicating only through `@coach/contract`:

| Package               | Job                                                                                        | Depends on               | Purity           |
| --------------------- | ------------------------------------------------------------------------------------------ | ------------------------ | ---------------- |
| `@coach/contract`     | shared types (`CoachReport`, `Finding`, `Extraction`, `RubricConfig`, `LanguageModel`)     | —                        | types only       |
| `@coach/engine`       | deterministic metrics + findings (TS port of `research-agora/scripts/writing_verify.py`)   | contract                 | pure             |
| `@coach/extract-core` | format-agnostic prose assembly + source map + section classification + span→source         | contract                 | pure             |
| `@coach/latex`        | `.tex` → extracted prose + coarse source map (`strip_latex` port)                          | contract, extract-core   | pure             |
| `@coach/markdown`     | `.md` → extracted prose + coarse source map; ATX/setext headings drive sectioning          | contract, extract-core   | pure             |
| `@coach/rubric`       | the canon as data: rules, 12 named patterns, section thresholds, voice guards, grade bands | contract                 | pure             |
| `@coach/coach`        | LLM judgment (4 lenses + diagnosis + why + before/after) → `CoachReport`                   | contract, engine, rubric | one LM interface |
| `apps/extension`      | command + webview coach panel; `vscode.lm` + Claude providers; deterministic fallback      | all                      | VS Code          |

**Data flow:** `latex.extract(tex)` → `engine.analyze(extraction.text)` → `coach.review({extraction,
engine, rubric, audience?, model?})` → `CoachReport` → webview renders highlights + coach cards +
grade + altitude banner.

## Features (locked decisions)

- **Surface:** VS Code extension, engine-first. Command **"Coach this selection / section"** opens a
  webview panel.
- **Engine:** the ~834-line deterministic Python engine is **ported to TypeScript** (no Python runtime
  → clean public distribution).
- **LLM:** VS Code Language Model API (Copilot) primary, Claude fallback, mock for tests; absence ⇒
  deterministic-only report (still useful).
- **Altitude:** inferred from section/content, **user-reconfigurable** per run.
- **Panel:** (1) highlighted extracted prose — long/very-long sentences, passive, adverbs, hedges,
  fillers; (2) coach cards — pattern name → _why_ → before/after → rule link; (3) altitude banner with
  an audience control; (4) grade + dimension bars + delta-vs-last-run; (5) click a finding → reveal in
  the editor via text search.
- **Rules:** the canon ships as structured data now; an editable-rules GUI + rule playground is v2
  (AI-Engineering-Coach model).
- **Grounding content reused** from `research-agora/plugins/editorial/`: `writing-verify.md` (rubric),
  `writing-diagnosis.md` (12 patterns), `writing_verify.py` (engine logic).

## Rubric content (grounded + citable)

Dimensions and weights mirror the deployed MVP: **Accessibility 20%, Clarity 30%, Flow 20%,
Precision 30%** (Precision is the LLM dimension). Section thresholds: abstract FK 10–14 / passive
< 15%; methods FK ≤ 18 / passive ≤ 35%. Rule sources: Orwell's six, Strunk & White (omit needless
words, active voice, expletive openers), the Economist (read-twice penalty, acronym penalty, redundant
temporals), the Writer's Diet (bloat categories), Gopen & Swan (stress/topic position,
old→new — the LLM lenses), Pinker (curse-of-knowledge). Two vault gaps the exploration found —
no `[[Strunk&White]]` note, no Gopen–Swan note — are authored here as rule sources.

## Staging

- **v0 — walking skeleton:** `engine` + `latex(strip)` + `rubric(deterministic)` + minimal webview
  showing highlighted prose + deterministic findings. **No LLM.** Pure-TS, fully tested. _(this build)_
- **v1 — the coach:** the `coach` LLM layer (4 judgment lenses + named-pattern diagnosis + why +
  before/after) via `vscode.lm`/Claude; altitude infer/reconfigure; grade + section-aware thresholds +
  delta; click-to-reveal. _(scaffolded in this build; live model path wired, validated in the host)_
- **v2 — learning surface:** editable-rules GUI + rule playground; gamified learning center / pattern
  quizzes; trends over time; the public **web app** reusing the core; optional inline `.tex`
  diagnostics via TeXtidote/YaLafi behind the `latex` interface.

## Testing

`engine`: golden-case unit tests per check, including false-positive tails (copular "is important" ≠
passive; _optimization/distribution_ ≠ zombie nouns; `-ly` stoplist). `latex`: fixture `.tex` →
expected prose + proseRatio. `rubric`: schema + rule-firing tests. `coach`: contract tests against a
**mock** `LanguageModel` + recorded fixtures; deterministic-only path tested with no model.
`extension`: render `CoachReport` → webview HTML smoke test. `npm test` runs vitest with no build step.

## Error handling

No LM available → `deterministicOnly: true` report. Low `proseRatio` (math-heavy section) →
`lowProseConfidence: true`, soften verdicts. LLM uncertainty → surface as "review", not a hard verdict.
Malformed LLM JSON → validate + one retry, then drop the LLM findings and degrade gracefully.

## Open items

- **Final name** (Limpid / Plumbline / other) — renames repo folder + extension manifest only.
- **Repo home** confirmed: standalone repo (not inside the Jekyll `tools/` dir, not buried in
  research-agora). Reuses research-agora editorial content by porting.
- **Engine ⊂ rubric word-lists:** v0 duplicates a few word lists between `engine` and `rubric` to keep
  them independently buildable; unify (engine consumes rubric lists) in v1.

## Providers (v1.1)

`limpid.provider` (default `auto`) selects the model behind the LLM lenses: **Copilot** (VS Code LM
API — the **free tier** works; consent + shared quota; cheap-model-first), **Claude Code CLI**
(`claude -p`, keyless subscription auth), **Ollama** (keyless), **Anthropic**, and one
OpenAI-compatible adapter for **OpenAI / OpenRouter / Groq / Together / Mistral**. `auto` prefers free
Copilot, then any API key. Keys live in the **OS keychain** (SecretStorage) via _Limpid: Set/Clear API
Key_, never settings. On any model error the host degrades to a deterministic report. The pure adapters
(`openaiCompatible`, `claude`, `cliModel`) have no `vscode` import and are unit-tested.

## v2 — chosen direction (decided 2026-05-30)

- **Now — (A) LLM-lens hardening.** The four lenses were only mock-tested. This increment adds a
  few-shot example to the lens prompt and a **golden-set eval harness** (`packages/coach/src/eval/`,
  `npm run eval`) that scores any provider against labelled cases; run a real provider via
  `LIMPID_EVAL_BASE_URL` / `LIMPID_EVAL_API_KEY` / `LIMPID_EVAL_MODEL`. Still open in A: prompt
  calibration from eval results, per-provider JSON-mode capability flags, a larger golden set, and a
  pure `@coach/providers` package (extract the adapters out of `apps/extension`) so the eval and a
  future web app run real providers cleanly. (Copilot is only evaluable inside the extension host.)
- **Shipped — (E)** editable rules + rule playground (`.limpid/rules.json`, _Edit/Test Rule_ commands;
  pure `runDetector`/`parseUserRules`/`mergeRubric`), **(F)** the `limpid` CLI gate (`apps/cli`) +
  example GitHub Action / pre-commit, **(G)** multi-register coaching (`limpid.register` / `--register`:
  paper/blog/grant/sop, auto by file type), **(C)** inline `.tex` diagnostics — the deterministic checks
  as editor squiggles + Problems-panel entries, with a hover rationale and a _Coach this in Limpid_
  quick-fix; spans map back to source via the whitespace-tolerant `@coach/latex.locateSpanInSource`,
  **(D)** the Learning Center — a **Learn** view pairing the named-pattern library with a
  recurring-pattern / grade-trend / metric-average panel computed by the pure `@coach/history` over
  `.limpid/history.json`. Also extracted the host-side adapters into `@coach/providers`.
- **Shipped — Markdown.** `.md` files extract through a dedicated `@coach/markdown` engine (line-aware
  stripping of frontmatter, fenced code, GFM tables, HTML, images, and link URLs; emphasis/links/lists/
  blockquotes reduce to prose) with ATX/setext headings driving sectioning. The format-agnostic
  assembler, source map, title classifier, and span→source locator were factored into a shared pure
  `@coach/extract-core` that both `@coach/latex` and `@coach/markdown` build on; the host picks the
  extractor by language/extension (coach view, inline diagnostics, and the CLI).
- **Shipped — citation & cross-reference voice.** Three heuristic rubric rules over the extracted
  `[ref]` token (every `\cite`/`\citet`/`\citep` and `\ref`/`\cref`/`\eqref` collapses to it):
  citation-as-subject ("[ref] shows that…"), citation pile-up (≥3 stacked refs), and weak reference
  opener ("As shown in [ref], …"). They ride the editable-rules pipeline — `runRubricDetectors` runs
  every non-built-in detector rule in `coach.review`, so these surface as Coach cards and in the CLI
  gate, graded as low-severity suggestions. They carry a generic teaching before/after but **no
  apply-fix** (that's gated to the LLM lenses' span-specific rewrites).
- **Deferred — (B)** public web app, **(H)** section-aware deepening, and two tier-2 follow-ups to the
  shipped features: a precise per-character source map for inline diagnostics (tier-1 today is the
  whitespace-tolerant snippet search) and learning-center quizzes / gamification.
