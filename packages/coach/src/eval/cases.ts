/**
 * Golden cases for the LLM-lens eval. Each is a short snippet with a KNOWN issue
 * and a COARSE expectation a competent model should satisfy. Expectations are
 * intentionally loose (substring / count / grade-bucket) — the harness measures
 * whether the lenses catch the right CLASS of problem, not exact wording.
 *
 * Run against a real provider with `npm run eval` (see the repo README).
 */
export interface EvalExpectation {
  /** a finding's patternName should match (case-insensitive substring). */
  expectPattern?: string;
  /** the altitude verdict or assumedAudience should mention this substring. */
  altitudeMentions?: string;
  /** at least this many LLM (precision) findings. */
  minLlmFindings?: number;
  /** the grade should be one of these (coarse sanity). */
  gradeIn?: string[];
}

export interface EvalCase {
  id: string;
  description: string;
  text: string;
  audience?: string;
  expect: EvalExpectation;
}

export const GOLDEN_CASES: EvalCase[] = [
  {
    id: "buried-lede",
    description: "Main contribution arrives in the third sentence.",
    text:
      "Deep networks are widely used today. Many techniques have been explored over the years across countless settings. " +
      "We introduce a reweighting of the loss that doubles sample efficiency, which is the central contribution of this work.",
    expect: { expectPattern: "buried", minLlmFindings: 1 },
  },
  {
    id: "hedge-stacking",
    description: "Conviction-hedging piled up around the claim.",
    text:
      "It could be argued that our method arguably performs somewhat better, and we believe that it might possibly help " +
      "in certain cases, though it seems that the results may perhaps suggest a tentative improvement of some kind.",
    expect: { expectPattern: "hedge", minLlmFindings: 1 },
  },
  {
    id: "altitude-over-explained",
    description: "Explains undergraduate basics to an expert reviewer.",
    audience: "NeurIPS reviewer",
    text:
      "A neural network is a function with parameters. Training means adjusting the parameters to reduce a loss using " +
      "gradient descent, where the gradient points uphill so we step the other way. Our contribution builds on this.",
    expect: { altitudeMentions: "over" },
  },
  {
    id: "altitude-jargon-cliff",
    description: "Dense undefined jargon for a newcomer audience.",
    audience: "ML newcomer",
    text:
      "We amortize the ELBO with a normalizing-flow posterior, anneal the KL via a free-bits schedule, and stop-gradient " +
      "the EMA teacher to avoid posterior collapse under the reparameterized SGLD sampler.",
    expect: { altitudeMentions: "jargon" },
  },
  {
    id: "clean",
    description: "A tight, well-led paragraph that should score well.",
    text:
      "We reweight the loss by inverse class frequency. This doubles sample efficiency on long-tailed benchmarks. " +
      "The gain comes from the rare classes, which the standard loss underweights.",
    expect: { gradeIn: ["A+", "A", "A-", "B+", "B"] },
  },
];
