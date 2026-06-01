import type { DiagnosisPattern } from "@coach/contract";

/**
 * The twelve named failure patterns — the educational headlines.
 *
 * Verbatim-in-spirit from `writing-diagnosis.md`'s Pattern Library. A named
 * pattern is a mental label the author carries to the next draft ("oh, this is
 * Idea Soup again"), which is why the rubric ships them as data the coach
 * surfaces, not as anonymous lint. Most require reader-model judgment, so
 * detectableBy is "llm"; the few with a mechanical tail are "hybrid".
 *
 * Priority for remediation (from the source): comprehension blockers first
 * (Idea Soup, Cognitive Overload, Jargon Cliff), flow second (Buried Lede,
 * Orphan Transition, Scale Mismatch), style last (Monotonous Rhythm,
 * Echo Chamber, Throat Clearing).
 */
export const patterns: DiagnosisPattern[] = [
  {
    id: "idea-soup",
    name: "Idea Soup",
    definition:
      "Multiple unrelated points crammed into one paragraph. The reader cannot summarize it in five words.",
    howToSpot:
      "Try to write a single topic sentence for the paragraph. If you can't, it's Idea Soup.",
    whyItFails:
      "Working memory holds one paragraph-level idea. Two ideas in one paragraph means one gets dropped.",
    example: {
      before:
        "Our method improves accuracy, and we also note that training time matters for deployment, while the dataset we chose has known label noise that prior work ignored.",
      after:
        "Our method improves accuracy. (New paragraph) Deployment also constrains training time, which our method keeps low. (New paragraph) We evaluate on a dataset whose label noise prior work ignored.",
    },
    detectableBy: "llm",
  },
  {
    id: "buried-lede",
    name: "Buried Lede",
    definition:
      "The main point appears in sentence 3 or 4 instead of sentence 1. The paragraph warms up before saying the thing.",
    howToSpot:
      "Cover sentences 1–2. Does the paragraph still make sense? If yes, sentences 1–2 are throat-clearing.",
    whyItFails:
      "Readers use sentence 1 as the frame for interpreting everything that follows. A wrong frame forces a re-read.",
    example: {
      before:
        "Distribution shift is a long-standing concern in machine learning. Many methods address it. Prior work uses reweighting. We find that simple test-time adaptation outperforms all of them.",
      after:
        "Simple test-time adaptation outperforms prior reweighting methods under distribution shift — a long-standing concern these methods address only partially.",
    },
    detectableBy: "llm",
  },
  {
    id: "cognitive-overload",
    name: "Cognitive Overload",
    definition:
      "A sentence exceeds ~40 words with nested subordinate clauses, so the reader loses the grammatical thread before reaching the verb.",
    howToSpot:
      "Count words and try to parse the structure on first read. If you can't, neither can the reader. A sentence needing a semicolon and two commas is probably two sentences.",
    whyItFails:
      "Working memory for syntactic structure is limited. Nested clauses force the reader to hold a stack of incomplete structures.",
    example: {
      before:
        "We propose a novel transformer architecture that incorporates sparse attention patterns which reduce computational complexity from quadratic to linear while maintaining performance on standard benchmarks and enabling processing of sequences up to 100K tokens.",
      after:
        "We propose a transformer with sparse attention patterns. This design cuts complexity from quadratic to linear while holding benchmark performance, and it processes sequences up to 100K tokens.",
    },
    detectableBy: "hybrid",
  },
  {
    id: "monotonous-rhythm",
    name: "Monotonous Rhythm",
    definition:
      "Every sentence has the same length and structure (subject-verb-object, subject-verb-object), creating a droning effect.",
    howToSpot:
      "Read aloud. If it sounds like a metronome, the rhythm is flat. The engine's monotony score and low length CV flag the same thing.",
    whyItFails:
      "Rhythm variation signals emphasis. Flat rhythm means nothing stands out, so nothing gets remembered.",
    example: {
      before:
        "The model uses attention. The model has layers. The model learns weights. The model predicts labels.",
      after:
        "The model attends across its layers, learning weights that map inputs to labels. Four stages, one pass.",
    },
    detectableBy: "hybrid",
  },
  {
    id: "hedge-stacking",
    name: "Hedge Stacking",
    definition:
      'Multiple hedges piled onto one claim: "might possibly suggest that it could potentially indicate."',
    howToSpot: "Count qualifiers per sentence. More than one hedge per claim signals the problem.",
    whyItFails:
      "Each hedge dilutes confidence. Three hedges on one claim tell the reader you don't believe it either.",
    example: {
      before:
        "This might possibly suggest that the model could potentially be overfitting to some extent.",
      after: "These results suggest the model overfits.",
    },
    detectableBy: "hybrid",
  },
  {
    id: "orphan-transition",
    name: "Orphan Transition",
    definition:
      "A new paragraph begins with no connection to the previous one, so the reader experiences topic whiplash.",
    howToSpot:
      "Read the last sentence of paragraph N and the first sentence of paragraph N+1 back-to-back. If they feel like they're from different documents, that's an orphan transition.",
    whyItFails:
      "Readers build a narrative thread across paragraphs. Breaking it forces them to reset context, which costs comprehension.",
    example: {
      before:
        "…and so our method reduces variance.\n\nThe learning rate was set to 1e-3 for all experiments.",
      after:
        "…and so our method reduces variance.\n\nBeyond the estimator itself, the optimization setup matters: we set the learning rate to 1e-3 across all experiments.",
    },
    detectableBy: "llm",
  },
  {
    id: "abstraction-fog",
    name: "Abstraction Fog",
    definition:
      'Abstract nouns doing the work of concrete verbs: "the optimization of the parameters" instead of "we optimize the parameters."',
    howToSpot:
      'Look for -tion and -ment nouns that could be verbs, and count prepositional chains ("of the", "for the", "in the").',
    whyItFails:
      "Abstract nouns hide the actor and the action, so the reader has to reconstruct who did what.",
    example: {
      before:
        "The utilization of attention mechanisms enables the reduction of the computation of long contexts.",
      after: "Using attention reduces the computation for long contexts.",
    },
    detectableBy: "hybrid",
  },
  {
    id: "zombie-sentence",
    name: "Zombie Sentence",
    definition:
      'Passive voice hiding the actor when the actor matters: "It was found that…", "The model was trained…", "Experiments were conducted…".',
    howToSpot:
      'Ask "by whom?" If the answer matters and is missing, it\'s a zombie sentence. (Passive is fine when the actor genuinely doesn\'t matter: "The dataset was collected in 2019.")',
    whyItFails:
      "Readers need agents to build a mental model of what happened. Agentless sentences float without anchoring.",
    example: {
      before: "It was found that performance degraded under distribution shift.",
      after: "We found that performance degrades under distribution shift.",
    },
    detectableBy: "hybrid",
  },
  {
    id: "echo-chamber",
    name: "Echo Chamber",
    definition:
      'The same word or phrase repeated three or more times in close proximity: "the model uses the model architecture to model the distribution."',
    howToSpot: "Read aloud. Repeated words create an audible stutter.",
    whyItFails:
      "Repetition signals emphasis. Unintentional repetition creates false emphasis and makes prose feel unpolished.",
    example: {
      before: "The model uses the model architecture to model the distribution.",
      after: "The architecture models the distribution.",
    },
    detectableBy: "hybrid",
  },
  {
    id: "throat-clearing",
    name: "Throat Clearing",
    definition:
      'Opening with filler before saying the actual thing: "It is important to note that…", "It should be mentioned that…", "As we all know…".',
    howToSpot: "Delete the opening phrase. If the sentence still works, it was throat clearing.",
    whyItFails:
      "The reader allocates attention to the opening. Wasting it on filler means less attention for the actual content.",
    example: {
      before: "It is important to note that our estimator is unbiased under mild assumptions.",
      after: "Our estimator is unbiased under mild assumptions.",
    },
    detectableBy: "hybrid",
  },
  {
    id: "scale-mismatch",
    name: "Scale Mismatch",
    definition:
      'A paragraph-level claim supported by sentence-level evidence, or vice versa: "Deep learning has transformed computer vision" backed by "our model gets 92% on CIFAR-10."',
    howToSpot:
      "Check whether the scope of the claim matches the scope of the evidence. Grand claims need broad evidence; narrow evidence supports narrow claims.",
    whyItFails:
      "The reader notices the gap between claim and evidence, even subconsciously, and it erodes trust.",
    example: {
      before: "Deep learning has transformed computer vision: our model reaches 92% on CIFAR-10.",
      after:
        "Our model reaches 92% on CIFAR-10, improving 3 points over the prior best on this benchmark.",
    },
    detectableBy: "llm",
  },
  {
    id: "jargon-cliff",
    name: "Jargon Cliff",
    definition:
      "Technical density spikes without warning, and the reader falls off a comprehension cliff because three undefined terms appeared in one sentence.",
    howToSpot:
      "Read as someone one expertise level below the target audience. If a sentence needs three mental lookups, it's a jargon cliff.",
    whyItFails: "Each unknown term consumes working memory. Three at once exhausts it.",
    example: {
      before:
        "We anneal the InfoNCE temperature on the equivariant latent under a VICReg covariance penalty.",
      after:
        "We use a contrastive loss (InfoNCE) and lower its temperature during training. The representation is equivariant — group actions on the input map to predictable changes in the latent — and we add a covariance penalty (from VICReg) to keep its dimensions from collapsing.",
    },
    detectableBy: "llm",
  },
];
