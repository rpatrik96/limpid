import { describe, expect, it } from "vitest";

import { classifyTitle } from "./classifyTitle.js";

describe("classifyTitle", () => {
  it("maps common headings to kinds (first match wins)", () => {
    expect(classifyTitle("Introduction")).toBe("introduction");
    expect(classifyTitle("Related Work")).toBe("related");
    expect(classifyTitle("2. Methods")).toBe("methods");
    expect(classifyTitle("Experiments and Results")).toBe("results");
    expect(classifyTitle("Discussion")).toBe("discussion");
    expect(classifyTitle("Proof of Theorem 1")).toBe("proof");
    expect(classifyTitle("Abstract")).toBe("abstract");
  });

  it("prefers 'related work'/'background' over 'methods'", () => {
    expect(classifyTitle("Background")).toBe("related");
  });

  it("falls back to unknown", () => {
    expect(classifyTitle("Acknowledgements")).toBe("unknown");
    expect(classifyTitle("")).toBe("unknown");
  });
});
