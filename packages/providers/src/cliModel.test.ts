import { describe, expect, it } from "vitest";

import type { CliRunner } from "./cliModel.js";
import { ClaudeCliModel, defaultRunner, parseClaudeResult } from "./cliModel.js";

describe("parseClaudeResult", () => {
  it("reads the result field from JSON output", () => {
    expect(parseClaudeResult('{"result":"hello","session_id":"x"}')).toBe("hello");
  });
  it("stringifies structured_output when result is absent", () => {
    expect(parseClaudeResult('{"structured_output":{"a":1}}')).toBe('{"a":1}');
  });
  it("falls back to raw text on non-JSON", () => {
    expect(parseClaudeResult("just text")).toBe("just text");
  });
});

describe("ClaudeCliModel.complete", () => {
  it("invokes the CLI headless, pipes system+prompt via stdin, parses result", async () => {
    let seen: { command: string; args: string[]; stdin: string } | undefined;
    const runner: CliRunner = async (command, args, stdin) => {
      seen = { command, args, stdin };
      return '{"result":"coached"}';
    };
    const model = new ClaudeCliModel({ runner, model: "sonnet" });

    const res = await model.complete({ prompt: "P", system: "S" });

    expect(res.text).toBe("coached");
    expect(model.id).toBe("claude-code:sonnet");
    expect(seen?.command).toBe("claude");
    expect(seen?.args).toEqual(["-p", "--output-format", "json", "--model", "sonnet"]);
    expect(seen?.stdin).toBe("S\n\nP");
  });

  it("propagates runner errors (e.g. binary missing)", async () => {
    const runner: CliRunner = async () => {
      throw new Error("spawn claude ENOENT");
    };
    const model = new ClaudeCliModel({ runner });
    await expect(model.complete({ prompt: "p" })).rejects.toThrow(/ENOENT/);
  });
});

describe("defaultRunner EPIPE handling", () => {
  // A child that exits immediately closes its stdin before we finish piping a
  // large prompt, so the write hits EPIPE. Without the stdin 'error' listener
  // this rejects the host's unhandledRejection / crashes the extension host;
  // with it, the promise settles deterministically (here: rejects on exit code).
  it("does not throw an unhandled error when the child exits while we write a large stdin", async () => {
    // ~5MB overflows the pipe buffer so the write is still in flight at exit.
    const bigStdin = "x".repeat(5_000_000);

    // `true` exits 0 immediately without reading stdin (POSIX); on win32 use `cmd /c exit 0`.
    const isWin = process.platform === "win32";
    const command = isWin ? "cmd" : "true";
    const args = isWin ? ["/c", "exit", "0"] : [];

    const settled = await defaultRunner(command, args, bigStdin, 5_000).then(
      () => "resolved" as const,
      () => "rejected" as const,
    );

    // Either outcome is fine — the point is the promise SETTLES instead of
    // crashing the process with an unhandled EPIPE on child.stdin.
    expect(["resolved", "rejected"]).toContain(settled);
  });
});
