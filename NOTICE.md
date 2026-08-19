# Sources and attribution

Limpid scores prose against a canon of writing advice. This file records where each
rule comes from and what its copyright status is, so that anyone reading, forking, or
packaging the project can see the provenance without reconstructing it.

**The rules as implemented are original work.** Every `rationale`, every before/after
example, every detector regex, the twelve named patterns, the grade bands, the register
profiles and the section thresholds were written for this repository and are covered by
the [MIT License](LICENSE), © 2026 Patrik Reizinger. The underlying advice — omit needless
words, prefer the active voice, put the emphasis at the end of the sentence — consists of
ideas, procedures and methods, which copyright does not protect (17 U.S.C. § 102(b)).

## Quoted sources

Four passages of third-party text appear in this repository. All four carry a full
citation at the point of use.

| Source                                                                                                             | Where                                     | Status                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| William Strunk Jr., _The Elements of Style_ (1918), Rule 13 — "Vigorous writing is concise…"                       | `packages/rubric/sources/strunk-white.md` | **Public domain.** First published 1918; see [Project Gutenberg #37134](https://www.gutenberg.org/ebooks/37134). |
| Strunk (1918), Rule 13 — "In especial the expression _the fact that_ should be revised out of every sentence…"     | `packages/rubric/sources/strunk-white.md` | **Public domain**, same edition.                                                                                 |
| Strunk (1918), Rule 13 — the dead-leaves revision example                                                          | `packages/rubric/sources/strunk-white.md` | **Public domain**, same edition.                                                                                 |
| George D. Gopen and Judith A. Swan, "The Science of Scientific Writing," _American Scientist_ 78(6):550–558 (1990) | `packages/rubric/sources/gopen-swan.md`   | In copyright. A one-sentence, 41-word quotation, cited in full, used to explain the rule the code implements.    |

Quotations of the Strunk passages are unrestricted. The Gopen & Swan quotation is used
under the quotation right — 17 U.S.C. § 107 in the United States, § 51 UrhG in Germany
(with the source named as § 63 UrhG requires), Art. 5(3)(d) of Directive 2001/29/EC in the
rest of the EU.

### Orwell's six rules

The rule _names_ in `packages/rubric/src/rules.ts` follow George Orwell, "Politics and the
English Language" (1946), and two of the six are his own sentences verbatim — "Never use a
long word where a short one will do" and "Never use the passive where you can use the
active." Two more are condensed from his ("cut it out", "sooner than say anything
barbarous"), and the rationale for `orwell.no-dead-metaphors` paraphrases his first rule in
a single clause. Each is a short phrase, which is not copyrightable subject matter
(37 C.F.R. § 202.1(a)), and each names its rule number at the point of use.

The essay is **not** in the public domain in the United States: Orwell died in 1950, so the
work has been public domain in the UK and EU since 1 January 2021, but US copyright was
restored under the Uruguay Round Agreements Act and runs 95 years from first publication.
The essay itself is not reproduced here and should not be.

> [!IMPORTANT]
> **Cite Strunk 1918, not Strunk & White.**
>
> The three quoted Strunk passages come from the 1918 first edition, which is in the public
> domain. E. B. White's 1959 revision (Macmillan; 4th ed. Longman, 2000) is still in
> copyright and is **not** quoted here. Where this repository gives two rule numbers —
> `13 / 17` — the first is Strunk's own and the second is the numbering readers of the
> modern edition will recognise. Rule numbers are facts, not expression.

## Named without quotation

These sources are named as the origin of a rule, but no text of theirs is reproduced.
The rules are restated in this repository's own words.

- **_The Economist Style Guide_.** The "must it be read twice?" test and the acronym,
  redundant-temporal and "so-called" rules, restated.
- **Helen Sword, _The Writer's Diet_ (2016).** The four categories of verbal bloat — a
  method, not an expression. Limpid grades A+ to F on its own scale and does not use the
  WritersDiet Test's labels.
- **John M. Swales and Christine B. Feak, _Academic Writing for Graduate Students_.**
  Integral versus non-integral citation, informing the citation-voice rules.
- **Ken Hyland, _Metadiscourse_ (2005).** The hedge/booster distinction.
- **Steven Pinker,** the curse of knowledge — a term originating with Camerer, Loewenstein
  and Weber (1989), used here as the name of the accessibility failure mode.

## Upstream of this repository

The engine, the word lists and the pattern library are ports of the author's own earlier
work in [rpatrik96/research-agora](https://github.com/rpatrik96/research-agora) — MIT
licensed, © Patrik Reizinger — specifically `scripts/writing_verify.py`,
`plugins/editorial/commands/writing-diagnosis.md` and `.../editorial-brain.md`. The
`Rule.source` fields that name those files refer there.

The coaching UX — a scored dashboard with trends, editable rules and a learning surface —
was modeled on Microsoft's [AI-Engineering-Coach](https://github.com/microsoft/ai-engineering-coach).
No code was copied; the resemblance is one of interaction design, which carries no
attribution obligation.

## House rules are yours

Rules you add in `.limpid/rules.json` are read from your workspace at runtime and are
never vendored into this package. Your house style stays your own file, under whatever
terms you like.
