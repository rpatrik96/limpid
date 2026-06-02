# Pick a language model (optional)

The mechanical checks — filler, passive voice, hedges, weak openers, readability — are deterministic and run instantly with **no setup**.

Four judgment lenses (stress position, paragraph cohesion, audience altitude, argument flow) need a language model:

- **Free GitHub Copilot** works out of the box (`limpid.provider: auto`). Sign in to GitHub in VS Code and enable Copilot; the first run asks for one-time consent. The Free tier shares a small monthly quota, so under heavy use Limpid degrades to a deterministic report — for heavier use, set a key.
- **Any API provider** (Anthropic, OpenAI, OpenRouter, Groq, Together, Mistral) via **Limpid: Set API Key** — stored in the OS keychain, never in settings.
- **Local** Ollama or the Claude Code CLI — no key.

Saving a file refreshes the deterministic metrics only; the lenses re-run on an explicit coach, so a tight save loop never burns your quota.
