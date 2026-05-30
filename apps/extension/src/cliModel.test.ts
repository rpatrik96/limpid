import { describe, expect, it } from "vitest";

import type { CliRunner } from "./cliModel.js";
import { ClaudeCliModel, parseClaudeResult } from "./cliModel.js";

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
