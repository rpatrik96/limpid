# Strunk & White — _The Elements of Style_ (the rules the coach encodes)

> [!important] What this source buys the rubric
> Strunk & White is the canonical short list of _mechanical_ prose virtues: cut what does not work, prefer the active voice, and refuse the empty syntactic frames (expletive openers, "the fact that") that pad academic writing. These rules are scriptable — they fire on words, phrases, and openers — which is why the rubric grounds its highest-precision `clarity` detectors here.

Reference for `@coach/rubric`'s `Rule.source` fields. Page numbers track the 4th edition (Strunk, White; Longman, 2000); the rules themselves are Strunk's from the 1918 original, sharpened by White in 1959.

## The four rules the rubric implements

| Rule id                        | Canon                                                                                                                 | Page  | What it flags                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ----- | -------------------------------------------------------------- |
| [[strunk.omit-needless-words]] | "Omit needless words." (Rule 17)                                                                                      | p. 23 | Filler words and dead phrases that add length without meaning. |
| [[strunk.active-voice]]        | "Use the active voice." (Rule 14)                                                                                     | p. 18 | Agentless passive constructions where the actor matters.       |
| [[strunk.expletive-openers]]   | "There is / there are" expletives drain the sentence of a real subject. (Rule 14, corollary)                          | p. 18 | Sentences that open with a dummy _there/it_ placeholder.       |
| [[strunk.the-fact-that]]       | "the fact that" — "a debilitating expression … should be revised out of every sentence in which it occurs." (Rule 13) | p. 24 | The nominal filler `the fact that` and its variants.           |

## The guiding sentence

> [!quote] Strunk, Rule 17
> "Vigorous writing is concise. A sentence should contain no unnecessary words, a paragraph no unnecessary sentences, for the same reason that a drawing should have no unnecessary lines and a machine no unnecessary parts. This requires not that the writer make all his sentences short, or that he avoid all detail and treat his subjects only in outline, but that ==every word tell=="

That last clause is the load-bearing one for the voice guards: ==conciseness is "every word tells," not "every sentence is short."== A long sentence that earns each word is not a Strunk violation. This is why the rubric's `voiceGuard` for clause-stacking suppresses naive length penalties rather than the Strunk rules themselves — Strunk never asked for short sentences, only for words that pull their weight.

## Scope and false positives

> [!warning] Where these rules over-fire
>
> - **Active voice is a default, not a law.** "The samples were collected in 2019" is fine — the collector does not matter. The rubric pairs `strunk.active-voice` with the _Zombie Sentence_ pattern (the actor matters _and_ is hidden) to avoid flagging legitimate passives.
> - **"Omit needless words" targets empty words**, not the connectives and subordinators that make long sentences navigable. The filler list is deliberately narrow (`basically`, `simply`, `just`, `very`, `in order to`, …) so it does not strip the conjunctions that carry an argument.

## Related

- [[gopen-swan]] — the _positional_ complement to Strunk's _lexical_ rules (where to put the subject and the verb, not just which words to cut).
- Orwell, _Politics and the English Language_ (1946) — the six rules; overlaps Strunk on active voice and needless words, adds the dead-metaphor and jargon rules.
