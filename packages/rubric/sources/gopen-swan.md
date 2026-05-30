# Gopen & Swan — *The Science of Scientific Writing* (the structural rules the coach encodes)

> [!important] What this source buys the rubric
> Gopen & Swan is the *positional* canon, where Strunk & White is the *lexical* one. Their claim: readers do not extract meaning from words alone but from ==where words sit in the structure of a sentence.== A reader's interpretive energy is finite; spend it decoding misplaced subjects and verbs and there is none left for the science. The rubric grounds its `clarity` and `flow` structural rules here — the ones that fire on *position*, not vocabulary.

Reference for `@coach/rubric`'s `Rule.source` fields. Source: George D. Gopen and Judith A. Swan, "The Science of Scientific Writing," *American Scientist* 78(6):550–558 (1990).

## The three reader-expectation rules the rubric implements

| Rule id | Principle | What it flags |
| --- | --- | --- |
| [[gopen.subject-verb-proximity]] | Keep the subject next to its verb. | Subjects separated from their verb by a long interrupting clause, so the reader holds an incomplete grammatical structure in working memory. |
| [[gopen.stress-position]] | Put the information you want emphasized at the *end* of the sentence — the stress position. | Sentences that bury the new, important idea mid-clause and trail off into old or trivial material. |
| [[gopen.topic-old-before-new]] | Open each sentence with old (already-introduced) information in the *topic position*; introduce new information after. | Sentences that lead with unfamiliar material, breaking the reader's narrative thread between sentences. |

## The reader-energy thesis

> [!quote] Gopen & Swan (1990)
> "The reader has only a fixed amount of reading energy available, and the more of it that is expended trying to discern the structure of the prose, the less is available for understanding the science the prose is intended to convey."

This reframes "clarity" operationally: a sentence is unclear not when it is long but when its *structure* makes the reader work to find subject, verb, and emphasis. It is the academic-prose counterpart to the Economist's ==must it be read twice?== test, and the rubric uses it the same way — to judge a long, clause-stacked sentence by whether it resolves cleanly, not by its word count.

## The three diagnostic questions

> [!tip] Apply these before flagging a sentence
> 1. **Whose story is this sentence?** The grammatical subject should name it. (→ topic position)
> 2. **Where is the verb?** It should follow the subject quickly. (→ subject–verb proximity)
> 3. **What does this sentence want me to remember?** That idea belongs at the end. (→ stress position)

## Scope and false positives

> [!warning] Where these rules need judgment, not a regex
> Subject–verb distance is the one Gopen–Swan rule with a cheap heuristic (token count between subject and verb), so the rubric marks it `heuristic` and lets the engine surface a `subjectVerbDistance` metric. **Stress position** and **old-before-new** require knowing what counts as "new" information — that is reader-model reasoning, so the rubric encodes them as `llm` rules and routes them through the *Buried Lede* and *Orphan Transition* diagnosis patterns rather than a mechanical detector.

## Why this complements Strunk

Strunk tells you *which words to cut*; Gopen & Swan tell you *where the surviving words go*. A sentence can pass every Strunk check — no filler, active voice, no expletive — and still force a re-read because its subject and verb are ten words apart and its punchline sits in the middle. The two sources together cover the lexical and the structural halves of clarity.

## Related

- [[strunk-white]] — the lexical complement (omit needless words, active voice).
- The Economist *Style Guide* — the "read it twice" operative test the rubric uses as the over-long-sentence gate.
