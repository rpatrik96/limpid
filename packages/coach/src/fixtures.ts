/**
 * Test fixtures: a real {@link Extraction} + {@link EngineResult} built by calling
 * the actual `@coach/latex` extractor and `@coach/engine` analyzer on a sample
 * LaTeX paragraph. Using the real pipeline (rather than hand-rolled metrics)
 * keeps the coach tests honest against the contract the upstream packages emit.
 */
import type { EngineResult, Extraction } from "@coach/contract";
import { extract } from "@coach/latex";
import { analyze } from "@coach/engine";

/**
 * A deliberately flawed introduction paragraph: a weak-opener / expletive start,
 * a buried lede (claim in the last sentence), filler ("basically", "very"), a
 * hedge ("might"), and a passive ("was evaluated") — enough to exercise both the
 * deterministic engine and the LLM lenses.
 */
export const SAMPLE_TEX = String.raw`\section{Introduction}
It is important to note that distribution shift is a long-standing concern
in machine learning, and many methods address it. There is a large body of
prior work that uses reweighting, and the model was evaluated on several
benchmarks. We basically find that a very simple test-time adaptation might
outperform all of these prior reweighting methods under distribution shift.`;

/** A math-heavy source whose proseRatio falls below the low-confidence cutoff. */
export const MATH_HEAVY_TEX = String.raw`\section{Proof}
\begin{equation}
  \mathcal{L}(\theta) = \mathbb{E}_{x \sim p}\left[ \| f_\theta(x) - y \|^2 \right]
    + \lambda \sum_{i=1}^{n} \Omega(\theta_i).
\end{equation}
\begin{align}
  \nabla_\theta \mathcal{L} &= 2 \mathbb{E}_{x}\left[ (f_\theta(x) - y) \nabla_\theta f_\theta(x) \right]
    + \lambda \nabla_\theta \Omega(\theta). \\
  \theta^{t+1} &= \theta^{t} - \eta \nabla_\theta \mathcal{L}(\theta^t).
\end{align}
Thus the iterate converges.`;

export interface Fixture {
  extraction: Extraction;
  engine: EngineResult;
}

export function buildFixture(tex: string = SAMPLE_TEX): Fixture {
  const extraction = extract(tex);
  const engine = analyze(extraction.text);
  return { extraction, engine };
}
