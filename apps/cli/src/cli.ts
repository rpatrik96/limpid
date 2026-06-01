/**
 * limpid CLI entry. Reads files, scores each through the deterministic pipeline,
 * prints a per-file line (or JSON), and exits non-zero if any threshold is
 * violated or a file can't be read — so it works as a CI / pre-commit gate.
 *
 * Usage: limpid [--json] [--max-passive f] [--max-fk n] [--max-filler n] [--min-grade G] <file...>
 */
import { readFileSync } from "node:fs";

import { type FileResult, checkText, formatResults, parseArgs } from "./run.js";

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.files.length === 0) {
    process.stderr.write(
      "usage: limpid [--json] [--register paper|blog|grant|sop] [--max-passive f] [--max-fk n] [--max-filler n] [--min-grade G] <file...>\n",
    );
    process.exit(2);
  }

  const results: FileResult[] = [];
  let readError = false;

  for (const file of opts.files) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch (e) {
      readError = true;
      process.stderr.write(
        `limpid: cannot read ${file}: ${e instanceof Error ? e.message : String(e)}\n`,
      );
      continue;
    }
    results.push(await checkText(text, file, opts.thresholds, opts.register));
  }

  process.stdout.write(formatResults(results, opts.json) + "\n");
  const failed = readError || results.some((r) => r.failed);
  process.exit(failed ? 1 : 0);
}

void main();
