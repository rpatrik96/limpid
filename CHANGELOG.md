# Changelog

All notable changes to Limpid are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
