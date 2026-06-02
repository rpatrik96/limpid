/**
 * Test fixtures for @coach/markdown. Built from line arrays (not String.raw) so the
 * literal back-tick code fences and inline code spans don't terminate the string —
 * and so the pure package needs no `fs` at test time (honouring the no-I/O rule).
 */

/** A representative note: frontmatter, ATX headings, emphasis, link, image, inline
 *  code, list, blockquote, fenced code, a GFM table, a footnote + reference def. */
export const SAMPLE_MD = [
  "---",
  "title: A Tiny Note",
  "tags: [draft]",
  "---",
  "",
  "# Introduction",
  "",
  "Representation learning seeks compact codes. Prior work [Jones 2019](https://example.com/jones)",
  "is broad, but the **key** gap is _identifiability_. We close it. The `loss` matters[^1].",
  "",
  "![architecture diagram](arch.png)",
  "",
  "## Related Work",
  "",
  "Many methods exist. None proves identifiability:",
  "",
  "- first point",
  "- second point with `code`",
  "",
  "> A quoted remark that is still prose.",
  "",
  "```python",
  "def f(x):",
  "    return x  # this code must be dropped",
  "```",
  "",
  "| Method | Score |",
  "| ------ | ----- |",
  "| ours   | 9.9   |",
  "",
  "## Discussion",
  "",
  "Our bound is sufficient but we do not claim it is necessary.",
  "",
  "[^1]: A footnote definition that should be dropped.",
  "[jones]: https://example.com/jones",
  "",
].join("\n");

/** A setext-headed note (underline headings) for the section finder. */
export const SETEXT_MD = [
  "Introduction",
  "============",
  "",
  "Intro body.",
  "",
  "Background",
  "----------",
  "",
  "Some background.",
].join("\n");

/** Mostly fenced code with one line of prose — exercises a low proseRatio. */
export const CODE_HEAVY_MD = [
  "# Snippet",
  "",
  "```js",
  "const a = 1;",
  "const b = 2;",
  "function add(x, y) { return x + y; }",
  "const result = add(a, b);",
  "```",
  "",
  "Done.",
].join("\n");
