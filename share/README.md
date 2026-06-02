# Limpid — share bundle

Limpid is a **local-first writing coach for academic prose** (LaTeX & Markdown). It
scores your writing against _good_ writing and teaches **why** a passage fails — it
judges rhetoric (clarity, structure, flow, voice), **not** grammar or spelling.

## What's in here

- **`limpid-<version>.vsix`** — the VS Code extension. Install with
  `code --install-extension limpid-<version>.vsix`, then reload; a **Limpid** icon
  (Coach + Learn views) appears in the Activity Bar.
- **`cli/limpid.js`** — the headless writing gate (**Node ≥ 20**), for CI / pre-commit:
  `node cli/limpid.js --max-passive 0.4 --min-grade C paper.tex`. Deterministic; no
  LLM, no API key.
- **`LIMPID_FOR_LLMS.md`** — a complete operator guide written to be read by an AI
  assistant. Drop it into your project (e.g. as `AGENTS.md` or `llms.txt`) so your
  coding assistant knows how to install, configure (including **bring-your-own API
  key**), and run Limpid.
- **`examples/`** — a starter `.limpid/rules.json` (encode house style) plus
  ready-to-copy pre-commit and GitHub Action configs for the CLI gate.

## 60-second start

1. `code --install-extension limpid-<version>.vsix`, then reload VS Code.
2. Open a `.tex` / `.md` file, select a paragraph (or nothing for the whole file),
   press **⌘⌥L** / **Ctrl+Alt+L**.
3. _Optional, for the deeper judgment lenses:_ pick a model. Free GitHub Copilot works
   out of the box; or run **“Limpid: Set API Key”** for any provider (OpenAI,
   Anthropic, OpenRouter, Groq, Together, Mistral, or any OpenAI-compatible endpoint
   such as DeepSeek). See `LIMPID_FOR_LLMS.md` → _Language models / bring your own key_.

Limpid runs locally — your drafts never leave your machine except the one selection you
coach, which goes only to the model provider you choose. Keys live in the OS keychain.

For everything else (CLI flags, all settings, editable rules, troubleshooting), read
**`LIMPID_FOR_LLMS.md`** — it is exhaustive and self-contained.
