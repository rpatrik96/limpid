import type { Rule } from "@coach/contract";

import {
  BOOSTER_WORDS,
  CLICHES,
  FILLER_PHRASES,
  FILLER_WORDS,
  HEDGE_PHRASES,
  HEDGE_WORDS,
  HYPE_WORDS,
  WEAK_OPENERS,
} from "./wordlists.js";

/**
 * The canon as data. Each rule grounds a check in a named source, carries the
 * teaching "why" (rationale), and — where the check is mechanical — a detector
 * the engine can run without an LLM. The canonical word/phrase lists live in
 * `wordlists.ts` (the single source the engine also imports); structural rules
 * cite Gopen & Swan and the Economist via the grounding notes in `sources/`.
 *
 * Detector kinds:
 *   words   — whole-word match (engine adds \b boundaries)
 *   phrases — substring match, lowercased
 *   regex   — pattern + flags; MUST compile (asserted in tests)
 *   opener  — sentence-initial prefix match
 *
 * Severity ladder: error > warning > suggestion > info.
 */

// A `RuleDetector`'s word/phrase fields are mutable `string[]`; the canonical
// lists are `readonly`, so copy them into fresh arrays at the detector boundary.
const w = (xs: readonly string[]): string[] => [...xs];

// ── Rules ───────────────────────────────────────────────────────────────────

export const rules: Rule[] = [
  // ── Orwell — Politics and the English Language (1946), the six rules ──────
  {
    id: "orwell.no-dead-metaphors",
    name: "Never use a dying metaphor",
    category: "clarity",
    source: "Orwell, Politics and the English Language (1946), Rule i",
    method: "hybrid",
    severity: "suggestion",
    rationale:
      "A worn-out metaphor (a cliché) has lost its image and so does no work — it merely signals that the writer is not thinking in pictures. Orwell's test: never use a figure of speech you are used to seeing in print.",
    detector: { kind: "phrases", phrases: w(CLICHES) },
    examples: [
      {
        before: "Our results are just the tip of the iceberg.",
        after: "Our results cover three of the dozen settings that matter; the rest are open.",
      },
    ],
  },
  {
    id: "orwell.short-word",
    name: "Never use a long word where a short one will do",
    category: "accessibility",
    source: "Orwell, Politics and the English Language (1946), Rule ii",
    method: "hybrid",
    severity: "suggestion",
    rationale:
      'Long Latinate words signal effort, not precision. Prefer the short Saxon word when it means the same thing — "use" over "utilize", "about" over "approximately" when the number is loose.',
    detector: {
      kind: "regex",
      pattern:
        "\\b(?:utiliz[e|es|ed|ing]+|in\\s+order\\s+to|methodolog(?:y|ies)|functionalit(?:y|ies)|prior\\s+to|subsequent\\s+to|in\\s+the\\s+event\\s+that)\\b",
      flags: "gi",
    },
    examples: [
      {
        before: "We utilize the framework in order to facilitate training prior to evaluation.",
        after: "We use the framework to speed up training before evaluation.",
      },
    ],
  },
  {
    id: "orwell.cut-needless-words",
    name: "If it is possible to cut a word out, cut it out",
    category: "clarity",
    source: "Orwell, Politics and the English Language (1946), Rule iii",
    method: "hybrid",
    severity: "warning",
    rationale:
      "Filler words and dead phrases add length without meaning. Cutting them sharpens the claim and lets the real words carry weight. Orwell's third rule is Strunk's seventeenth in disguise.",
    detector: { kind: "words", words: w(FILLER_WORDS) },
    examples: [
      {
        before: "This is basically just a very simple extension of prior work.",
        after: "This extends prior work.",
      },
    ],
  },
  {
    id: "orwell.active-voice",
    name: "Never use the passive where you can use the active",
    category: "clarity",
    source: "Orwell, Politics and the English Language (1946), Rule iv",
    method: "heuristic",
    severity: "warning",
    rationale:
      "The active voice names the actor and shortens the sentence. The passive hides who did what — fine when the actor truly doesn't matter, a fault when it does. See the Zombie Sentence pattern for the actor-matters case.",
    detector: {
      kind: "regex",
      pattern:
        "\\b(?:is|are|was|were|be|been|being)\\s+(?:\\w+\\s+){0,2}(?:\\w+ed|written|given|taken|known|shown|grown|done|found|made|built|seen|held|sent|drawn)\\b",
      flags: "gi",
    },
    examples: [
      {
        before: "The model was trained on ImageNet by our team for 100 epochs.",
        after: "We trained the model on ImageNet for 100 epochs.",
      },
    ],
  },
  {
    id: "orwell.no-jargon",
    name: "Never use jargon if you can think of an everyday equivalent",
    category: "accessibility",
    source: "Orwell, Politics and the English Language (1946), Rule v",
    method: "llm",
    severity: "suggestion",
    rationale:
      'Foreign phrases, scientific words, and jargon should earn their place. Keep a term of art when it is precise ("stochastic gradient descent"); cut it when an everyday word means the same. The Jargon Cliff pattern catches the density spike.',
    examples: [
      {
        before: "We leverage a bespoke heuristic to ameliorate the convergence pathology a priori.",
        after: "We add a simple rule that fixes the convergence problem up front.",
      },
    ],
  },
  {
    id: "orwell.break-any-rule",
    name: "Break any of these rules sooner than say anything barbarous",
    category: "voice-guard",
    source: "Orwell, Politics and the English Language (1946), Rule vi",
    method: "llm",
    severity: "info",
    rationale:
      "Orwell's escape hatch: the five mechanical rules serve clarity, not the reverse. When applying a rule would produce something clumsy or false, break the rule. This rule grounds the rubric's voice guards — it is why a long sentence that resolves cleanly is not a violation.",
    examples: [
      {
        before:
          "(Mechanically de-passivized:) We collected the dataset in 2019, and we trained models, and we evaluated them.",
        after: "The dataset was collected in 2019. We then trained and evaluated the models.",
      },
    ],
  },

  // ── Strunk — The Elements of Style (1918) ─────────────────────────────────
  {
    id: "strunk.omit-needless-words",
    name: "Omit needless words",
    category: "clarity",
    source:
      "Strunk, The Elements of Style (1918), Rule 13 (= Strunk & White Rule 17; see sources/strunk-white.md)",
    method: "hybrid",
    severity: "warning",
    rationale:
      'Vigorous writing is concise: every word should tell. This targets empty phrases — "in order to", "it is important to note that" — not the connectives that carry an argument. Conciseness means every word works, not that every sentence is short.',
    detector: { kind: "phrases", phrases: w(FILLER_PHRASES) },
    examples: [
      {
        before: "It is important to note that, in order to train, we needed more data.",
        after: "Training needed more data.",
      },
    ],
  },
  {
    id: "strunk.active-voice",
    name: "Use the active voice",
    category: "clarity",
    source:
      "Strunk, The Elements of Style (1918), Rule 10 (= Strunk & White Rule 14; see sources/strunk-white.md)",
    method: "heuristic",
    severity: "suggestion",
    rationale:
      "The active voice is usually more direct and vigorous than the passive. It is a default, not a law: keep the passive when the actor genuinely does not matter. Pairs with the Zombie Sentence pattern.",
    detector: {
      kind: "regex",
      pattern: "\\b(?:was|were|is|are|been|being)\\s+(?:\\w+ed|conducted|performed|observed)\\b",
      flags: "gi",
    },
    examples: [
      {
        before: "Experiments were conducted to evaluate the approach.",
        after: "We ran experiments to evaluate the approach.",
      },
    ],
  },
  {
    id: "strunk.expletive-openers",
    name: "Avoid expletive openers (there is / there are / it is)",
    category: "clarity",
    source:
      "Strunk, The Elements of Style (1918), Rule 13 (= Strunk & White Rule 17; see sources/strunk-white.md)",
    method: "heuristic",
    severity: "warning",
    rationale:
      'An expletive opener ("there is", "it is") postpones the real subject behind a dummy placeholder, draining the sentence of its actor and adding words. Recast with the true subject first.',
    detector: { kind: "opener", prefixes: w(WEAK_OPENERS) },
    examples: [
      {
        before: "There is a strong correlation between depth and accuracy.",
        after: "Depth correlates strongly with accuracy.",
      },
    ],
  },
  {
    id: "strunk.the-fact-that",
    name: "Strike out 'the fact that'",
    category: "clarity",
    source:
      "Strunk, The Elements of Style (1918), Rule 13 (= Strunk & White Rule 17; see sources/strunk-white.md)",
    method: "hybrid",
    severity: "warning",
    rationale:
      'Strunk: "the fact that" should be revised out of every sentence in which it occurs. It nominalizes a verb and delays the point.',
    detector: {
      kind: "regex",
      pattern: "\\bthe\\s+fact\\s+that\\b",
      flags: "gi",
    },
    examples: [
      {
        before: "The fact that the model overfits suggests we need regularization.",
        after: "The model overfits, so we add regularization.",
      },
    ],
  },

  // ── The Economist Style Guide ─────────────────────────────────────────────
  {
    id: "economist.read-twice",
    name: "Must it be read twice?",
    category: "flow",
    source: "The Economist Style Guide — clarity of thought, clarity of prose",
    method: "llm",
    severity: "warning",
    rationale:
      "The Economist's operative test for an over-long sentence is not word count but whether the reader must read it twice to parse it. A long, clause-stacked sentence that resolves cleanly on the first pass is fine; one that forces a re-read is not. This is the test the rubric uses instead of a raw length cap.",
    examples: [
      {
        before:
          "The method, which, although derived under assumptions that, as we discuss later, may not always hold, nonetheless, in the experiments we report, performs well.",
        after:
          "The method performs well in our experiments, even though its derivation rests on assumptions that may not always hold (we discuss these later).",
      },
    ],
  },
  {
    id: "economist.acronym-penalty",
    name: "Define acronyms on first use",
    category: "accessibility",
    source: "The Economist Style Guide — do not make readers decode initialisms",
    method: "heuristic",
    severity: "suggestion",
    rationale:
      "An undefined acronym is a lookup the reader must perform mid-sentence. Spell it out on first use (except the truly universal: GPU, API, CPU). The engine tracks undefined acronyms; this rule supplies the teaching.",
    detector: {
      kind: "regex",
      pattern: "\\b(?:[A-Z]{2,}|[A-Z]+[a-z]?[A-Z]+)\\b",
      flags: "g",
    },
    examples: [
      {
        before: "We align the model with RLHF and evaluate OOD generalization.",
        after:
          "We align the model with reinforcement learning from human feedback (RLHF) and evaluate out-of-distribution (OOD) generalization.",
      },
    ],
  },
  {
    id: "economist.redundant-temporals",
    name: "Cut redundant temporals (now, currently, at present)",
    category: "clarity",
    source: "The Economist Style Guide — short words are strong words",
    method: "hybrid",
    severity: "suggestion",
    rationale:
      '"Currently", "now", "at present", "at this point in time" rarely add information in scientific prose — the present tense already says it. Cut them.',
    detector: {
      kind: "regex",
      pattern:
        "\\b(?:currently|presently|at\\s+present|at\\s+this\\s+(?:point|moment)\\s+in\\s+time|nowadays|at\\s+this\\s+time)\\b",
      flags: "gi",
    },
    examples: [
      {
        before: "Currently, most methods at present rely on large datasets.",
        after: "Most methods rely on large datasets.",
      },
    ],
  },
  {
    id: "economist.so-called",
    name: "Avoid 'so-called' as a sneer or a crutch",
    category: "precision",
    source: "The Economist Style Guide — let the term stand or define it",
    method: "hybrid",
    severity: "suggestion",
    rationale:
      '"So-called" either casts doubt (a sneer that has no place in technical prose) or stalls before defining a term. Name the term and, if it needs justifying, justify it.',
    detector: {
      kind: "regex",
      pattern: "\\bso[-\\s]called\\b",
      flags: "gi",
    },
    examples: [
      {
        before: "We test the so-called grokking phenomenon.",
        after: "We test grokking — the delayed jump from memorization to generalization.",
      },
    ],
  },

  // ── Writer's Diet — Helen Sword, the four kinds of bloat ──────────────────
  {
    id: "writersdiet.be-verbs",
    name: "Be-verb flab (is / are / was / were)",
    category: "clarity",
    source: "Helen Sword, The Writer's Diet (2016) — verbal bloat",
    method: "heuristic",
    severity: "suggestion",
    rationale:
      'A sentence built on "is/are/was/were" leans on the weakest verb in English. A concrete verb carries the action and cuts words: "performance improves" beats "there is an improvement in performance".',
    detector: {
      kind: "regex",
      pattern: "\\b(?:is|are|was|were|be|been|being)\\b",
      flags: "gi",
    },
    examples: [
      {
        before: "There is an improvement in accuracy when dropout is used.",
        after: "Accuracy improves with dropout.",
      },
    ],
  },
  {
    id: "writersdiet.nominalizations",
    name: "Nominalizations (zombie nouns: -tion / -ment / -ity)",
    category: "clarity",
    source: "Helen Sword, The Writer's Diet (2016) — nouns that swallow verbs",
    method: "heuristic",
    severity: "suggestion",
    rationale:
      'Zombie nouns ending in -tion, -ment, -ity, -ance bury a verb and an actor. "The optimization of the loss" hides "optimize". Find the hidden verb and let it act. (Terms of art like "distribution" or "optimization" naming a field are exempt — the Abstraction Fog pattern judges in context.)',
    detector: {
      kind: "regex",
      pattern: "\\b\\w{4,}(?:tion|ment|ity|ance|ence|ness)\\b",
      flags: "gi",
    },
    examples: [
      {
        before: "The optimization of neural network weights requires careful initialization.",
        after: "Optimizing neural-network weights requires initializing them carefully.",
      },
    ],
  },
  {
    id: "writersdiet.prepositions",
    name: "Prepositional pile-up (of the / for the / in the)",
    category: "flow",
    source: "Helen Sword, The Writer's Diet (2016) — prepositional bloat",
    method: "heuristic",
    severity: "suggestion",
    rationale:
      'Strings of prepositional phrases ("the reduction of the variance of the estimator of the gradient") stack modifiers the reader must unwind. Reorder so the head noun comes first or recast with a verb.',
    detector: {
      kind: "regex",
      pattern:
        "\\b(?:of|for|in|on|to|with|by)\\s+the\\b(?:\\s+\\w+\\s+(?:of|for|in|on|to|with|by)\\s+the\\b)",
      flags: "gi",
    },
    examples: [
      {
        before: "the reduction of the variance of the estimator of the gradient",
        after: "the gradient estimator's lower variance",
      },
    ],
  },
  {
    id: "writersdiet.adjectives",
    name: "Adjective and adverb bloat",
    category: "precision",
    source: "Helen Sword, The Writer's Diet (2016) — waist-deep in modifiers",
    method: "hybrid",
    severity: "suggestion",
    rationale:
      'Empty intensifiers ("very", "highly", "extremely") and -ly adverbs pad a claim without adding information. A precise noun or verb makes them unnecessary: "surges" beats "increases very significantly".',
    detector: {
      kind: "regex",
      pattern:
        "\\b(?:very|highly|extremely|incredibly|remarkably|substantially|significantly|considerably)\\b",
      flags: "gi",
    },
    examples: [
      {
        before: "The method is very highly effective and significantly faster.",
        after: "The method is effective and 3x faster.",
      },
    ],
  },

  // ── Hedges, boosters, clichés (the conviction axis) ───────────────────────
  {
    id: "voice.hedges",
    name: "Hedge words (might / may / possibly / arguably)",
    category: "precision",
    source: "writing-diagnosis.md — Hedge Stacking",
    method: "hybrid",
    severity: "suggestion",
    rationale:
      'One hedge per claim is honest scope-marking. Stacked hedges ("might possibly suggest could") tell the reader you don\'t believe the claim either. Hedge scope, not conviction: "sufficient but not necessary" is a virtue; "arguably" is a crutch.',
    detector: { kind: "words", words: w(HEDGE_WORDS) },
    examples: [
      {
        before: "Our results might possibly suggest the effect could potentially be real.",
        after: "Our results suggest the effect is real.",
      },
    ],
  },
  {
    id: "voice.hedge-phrases",
    name: "Hedge phrases (it could be argued / to some extent)",
    category: "precision",
    source: "writing-diagnosis.md — Hedge Stacking; writing_verify.py HEDGE_PHRASES",
    method: "hybrid",
    severity: "suggestion",
    rationale:
      'Multi-word hedges ("it could be argued that", "there is reason to believe") hide the author and dilute the claim. State it and own it, or cut it. Conviction-hedging is the fault; scope-hedging is fine.',
    detector: { kind: "phrases", phrases: w(HEDGE_PHRASES) },
    examples: [
      {
        before: "It could be argued that, to some extent, the method helps.",
        after: "The method helps: it cuts error by 12%.",
      },
    ],
  },
  {
    id: "voice.boosters",
    name: "Boosters (clearly / obviously / undoubtedly)",
    category: "precision",
    source: "Hyland, Metadiscourse (2005) — boosters vs. hedges",
    method: "hybrid",
    severity: "suggestion",
    rationale:
      'Boosters assert importance the prose should demonstrate. "Clearly" and "obviously" often flag the step the author skipped — if it were clear, the word would be unnecessary. Show the reasoning instead.',
    detector: { kind: "words", words: w(BOOSTER_WORDS) },
    examples: [
      {
        before: "Clearly, the method obviously generalizes.",
        after: "The method generalizes: it holds on three unseen domains (Table 2).",
      },
    ],
  },
  {
    id: "voice.hype",
    name: "Hype adjectives (novel / powerful / state-of-the-art)",
    category: "precision",
    source: "editorial-brain.md — papers state and demonstrate, not believe and feel",
    method: "hybrid",
    severity: "suggestion",
    rationale:
      'Marketing adjectives ask the reader to take a verdict on faith. Reviewers flag "novel" and "powerful" as tells. Let the result earn the adjective — report the number and drop the boast.',
    detector: { kind: "words", words: w(HYPE_WORDS) },
    examples: [
      {
        before: "We propose a novel and powerful state-of-the-art method.",
        after: "We propose a method that improves the prior best by 4 points.",
      },
    ],
  },
  {
    id: "voice.cliches",
    name: "Clichés (paradigm shift / low-hanging fruit)",
    category: "precision",
    source: "Orwell, Politics and the English Language (1946), Rule i; writing canon",
    method: "hybrid",
    severity: "suggestion",
    rationale:
      "A cliché is a dead metaphor that signals borrowed thinking. Replace it with the literal claim it was standing in for, which is almost always more specific and more honest.",
    detector: { kind: "phrases", phrases: w(CLICHES) },
    examples: [
      {
        before: "This is a paradigm shift that picks the low-hanging fruit.",
        after: "This changes how the field measures robustness, and it does so cheaply.",
      },
    ],
  },

  // ── Gopen & Swan — structural placement (see sources/gopen-swan.md) ───────
  {
    id: "gopen.subject-verb-proximity",
    name: "Keep the subject next to its verb",
    category: "clarity",
    source: "Gopen & Swan, The Science of Scientific Writing (1990) (see sources/gopen-swan.md)",
    method: "heuristic",
    severity: "suggestion",
    rationale:
      "Readers expect a subject's verb to follow quickly. A long interrupting clause between them forces the reader to hold an incomplete structure in working memory until the verb finally arrives. The engine's subjectVerbDistance metric surfaces the worst cases.",
    examples: [
      {
        before:
          "The estimator, which we derive in Section 3 under assumptions that mirror prior work, converges.",
        after:
          "The estimator converges. We derive it in Section 3 under assumptions that mirror prior work.",
      },
    ],
  },
  {
    id: "gopen.stress-position",
    name: "Put the emphasis in the stress position (sentence end)",
    category: "flow",
    source: "Gopen & Swan, The Science of Scientific Writing (1990) (see sources/gopen-swan.md)",
    method: "llm",
    severity: "suggestion",
    rationale:
      "The end of a sentence is its stress position — the place the reader naturally emphasizes. Put the new, important idea there; do not trail off into old or trivial material. Pairs with the Buried Lede pattern at the sentence scale.",
    examples: [
      {
        before: "A 4-point gain over the prior best is what our method achieves, in most settings.",
        after: "In most settings, our method beats the prior best by 4 points.",
      },
    ],
  },
  {
    id: "gopen.old-before-new",
    name: "Open with old information (topic position), then introduce new",
    category: "flow",
    source: "Gopen & Swan, The Science of Scientific Writing (1990) (see sources/gopen-swan.md)",
    method: "llm",
    severity: "suggestion",
    rationale:
      "Each sentence should begin in the topic position with information the reader already has, then move to new material. Leading with the unfamiliar breaks the narrative thread between sentences. This is the sentence-level engine behind the Orphan Transition pattern.",
    examples: [
      {
        before:
          "We optimize the loss with Adam. Variance reduction is what the resulting estimator provides.",
        after: "We optimize the loss with Adam. The resulting estimator reduces variance.",
      },
    ],
  },

  // ── Citation & cross-reference voice ──────────────────────────────────────
  // The extractor collapses every \cite/\citet/\citep AND \ref/\cref/\eqref into a
  // single "[ref]" token; these heuristic rules read that token. They are nudges
  // (severity: suggestion) and teach via the rationale — the before/after is a
  // GENERIC illustration, so the Coach view shows it but offers no "apply fix"
  // (that's reserved for the LLM lenses' span-specific rewrites).
  {
    id: "citation.as-subject",
    name: "Citation as subject",
    category: "precision",
    source:
      "Swales & Feak, Academic Writing for Graduate Students — integral vs. non-integral citation",
    method: "heuristic",
    severity: "suggestion",
    rationale:
      'A citation as the grammatical subject ("[ref] shows that X") foregrounds who said it over what was found. Lead with the claim and cite it — "X holds [ref]" — and keep the author-prominent form for when the attribution itself is the point (a contrast, or a disputed claim).',
    detector: {
      kind: "regex",
      pattern:
        "\\[ref\\]\\s+(?:shows?|argues?|demonstrates?|proposes?|claims?|finds?|reports?|observes?|notes?|suggests?|introduces?|presents?|establishes?|proves?|assumes?)\\b",
      flags: "gi",
    },
    examples: [
      {
        before: "[ref] shows that deeper networks generalize better.",
        after: "Deeper networks generalize better [ref].",
      },
    ],
  },
  {
    id: "citation.pile-up",
    name: "Citation pile-up",
    category: "clarity",
    source: "Limpid house style — readability of dense citation",
    method: "heuristic",
    severity: "suggestion",
    rationale:
      "Three or more references stacked on one point ([ref] [ref] [ref]) make the reader wade through a wall of citations before reaching the idea. Fold them into one grouped citation, or attribute only the one or two that carry the claim.",
    detector: {
      kind: "regex",
      pattern: "\\[ref\\](?:[\\s,;]+\\[ref\\]){2,}",
      flags: "gi",
    },
    examples: [
      {
        before: "This holds across architectures [ref] [ref] [ref] [ref].",
        after: "This holds across architectures [ref].",
      },
    ],
  },
  {
    id: "citation.weak-opener",
    name: "Weak reference opener",
    category: "flow",
    source:
      "Swales & Feak, Academic Writing for Graduate Students (sentence-initial citation); Gopen & Swan, topic position",
    method: "heuristic",
    severity: "suggestion",
    rationale:
      'Opening a sentence by pointing at a reference or figure ("As shown in [ref], …") makes the pointer the subject and pushes the claim out of the topic position. Lead with what is true, then point: "X converges [ref] (Fig. 3)."',
    detector: {
      kind: "regex",
      pattern:
        "(?:^|(?<=[.!?]\\s)|(?<=\\n))(?:as\\s+shown\\s+in|as\\s+demonstrated\\s+in|as\\s+discussed\\s+in|as\\s+seen\\s+in|as\\s+reported\\s+in|according\\s+to|following|per)\\s+\\[ref\\]",
      flags: "gi",
    },
    examples: [
      {
        before: "As shown in [ref], the loss decreases monotonically.",
        after: "The loss decreases monotonically [ref].",
      },
    ],
  },
];
