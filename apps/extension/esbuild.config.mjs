// esbuild bundle for the VS Code extension.
//
// The extension is the one package that is CommonJS at runtime: VS Code loads
// `main` via Node's CJS require. We bundle the entire @coach core (ESM TS source)
// into a single CJS file, with `vscode` kept external (provided by the host).
import { build } from "esbuild";

const watch = process.argv.includes("--watch");

/** @type {import("esbuild").BuildOptions} */
const options = {
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.cjs",
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node18",
  external: ["vscode"],
  sourcemap: true,
  logLevel: "info",
};

if (watch) {
  const { context } = await import("esbuild");
  const ctx = await context(options);
  await ctx.watch();
  console.log("esbuild: watching…");
} else {
  await build(options);
}
