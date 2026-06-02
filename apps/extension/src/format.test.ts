import { describe, expect, it } from "vitest";

import { formatFor, isMarkdown } from "./format.js";

// format.ts uses `vscode` only as a type, so a minimal stub suffices — no host needed.
const doc = (languageId: string, fsPath: string) =>
  ({ languageId, uri: { fsPath } }) as unknown as import("vscode").TextDocument;

describe("isMarkdown", () => {
  it("is true for Markdown languages and a .md/.qmd opened as plaintext", () => {
    expect(isMarkdown(doc("markdown", "a.md"))).toBe(true);
    expect(isMarkdown(doc("mdx", "a.mdx"))).toBe(true);
    expect(isMarkdown(doc("quarto", "a.qmd"))).toBe(true);
    expect(isMarkdown(doc("plaintext", "note.md"))).toBe(true);
    expect(isMarkdown(doc("plaintext", "note.qmd"))).toBe(true);
  });

  it("is false for LaTeX and non-Markdown plaintext", () => {
    expect(isMarkdown(doc("latex", "a.tex"))).toBe(false);
    expect(isMarkdown(doc("plaintext", "notes.txt"))).toBe(false);
  });
});

describe("formatFor", () => {
  it("routes Markdown to the Markdown extractor (headings stripped, h-section noun)", () => {
    const fmt = formatFor(doc("markdown", "a.md"));
    expect(fmt.sectionNoun).toBe("Markdown heading");
    expect(fmt.extract("# Hi\n\nbody").text).not.toContain("#");
    expect(fmt.findSourceSections("# Hi\n\nbody")[0]?.command).toBe("h1");
  });

  it("routes everything else to the LaTeX extractor (markup left literal)", () => {
    const fmt = formatFor(doc("latex", "a.tex"));
    expect(fmt.sectionNoun).toContain("section");
    // The LaTeX extractor does not understand Markdown, so a '#' survives as prose.
    expect(fmt.extract("# Hi\n\nbody").text).toContain("#");
  });
});
