import type { GradeBand } from "@coach/contract";

/**
 * A+ … F bands over the weighted 0..10 score. Thresholds and actions track the
 * grade table in `writing-verify.md`. `min` is the inclusive floor; the coach
 * picks the first band whose `min` the score clears, scanning high → low.
 *
 * The action is the recommended next move, not a verdict — it routes the author
 * to the right remediation (ship, one pass, focused revision, rewrite).
 */
export const gradeBands: GradeBand[] = [
  { grade: "A+", min: 9.0, action: "Publication-ready prose — ship it." },
  { grade: "A", min: 8.0, action: "Strong draft — ship it after a light read-through." },
  { grade: "B+", min: 7.0, action: "Good draft — one targeted editing pass on the flagged spots." },
  {
    grade: "B",
    min: 6.5,
    action: "Good draft — one editing pass; clear the top-3 findings first.",
  },
  {
    grade: "B-",
    min: 5.5,
    action: "Noticeable issues — a focused revision of the weakest sections.",
  },
  {
    grade: "C+",
    min: 4.5,
    action: "Noticeable issues — focused revision; run /writing-diagnosis on flagged paragraphs.",
  },
  {
    grade: "C",
    min: 4.0,
    action: "A reviewer will complain about clarity — significant revision before submission.",
  },
  {
    grade: "D",
    min: 3.0,
    action: "Comprehension barriers — major rewrite of the prose, not just edits.",
  },
  {
    grade: "F",
    min: 0.0,
    action: "Not ready for review — restart the prose with the structural patterns in mind.",
  },
];
