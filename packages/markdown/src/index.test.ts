import { describe, expect, it } from "vitest";

import { extract, locateSpanInSource, preprocessLines, transformInline } from "./index.js";
import { CODE_HEAVY_MD, SAMPLE_MD } from "./fixtures.js";

describe("extract — markup stripping", () => {
  const out = extract(SAMPLE_MD);

  it("drops YAML frontmatter", () => {
    expect(out.text).not.toContain("title:");
    expect(out.text).not.toContain("tags:");
    expect(out.text).not.toContain("A Tiny Note");
  });

  it("keeps ATX heading titles as prose, without the # markers", () => {
    expect(out.text).toContain("Introduction");
    expect(out.text).toContain("Related Work");
    expect(out.text).toContain("Discussion");
    expect(out.text).not.toContain("#");
  });

  it("unwraps emphasis/strong, keeping inner text", () => {
    expect(out.text).toContain("key");
    expect(out.text).toContain("identifiability");
    expect(out.text).not.toContain("**");
    expect(out.text).not.toContain("_identifiability_");
  });

  it("keeps inline-code inner text, drops the backticks", () => {
    expect(out.text).toContain("loss");
    expect(out.text).toContain("second point with code");
    expect(out.text).not.toContain("`");
  });

  it("keeps link text but drops the URL", () => {
    expect(out.text).toContain("Jones 2019");
    expect(out.text).not.toContain("example.com");
    expect(out.text).not.toContain("](");
  });

  it("drops images entirely (alt + path)", () => {
    expect(out.text).not.toContain("architecture diagram");
    expect(out.text).not.toContain("arch.png");
  });

  it("drops footnote references and their definitions", () => {
    expect(out.text).toContain("matters");
    expect(out.text).not.toContain("[^1]");
    expect(out.text).not.toContain("A footnote definition");
  });

  it("strips list and blockquote markers, keeping the item/quote prose", () => {
    expect(out.text).toContain("first point");
    expect(out.text).not.toContain("- first");
    expect(out.text).toContain("A quoted remark that is still prose.");
    expect(out.text).not.toContain("> A quoted");
  });

  it("drops fenced code blocks", () => {
    expect(out.text).not.toContain("def f");
    expect(out.text).not.toContain("return x");
    expect(out.text).not.toContain("this code must be dropped");
    expect(out.text).not.toContain("```");
  });

  it("drops GFM tables", () => {
    expect(out.text).not.toContain("9.9");
    expect(out.text).not.toContain("Score");
    expect(out.text).not.toContain("| ------");
  });
});

describe("extract — sections", () => {
  const out = extract(SAMPLE_MD);

  it("classifies heading kinds from titles", () => {
    const kinds = out.sections.map((s) => s.kind);
    expect(kinds).toContain("introduction");
    expect(kinds).toContain("related");
    expect(kinds).toContain("discussion");
  });

  it("gives each section a valid range that contains its title", () => {
    for (const s of out.sections) {
      expect(s.range.start).toBeGreaterThanOrEqual(0);
      expect(s.range.end).toBeGreaterThanOrEqual(s.range.start);
      expect(s.range.end).toBeLessThanOrEqual(out.text.length);
      expect(s.sourceLineStart).toBeGreaterThanOrEqual(1);
    }
    const intro = out.sections.find((s) => s.kind === "introduction");
    expect(intro && out.text.slice(intro.range.start, intro.range.end)).toContain("Introduction");
  });
});

describe("extract — proseRatio + sourceMap", () => {
  it("proseRatio is in (0,1) for a normal note and low for code-heavy input", () => {
    const out = extract(SAMPLE_MD);
    expect(out.proseRatio).toBeGreaterThan(0);
    expect(out.proseRatio).toBeLessThan(1);
    expect(extract(CODE_HEAVY_MD).proseRatio).toBeLessThan(0.5);
    expect(extract("").proseRatio).toBe(0);
  });

  it("sourceMap is monotonic, in-bounds, and non-empty", () => {
    const out = extract(SAMPLE_MD);
    expect(out.sourceMap.length).toBeGreaterThan(0);
    for (let i = 1; i < out.sourceMap.length; i++) {
      expect(out.sourceMap[i]!.textOffset).toBeGreaterThanOrEqual(out.sourceMap[i - 1]!.textOffset);
      expect(out.sourceMap[i]!.sourceLine).toBeGreaterThanOrEqual(out.sourceMap[i - 1]!.sourceLine);
    }
    for (const e of out.sourceMap) {
      expect(e.textOffset).toBeLessThanOrEqual(out.text.length);
      expect(e.sourceLine).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("extract — locate round-trip", () => {
  it("maps an extracted phrase back into the source", () => {
    const out = extract(SAMPLE_MD);
    const phrase = "compact codes";
    const idx = out.text.indexOf(phrase);
    expect(idx).toBeGreaterThanOrEqual(0);
    const r = locateSpanInSource(SAMPLE_MD, out, { start: idx, end: idx + phrase.length });
    expect(r).not.toBeNull();
    expect(SAMPLE_MD.slice(r!.start, r!.end)).toBe(phrase);
  });
});

describe("unit — transformInline", () => {
  it("strips an ATX marker", () => {
    expect(transformInline("## Methods")).toBe("Methods");
  });
  it("strips list marker + emphasis", () => {
    expect(transformInline("- item **bold**")).toBe("item bold");
  });
  it("strips blockquote + keeps link text", () => {
    expect(transformInline("> quote with [a link](http://x)")).toBe("quote with a link");
  });
  it("does NOT mangle intraword underscores (snake_case)", () => {
    expect(transformInline("`inline` and snake_case_var stays")).toBe(
      "inline and snake_case_var stays",
    );
  });
  it("passes plain prose through unchanged", () => {
    expect(transformInline("This is important and clear.")).toBe("This is important and clear.");
  });
  it("keeps a code span that wraps a literal backtick (multi-backtick fence)", () => {
    expect(transformInline("use ``a`b`` here")).toBe("use a`b here");
  });
  it("keeps link text when the URL has balanced parens", () => {
    expect(transformInline("see [Foo](https://e.org/Foo_(bar)) now")).toBe("see Foo now");
  });
  it("strips an HTML tag whose attribute value contains '>'", () => {
    expect(transformInline('a <span data-x="a>b">hi</span> z')).toBe("a hi z");
  });
  it("drops a trailing hard-break backslash but keeps an escaped backslash", () => {
    expect(transformInline("line one\\")).toBe("line one");
    expect(transformInline("two\\\\")).toBe("two\\");
  });
});

describe("extract — review regressions", () => {
  it("keeps prose around an HTML comment (single- and multi-line)", () => {
    expect(extract("Keep this. <!-- note --> And this too.").text).toBe("Keep this. And this too.");
    const multi = extract("Real prose. <!-- a\nb\nc --> After.").text;
    expect(multi).toContain("Real prose.");
    expect(multi).toContain("After.");
    expect(multi).not.toContain("<!--");
  });

  it("empty, whitespace-only, and code-fence-only docs yield an empty extraction", () => {
    for (const md of ["", "   \n\n\t", "```js\nconst a = 1;\n```"]) {
      expect(extract(md)).toMatchObject({ text: "", sections: [], sourceMap: [], proseRatio: 0 });
    }
  });

  it("does not treat a delimiter as a table when column counts disagree", () => {
    const out = extract("a | b | c\n--- | ---\nkeep this prose").text;
    expect(out).toContain("keep this prose");
    expect(out).toContain("a | b | c");
  });

  it("does not consume a heading as a table header", () => {
    const out = extract(["# Title", "| a | b |", "| - | - |", "row"].join("\n")).text;
    expect(out).toContain("Title");
    expect(out).not.toContain("| a | b |");
  });

  it("preprocessLines: one line per physical line, dropped→blank, sourceLine aligned (LF + CRLF)", () => {
    for (const nl of ["\n", "\r\n"]) {
      const md = ["---", "t: x", "---", "# H", "body", "```", "code", "```"].join(nl);
      const ls = preprocessLines(md);
      expect(ls).toHaveLength(8);
      ls.forEach((l, i) => expect(l.sourceLine).toBe(i + 1));
      expect(ls[1]!.text).toBe(""); // frontmatter
      expect(ls[6]!.text).toBe(""); // fence interior
      expect(ls[4]!.text).toContain("body");
    }
  });
});
