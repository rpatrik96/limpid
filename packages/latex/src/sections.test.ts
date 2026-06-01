import { describe, expect, it } from "vitest";

import { findSourceSections } from "./sections.js";

const TEX = String.raw`\begin{abstract}
We study X.
\end{abstract}
\section{Introduction}
Intro text.
\subsection{Background}
Some background.
\section{Methods}
Method text.`;

describe("findSourceSections", () => {
  it("finds abstract + headings in source order", () => {
    const s = findSourceSections(TEX);
    expect(s.map((x) => x.title)).toEqual(["Abstract", "Introduction", "Background", "Methods"]);
    expect(s.map((x) => x.command)).toEqual(["abstract", "section", "subsection", "section"]);
  });

  it("a section spans its subsections (ends at the next same-or-higher heading)", () => {
    const s = findSourceSections(TEX);
    const intro = s.find((x) => x.title === "Introduction")!;
    const methods = s.find((x) => x.title === "Methods")!;
    expect(intro.end).toBe(methods.start);
    const introText = TEX.slice(intro.start, intro.end);
    expect(introText).toContain("Background"); // nested subsection included
    expect(introText).toContain("Intro text.");
  });

  it("the abstract uses its explicit begin/end span", () => {
    const abs = findSourceSections(TEX).find((x) => x.title === "Abstract")!;
    const slice = TEX.slice(abs.start, abs.end);
    expect(slice).toContain("We study X.");
    expect(slice).toContain("\\end{abstract}");
  });

  it("handles starred headings and bracket options", () => {
    const s = findSourceSections(String.raw`\section*[short]{Real Title}` + "\nbody.");
    expect(s[0]?.title).toBe("Real Title");
    expect(s[0]?.command).toBe("section");
  });

  it("returns [] for prose with no sections", () => {
    expect(findSourceSections("just some text.")).toEqual([]);
  });
});
