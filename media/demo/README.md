# Demo assets

How to (re)generate the recordings and renders used in the project README. Run
everything from the repo root.

## Files

| File | What it is | How it's made |
| --- | --- | --- |
| `sample.tex` | A short LaTeX `Introduction` with deliberate problems (buried lede, hedging, passive voice, filler, an undefined acronym) so the coach has plenty to flag. | Hand-written. |
| `cli.tape` | [VHS](https://github.com/charmbracelet/vhs) script that records the CLI GIF. | Source for `cli-demo.gif`. |
| `cli-demo.gif` | Terminal recording of the `limpid` CLI: a report, then a gated run that fails. | `vhs cli.tape` (see below). |
| `webview.html` | A real render of the in-editor panel from the shipped pure renderer. | `render-webview.mjs`. |
| `webview.png` | Screenshot of `webview.html` at sidebar width. | `render-webview.mjs` (needs Playwright). |

## CLI GIF

```bash
npm run build -w apps/cli        # produces apps/cli/dist/cli.js
vhs media/demo/cli.tape          # writes media/demo/cli-demo.gif
```

The tape runs two commands against `sample.tex`: a plain report, then a CI gate
(`--max-passive 0.2 --min-grade A`) that prints `FAIL` and exits non-zero. About
12–15 seconds total.

## Webview render

```bash
node scripts/render-webview.mjs
```

This bundles `apps/extension/src/render.ts` (the same pure renderer the extension
ships) with esbuild, feeds it a fixture `CoachReport`, and writes
`media/demo/webview.html`. Rendering from the real renderer keeps the demo from
drifting out of sync with the shipped panel.

For the PNG, install Playwright first; the script screenshots a 460×900
(sidebar-width) viewport and skips the screenshot with a notice if Playwright is
absent:

```bash
npm i -D playwright && npx playwright install chromium
node scripts/render-webview.mjs   # now also writes media/demo/webview.png
```

## Live in-editor GIF (manual)

The animated capture of Limpid working inside VS Code is recorded by hand, since
it shows real editor interaction:

1. Open `media/demo/sample.tex` in VS Code with the Limpid extension installed
   (`npm run build -w apps/extension`, then run the Extension Development Host, or
   install the packaged `.vsix`).
2. Open the **Coach** view in the Activity Bar.
3. Select the introduction (or select nothing to coach the whole file) and run
   **Limpid: Coach** (`⌘⌥L` / `Ctrl+Alt+L`).
4. Screen-record the sidebar as it scores the section, highlights spans, and
   shows the coach cards (grade, dimensions, the Buried Lede card with
   before/after). Click a finding's **reveal** to jump to its span in the editor.
5. Trim to ~10 s and export as a GIF.
