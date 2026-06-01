/**
 * A canned {@link LanguageModel} for tests and offline runs.
 *
 * The vscode.lm (Copilot) and Claude providers live in `apps/extension` — this
 * package ships only the mock so its tests run with no network and no secrets.
 *
 * Construct with an explicit response to exercise specific paths:
 *   - a valid {@link LensResult} JSON string → happy path,
 *   - malformed text → the coach's parse-failure / retry / degrade path,
 *   - a per-call sequence → first-call-malformed-then-valid (retry succeeds).
 */
import type { LanguageModel, LMRequest, LMResponse } from "@coach/contract";

import type { LensResult } from "./lenses.js";

export interface MockLanguageModelOptions {
  /** Stable id reported by the model (defaults to "mock"). */
  id?: string;
  /**
   * What to return. Either a fixed string for every call, or a sequence consumed
   * one entry per call (the last entry repeats once exhausted). A LensResult
   * object is JSON-stringified for you.
   */
  response?: string | LensResult;
  responses?: (string | LensResult)[];
}

const DEFAULT_LENS: LensResult = {
  stressTopic: [
    {
      message: "Sentence trails off into old material instead of its result.",
      why: "The stress position (sentence end) should carry the new, important idea.",
      suggestion: "Move the result to the end of the sentence.",
      before: "A 4-point gain over the prior best is what our method achieves, in most settings.",
      after: "In most settings, our method beats the prior best by 4 points.",
      spans: [{ start: 0, end: 20 }],
      severity: "suggestion",
    },
  ],
  cohesion: [
    {
      message: "Paragraph opens on a new topic with no bridge from the previous one.",
      why: "Readers build a thread across paragraphs; an abrupt switch forces a reset.",
      suggestion: "Add a bridging clause linking back to the prior paragraph.",
      severity: "suggestion",
    },
  ],
  altitude: {
    assumedAudience: "an ML researcher reviewing for a top venue",
    inferred: true,
    verdict: "calibrated for the assumed reviewer, with one jargon term left undefined",
    signals: ["uses 'InfoNCE' without gloss", "assumes familiarity with distribution shift"],
  },
  argumentFlow: [
    {
      message: "The main claim appears in sentence 3; the paragraph warms up first.",
      why: "Readers use sentence 1 as the interpretive frame; a buried lede forces a re-read.",
      suggestion: "Lead with the claim, then support it.",
      before:
        "Distribution shift is a long-standing concern. Many methods address it. We find test-time adaptation wins.",
      after: "Test-time adaptation outperforms prior methods under distribution shift.",
      spans: [{ start: 0, end: 30 }],
      severity: "warning",
    },
  ],
  patterns: [
    {
      id: "buried-lede",
      evidence: "The paragraph's claim is in sentence 3, not sentence 1.",
      severity: "warning",
    },
  ],
  precisionScore: 6.5,
};

function serialize(r: string | LensResult): string {
  return typeof r === "string" ? r : JSON.stringify(r);
}

export class MockLanguageModel implements LanguageModel {
  readonly id: string;
  private readonly queue: string[];
  private readonly fixed: string | null;
  /** Number of times {@link complete} has been called (for retry assertions). */
  public calls = 0;
  /** The most recent request, for prompt-construction assertions. */
  public lastRequest: LMRequest | null = null;

  constructor(options: MockLanguageModelOptions = {}) {
    this.id = options.id ?? "mock";
    if (options.responses && options.responses.length > 0) {
      this.queue = options.responses.map(serialize);
      this.fixed = null;
    } else if (options.response !== undefined) {
      this.queue = [];
      this.fixed = serialize(options.response);
    } else {
      this.queue = [];
      this.fixed = JSON.stringify(DEFAULT_LENS);
    }
  }

  complete(request: LMRequest): Promise<LMResponse> {
    this.calls++;
    this.lastRequest = request;
    let text: string;
    if (this.fixed !== null) {
      text = this.fixed;
    } else if (this.queue.length > 1) {
      text = this.queue.shift() as string;
    } else {
      // Last entry repeats once the sequence is exhausted.
      text = this.queue[0] ?? JSON.stringify(DEFAULT_LENS);
    }
    return Promise.resolve({ text });
  }
}

/** A ready-made valid lens result, handy for fixtures. */
export const defaultLensResult: LensResult = DEFAULT_LENS;
