import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Resolve workspace packages to their TS source so tests run without a build step.
// New packages must be added here (and as workspace deps) to be importable in tests.
const r = (p: string) => resolve(import.meta.dirname, p);

export default defineConfig({
  resolve: {
    alias: {
      "@coach/contract": r("packages/contract/src/index.ts"),
      "@coach/engine": r("packages/engine/src/index.ts"),
      "@coach/latex": r("packages/latex/src/index.ts"),
      "@coach/rubric": r("packages/rubric/src/index.ts"),
      "@coach/providers": r("packages/providers/src/index.ts"),
      "@coach/history": r("packages/history/src/index.ts"),
      "@coach/coach": r("packages/coach/src/index.ts"),
    },
  },
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    environment: "node",
  },
});
