/**
 * A {@link LanguageModel} backed by the Claude Code CLI (`claude -p`).
 *
 * Keyless: it uses the user's existing Claude subscription login (OAuth in the OS
 * keychain), so no API key is needed. We run headless JSON mode and read the
 * `result` field; the prompt is piped via stdin to avoid arg-length/escaping
 * issues. The `runner` seam makes it testable without spawning a real process.
 *
 * Note: plain `-p` (no `--bare`) is required for the subscription-auth path.
 */
import { spawn } from "node:child_process";

import type { LanguageModel, LMRequest, LMResponse } from "@coach/contract";

/** Runs the CLI with `stdin`, resolves stdout or rejects. Injectable for tests. */
export type CliRunner = (
  command: string,
  args: string[],
  stdin: string,
  timeoutMs: number,
) => Promise<string>;

export interface ClaudeCliConfig {
  command?: string | undefined; // default "claude"
  model?: string | undefined; // default "sonnet"
  timeoutMs?: number | undefined; // default 90s
  runner?: CliRunner | undefined; // injectable for tests
}

/** Parse the CLI's `--output-format json` stdout. Pure — exported for tests. */
export function parseClaudeResult(stdout: string): string {
  const trimmed = stdout.trim();
  try {
    const obj = JSON.parse(trimmed) as { result?: unknown; structured_output?: unknown };
    if (typeof obj.result === "string") return obj.result;
    if (obj.structured_output !== undefined) return JSON.stringify(obj.structured_output);
  } catch {
    // not JSON — fall through to the raw text
  }
  return trimmed;
}

/** The real `spawn`-backed runner. Exported for tests; default for {@link ClaudeCliModel}. */
export const defaultRunner: CliRunner = (command, args, stdin, timeoutMs) =>
  new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);

    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e); // e.g. ENOENT when `claude` is not on PATH
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`${command} exited ${code ?? "?"}: ${err.slice(0, 200)}`));
    });

    // If the child exits before we finish piping the prompt, the stdin socket
    // emits EPIPE/ECONNRESET. Without a listener that error is unhandled and
    // crashes the extension host, so we swallow it and let the child's own
    // 'close'/'error' drive the result (the deterministic-fallback path).
    child.stdin.on("error", () => {
      /* ignore broken-pipe writes; result is decided by the child handlers */
    });
    try {
      child.stdin.write(stdin);
      child.stdin.end();
    } catch {
      // synchronous write/end failures are likewise non-fatal here.
    }
  });

export class ClaudeCliModel implements LanguageModel {
  readonly id: string;
  private readonly command: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly runner: CliRunner;

  constructor(cfg: ClaudeCliConfig = {}) {
    this.command = cfg.command ?? "claude";
    this.model = cfg.model ?? "sonnet";
    this.timeoutMs = cfg.timeoutMs ?? 90_000;
    this.runner = cfg.runner ?? defaultRunner;
    this.id = `claude-code:${this.model}`;
  }

  async complete(request: LMRequest): Promise<LMResponse> {
    const prompt = request.system ? `${request.system}\n\n${request.prompt}` : request.prompt;
    const args = ["-p", "--output-format", "json", "--model", this.model];
    const stdout = await this.runner(this.command, args, prompt, this.timeoutMs);
    return { text: parseClaudeResult(stdout) };
  }
}
