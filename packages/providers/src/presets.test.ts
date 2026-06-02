import { describe, expect, it } from "vitest";

import { OPENAI_PRESETS, SECRET_SLOTS, buildPresetModel } from "./presets.js";

describe("OPENAI_PRESETS", () => {
  const entries = Object.entries(OPENAI_PRESETS);

  it("ships the expected providers", () => {
    expect(Object.keys(OPENAI_PRESETS).sort()).toEqual(
      ["groq", "mistral", "openai", "openrouter", "together"].sort(),
    );
  });

  it("every preset is well-formed (https baseURL, id===secret, models/labels set)", () => {
    for (const [key, p] of entries) {
      expect(p.id).toBe(key);
      expect(p.secret).toBe(key); // the key slot matches the provider id
      expect(p.baseURL).toMatch(/^https:\/\//);
      expect(p.defaultModel.length).toBeGreaterThan(0);
      expect(p.label.length).toBeGreaterThan(0);
      expect(typeof p.jsonMode).toBe("boolean");
    }
  });
});

describe("buildPresetModel", () => {
  it("uses the preset's default model and label", () => {
    const m = buildPresetModel(OPENAI_PRESETS.openai!, { apiKey: "sk-test" });
    expect(m.id).toBe("openai:gpt-4o-mini");
  });

  it("honours a model override", () => {
    const m = buildPresetModel(OPENAI_PRESETS.groq!, { apiKey: "k", model: "my-model" });
    expect(m.id).toBe("groq:my-model");
  });

  it("builds without an API key (a keyless/proxy endpoint is allowed)", () => {
    expect(() => buildPresetModel(OPENAI_PRESETS.mistral!, {})).not.toThrow();
  });
});

describe("SECRET_SLOTS", () => {
  it("covers Anthropic, every preset, and the custom endpoint — no duplicates", () => {
    expect(SECRET_SLOTS).toContain("anthropic");
    expect(SECRET_SLOTS).toContain("openai-compatible");
    for (const p of Object.values(OPENAI_PRESETS)) {
      expect(SECRET_SLOTS).toContain(p.secret);
    }
    expect(new Set(SECRET_SLOTS).size).toBe(SECRET_SLOTS.length);
  });
});
