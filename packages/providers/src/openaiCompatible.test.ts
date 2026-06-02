import { describe, expect, it } from "vitest";

import type { FetchLike, FetchResponseLike } from "./openaiCompatible.js";
import { OpenAICompatibleModel, buildChatBody, parseChatContent } from "./openaiCompatible.js";

function fakeResponse(body: unknown, ok = true, status = 200): FetchResponseLike {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe("buildChatBody", () => {
  it("defaults temperature and max_tokens, omits response_format", () => {
    const b = buildChatBody([{ role: "user", content: "hi" }], "m", {});
    expect(b).toMatchObject({ model: "m", temperature: 0.2, max_tokens: 1024 });
    expect(b["response_format"]).toBeUndefined();
  });

  it("sets json_object response_format when json is requested", () => {
    expect(buildChatBody([], "m", { json: true })["response_format"]).toEqual({
      type: "json_object",
    });
  });

  it("suppresses response_format when jsonMode is false", () => {
    expect(
      buildChatBody([], "m", { json: true, jsonMode: false })["response_format"],
    ).toBeUndefined();
  });
});

describe("parseChatContent", () => {
  it("extracts choices[0].message.content", () => {
    expect(parseChatContent({ choices: [{ message: { content: "out" } }] })).toBe("out");
  });
  it("returns '' on malformed shapes", () => {
    expect(parseChatContent({})).toBe("");
    expect(parseChatContent({ choices: [] })).toBe("");
    expect(parseChatContent(null)).toBe("");
  });
});

describe("OpenAICompatibleModel.complete", () => {
  it("posts to {baseURL}/chat/completions, sets Bearer auth, builds messages, parses content", async () => {
    let captured: { url: string; headers: Record<string, string>; body: string } | undefined;
    const fetchFn: FetchLike = async (url, init) => {
      captured = { url, headers: init.headers, body: init.body };
      return fakeResponse({ choices: [{ message: { content: "graded" } }] });
    };
    const model = new OpenAICompatibleModel({
      baseURL: "https://api.openai.com/v1/",
      apiKey: "k",
      model: "gpt-4o-mini",
      label: "openai",
      fetchFn,
    });

    const res = await model.complete({ prompt: "p", system: "s", json: true });

    expect(res.text).toBe("graded");
    expect(model.id).toBe("openai:gpt-4o-mini");
    expect(captured?.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(captured?.headers["authorization"]).toBe("Bearer k");
    const parsed = JSON.parse(captured?.body ?? "{}");
    expect(parsed.messages).toEqual([
      { role: "system", content: "s" },
      { role: "user", content: "p" },
    ]);
    expect(parsed.response_format).toEqual({ type: "json_object" });
  });

  it("omits the auth header for keyless endpoints (Ollama)", async () => {
    let headers: Record<string, string> = {};
    const fetchFn: FetchLike = async (_url, init) => {
      headers = init.headers;
      return fakeResponse({ choices: [{ message: { content: "x" } }] });
    };
    const model = new OpenAICompatibleModel({
      baseURL: "http://localhost:11434/v1",
      model: "llama3.1",
      label: "ollama",
      fetchFn,
    });
    await model.complete({ prompt: "p" });
    expect(headers["authorization"]).toBeUndefined();
  });

  it("throws with status + detail on a non-ok response", async () => {
    const fetchFn: FetchLike = async () => fakeResponse({ error: "bad" }, false, 401);
    const model = new OpenAICompatibleModel({
      baseURL: "https://x/v1",
      apiKey: "k",
      model: "m",
      fetchFn,
    });
    await expect(model.complete({ prompt: "p" })).rejects.toThrow(/401/);
  });

  it("aborts and rejects (rather than hanging) when the endpoint stalls past timeoutMs", async () => {
    // A stalled fetch that only settles when its AbortSignal fires — mirroring
    // how the real fetch rejects on abort. Without the timeout it never resolves.
    const fetchFn: FetchLike = (_url, init) =>
      new Promise<FetchResponseLike>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    const model = new OpenAICompatibleModel({
      baseURL: "https://x/v1",
      apiKey: "k",
      model: "m",
      timeoutMs: 10,
      fetchFn,
    });
    await expect(model.complete({ prompt: "p" })).rejects.toThrow(/timed out after 10ms/);
  });

  it("passes the abort signal through to the fetch call", async () => {
    let sawSignal = false;
    const fetchFn: FetchLike = async (_url, init) => {
      sawSignal = init.signal instanceof AbortSignal;
      return fakeResponse({ choices: [{ message: { content: "ok" } }] });
    };
    const model = new OpenAICompatibleModel({ baseURL: "https://x/v1", model: "m", fetchFn });
    await model.complete({ prompt: "p" });
    expect(sawSignal).toBe(true);
  });
});
