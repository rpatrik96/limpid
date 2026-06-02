/**
 * @coach/extract-core — the format-agnostic core shared by @coach/latex and
 * @coach/markdown. A concrete extractor supplies preprocessed lines, section
 * markers, and a per-line `transformInline`; this package owns the rest:
 *
 *   - {@link assembleExtraction} — join cleaned lines, collapse blanks, record a
 *     coarse monotonic source map, compute section ranges + proseRatio.
 *   - {@link classifyTitle} — heading title → SectionKind.
 *   - {@link locateSpanInSource} — extracted-prose span → raw-source range.
 *
 * Pure: no `vscode`, no network, no `fs`.
 */
export { classifyTitle } from "./classifyTitle.js";
export { locateSpanInSource } from "./locate.js";
export {
  assembleExtraction,
  nonSpaceChars,
  type SourceLine,
  type SectionMarker,
} from "./assemble.js";
export type { SourceSection } from "./sourceSection.js";
