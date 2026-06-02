import { describe, expect, it } from "vitest";

import { ClaudeLanguageModel, tryClaudeModel } from "./claude.js";
import type { FetchLike, FetchResponseLike } from "./openaiCompatible.js";

function fakeResponse(body: unknown, ok = true, status = 200): FetchResponseLike {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe("tryClaudeModel", () => {
  it("returns null for an empty/whitespace key", () => {
    expect(tryClaudeModel(undefined)).toBeNull();
    expect(tryClaudeModel("   ")).toBeNull();
  });
  it("builds a model when a key is set", () => {
    expect(tryClaudeModel("sk-x")?.id).toBe("anthropic:claude-sonnet-4-6");
  });
});

describe("ClaudeLanguageModel.complete", () => {
  it("posts to the Messages API, sends the key/version, joins text blocks", async () => {
    let captured: { url: string; headers: Record<string, string>; body: string } | undefined;
    const fetchFn: FetchLike = async (url, init) => {
      captured = { url, headers: init.headers, body: init.body };
      return fakeResponse({
        content: [
          { type: "text", text: "co" },
          { type: "tool_use" },
          { type: "text", text: "ached" },
        ],
      });
    };
    const model = new ClaudeLanguageModel("sk-x", "claude-sonnet-4-6", { fetchFn });

    const res = await model.complete({ prompt: "p", system: "s", temperature: 0.5 });

    expect(res.text).toBe("coached");
    expect(captured?.url).toBe("https://api.anthropic.com/v1/messages");
    expect(captured?.headers["x-api-key"]).toBe("sk-x");
    expect(captured?.headers["anthropic-version"]).toBe("2023-06-01");
    const parsed = JSON.parse(captured?.body ?? "{}");
    expect(parsed.system).toBe("s");
    expect(parsed.temperature).toBe(0.5);
  });

  it("throws with status + detail on a non-ok response", async () => {
    const fetchFn: FetchLike = async () => fakeResponse({ error: "bad" }, false, 429);
    const model = new ClaudeLanguageModel("sk-x", "claude-sonnet-4-6", { fetchFn });
    await expect(model.complete({ prompt: "p" })).rejects.toThrow(/Anthropic API 429/);
  });

  it("aborts and rejects (rather than hanging) when the endpoint stalls past timeoutMs", async () => {
    const fetchFn: FetchLike = (_url, init) =>
      new Promise<FetchResponseLike>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    const model = new ClaudeLanguageModel("sk-x", "claude-sonnet-4-6", { timeoutMs: 10, fetchFn });
    await expect(model.complete({ prompt: "p" })).rejects.toThrow(/timed out after 10ms/);
  });
});
