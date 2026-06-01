# Security Policy

## Supported versions

Limpid is pre-1.0 and ships from `main`. Security fixes land on `main` and in the
latest published `0.0.x` release; older builds are not patched.

| Version        | Supported |
| -------------- | --------- |
| latest `0.0.x` | ✅        |
| older          | ❌        |

## Reporting a vulnerability

Please report privately — do **not** open a public issue for a security problem.

1. Open a private advisory at
   <https://github.com/rpatrik96/limpid/security/advisories/new>, or
2. contact the maintainer through the repository's GitHub profile.

Include what you found, how to reproduce it, and the impact. We aim to acknowledge
within a few days and to fix confirmed issues promptly; we'll credit you in the
release notes unless you prefer otherwise.

## Security posture

Limpid is designed to keep your drafts and credentials on your machine:

- **Local-first.** Extraction, the deterministic engine, the rubric, and scoring
  all run locally. Limpid has **no telemetry** and phones nothing home.
- **Your text only goes where you send it.** The optional LLM "lenses" call the
  provider _you_ select (`limpid.provider`): GitHub Copilot via VS Code's
  Language Model API, a local Claude Code CLI, a local Ollama endpoint, or an
  API provider (Anthropic / OpenAI / OpenRouter / Groq / Together / Mistral). With
  no provider configured, Limpid runs deterministic-only and makes no network call.
- **API keys live in the OS keychain.** Keys are stored via VS Code
  `SecretStorage` (set with **Limpid: Set API Key**), never in `settings.json`,
  and are sent only to that provider's official endpoint over HTTPS.
- **The CLI is offline.** `apps/cli` runs the deterministic checks only — no
  network, no keys.

## Scope

In scope: the extension, the CLI, and the packages in this repository. Out of
scope: vulnerabilities in third-party model providers or in VS Code itself —
report those to the respective vendors.
