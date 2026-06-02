# Changelog

All notable changes to Limpid are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Shareable distribution bundle + release assets.** `npm run package:share` (and the
  `v*` release workflow) assemble `limpid-share-<version>.zip` — the `.vsix` extension,
  the headless CLI, example configs, and an LLM-oriented operator guide
  (`share/LIMPID_FOR_LLMS.md`) that can be dropped into a project as `AGENTS.md` /
  `llms.txt`. Tagging `v<version>` now attaches both the `.vsix` and the bundle to the
  GitHub Release.

## [0.0.14]

### Added

- **Bring-your-own-key for any OpenAI-compatible provider.** The custom endpoint
  (`limpid.provider: openai-compatible`) now has its **own** `openai-compatible` key
  slot instead of borrowing the `openai` one — so you can point
  `limpid.openaiCompatible.baseURL` at DeepSeek, Fireworks, xAI, Perplexity, Cerebras,
  Azure OpenAI, Gemini's OpenAI-compatible endpoint, or a local proxy and store its key
  without clobbering a real OpenAI key (it falls back to the `openai` slot for
  back-compat, and a keyless proxy needs none). Documented as a **Bring your own key**
  section in the README.

### Changed

- The **Set/Clear API Key** picker now lists every key slot with what it's for and
  whether a key is already stored, and is driven by a single canonical `SECRET_SLOTS`
  list in `@coach/providers` so it can't drift from the wired-up providers.

## [0.0.13]

### Added

- **Citation & cross-reference voice checks** — three heuristic rules over the
  extracted `[ref]` token (which every `\cite`/`\citet`/`\citep` and
  `\ref`/`\cref`/`\eqref` collapses to): **citation-as-subject** ("[ref] shows that…"
  → lead with the claim, cite it), **citation pile-up** (≥3 stacked references), and
  **weak reference opener** ("As shown in [ref], …" → lead with what's true, then
  point). They surface as low-severity Coach cards and in the `limpid` CLI gate, and
  respect editable rules. The deepest fit for the LaTeX audience — the one fault class
  the coach was previously blind to.

### Fixed

- Apply-fix is now offered only on the LLM lenses' span-specific rewrites. A
  detector-backed rule's before/after is a generic illustration, so applying it would
  have spliced a stock sentence over the matched span — the button is gone for those
  (the teaching before/after still shows on the card).

## [0.0.12]

### Added

- **Apply-the-fix**: coach cards with a concrete rewrite now show an **apply fix**
  button that inserts the "after" into the editor (falling back to the clipboard when
  the source carries markup, so a LaTeX/Markdown construct is never broken by a blind
  edit).
- First-run **Get Started** walkthrough (coach a passage → pick a model → learn the
  patterns).
- The **Learn** view now tracks **per-dimension and per-section trends**, not just a
  flat grade line.

### Changed

- **Editable rules now affect the grade.** Detector-backed rules in
  `.limpid/rules.json` run in the coach pipeline (previously only the _Test Rule_
  playground exercised them); engine rule ids are reconciled to the rubric so inline
  hovers show each rule's rationale; the canonical word lists are single-sourced in
  `@coach/rubric`.
- **Save no longer spends an LLM request.** A save refresh recomputes the
  deterministic metrics only; the four judgment lenses re-run on an explicit coach —
  a tight save loop (or autosave) can't exhaust the Copilot quota.
- Coach runs show a **cancellable** progress notification, and a superseded run's
  result is dropped (latest-wins).
- The inline-diagnostic quick-fix ("Coach this in Limpid") now coaches the **flagged
  range**, not the whole file; reveal-in-editor and apply-fix route through the
  whitespace-tolerant source locator (right occurrence, survives `.tex`/`.md` markup).
- Choosing a provider with no key now surfaces an actionable **Set API Key** prompt
  instead of silently degrading; the Copilot quota message points to setting a key.
- Limpid judges rhetoric, **not grammar/spelling** — stated explicitly in the README
  and manifest. CI runs a Node 20 + 22 matrix; the esbuild target matches the
  Node 20 floor.

### Fixed

- User-supplied rule regexes are guarded against catastrophic backtracking (ReDoS),
  and bounded in length — a malicious `.limpid/rules.json` can no longer hang the host.
- The Claude Code CLI runner no longer crashes the host with an unhandled `EPIPE`
  when the child exits early; the network adapters (OpenAI-compatible, Anthropic) now
  time out instead of hanging forever.
- The undefined-acronym check no longer flags common all-caps words, settled
  initialisms, or roman numerals as a "jargon cliff".
- Multi-line / unbalanced LaTeX display math (`\[ … \]`, `$$ … $$`) no longer leaks
  into the extracted prose; a malformed CLI threshold flag now fails loudly instead of
  silently disabling the gate.

## [0.0.11]

### Added

- Markdown support. `.md`/`.markdown` files now extract through a dedicated Markdown
  engine (`@coach/markdown`) instead of the LaTeX stripper: YAML frontmatter, fenced
  code, GFM tables, HTML, images, and link URLs are dropped, while emphasis, links,
  inline code, lists, and blockquotes reduce to their prose. **Headings (`#`…`######`
  and single-line setext) drive sectioning** — "Coach a section…" and the right-click
  menu now work in Markdown, scoping to a chosen `h1`/`h2`/… and its nested
  subsections. Inline diagnostics and the `limpid` CLI gate pick the extractor by file
  type too.

### Changed

- Factored the format-agnostic extraction core — prose assembly, the coarse source
  map, section classification, and span→source location — into a new pure package
  `@coach/extract-core`, shared by `@coach/latex` and `@coach/markdown`. LaTeX
  extraction behaviour is unchanged.

## [0.0.10]

### Added

- Learning Center — a second **"Learn"** view in the Limpid sidebar: a browsable
  library of the 12 named failure patterns (definition, how to spot, why it fails,
  before/after), plus a "your writing" panel surfacing your most recurring patterns,
  recent grade trend, and metric averages across runs. Each coach run is recorded to
  `.limpid/history.json` via the pure `@coach/history` aggregator; toggle with
  `limpid.history.enabled`.

## [0.0.9]

### Added

- Inline editor diagnostics: the deterministic checks (filler, passive voice,
  hedges, weak openers, undefined acronyms) now appear as squiggles + Problems-panel
  entries in the `.tex`, refreshed on open/save, with a hover explaining the rule and
  a "Coach this in Limpid" quick-fix. Toggle with `limpid.diagnostics.enabled`. The
  LLM judgment lenses stay in the Coach view. Spans map back to source via
  `@coach/latex.locateSpanInSource` (whitespace-tolerant).

## [0.0.8]

### Fixed

- Prose text was invisible on dark themes: highlighted (`<mark>`) words kept the
  browser's default near-black text colour, so only the underline showed. `<mark>`
  now inherits the colour, and `body` pins text to the VS Code theme foreground.

## [0.0.7]

### Changed

- Redesigned the Coach webview for the narrow Activity-Bar sidebar: single-column layout, generous
  spacing, and full-width controls/buttons that no longer crowd at ~320px.
- Dimension scores now read on an explicit **out-of-10** scale with the weighting labelled.
- Decluttered the coach cards and de-emphasized each finding's reference into a small, muted citation.

### Added

- A highlight legend mapping the prose underline colours to their meaning.

## [0.0.6]

### Added

- Activity-Bar **"Coach"** sidebar view — the coach panel now lives in its own view container.
- **"Coach a section…"** picker to scope analysis to a chosen section.
- Save-triggered re-analysis: editing and saving a document refreshes the report.

## [0.0.5]

### Added

- Right-click editor menu entry to coach the current selection.
- `Cmd/Ctrl+Alt+L` keybinding to run the coach.

## [0.0.4]

### Added

- The `limpid` CLI — a deterministic writing gate (`apps/cli`) for CI and pre-commit, with an example
  GitHub Action.
- Multi-register coaching (`limpid.register` / `--register`): paper, blog, grant, and sop registers,
  auto-selected by file type, each with its own thresholds and altitude defaults.

## [0.0.3]

### Added

- Editable rules via `.limpid/rules.json`, merged into the shipped rubric.
- A **"Test Rule"** playground to author and try a rule against a sample before saving it.

## [0.0.2]

### Added

- Multi-provider LLM layer: Copilot (VS Code `vscode.lm` API), Claude Code CLI, and an OpenAI-compatible
  adapter (OpenAI / OpenRouter / Groq / Together / Mistral), plus Anthropic and Ollama.
- API keys stored in the OS keychain via SecretStorage (the *Set/Clear API Key* commands), never in
  settings.
- A golden-set eval harness (`npm run eval`) scoring a provider against labelled cases.

### Changed

- Hardened the coach lenses with a few-shot example in the lens prompt and per-provider JSON mode.
- Extracted the host-side adapters into a pure `@coach/providers` package, so the eval and a future web
  front-end can run real providers without the VS Code host.

## [0.0.1]

### Added

- Initial release: the npm-workspaces monorepo and the front-end-agnostic core — `@coach/contract`,
  `@coach/engine`, `@coach/latex`, `@coach/rubric`, `@coach/coach`.
- The VS Code extension (`apps/extension`): a command and a webview coach panel.
- Deterministic metrics and findings end to end, with a mock `LanguageModel` for the LLM path.

[Unreleased]: https://github.com/rpatrik96/limpid/compare/v0.0.6...HEAD
[0.0.6]: https://github.com/rpatrik96/limpid/compare/v0.0.5...v0.0.6
[0.0.5]: https://github.com/rpatrik96/limpid/compare/v0.0.4...v0.0.5
[0.0.4]: https://github.com/rpatrik96/limpid/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/rpatrik96/limpid/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/rpatrik96/limpid/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/rpatrik96/limpid/releases/tag/v0.0.1
