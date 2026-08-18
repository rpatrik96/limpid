/**
 * limpid CLI entry. Reads files, scores each through the deterministic pipeline,
 * prints a per-file line (or JSON), and exits non-zero if any threshold is
 * violated or a file can't be read — so it works as a CI / pre-commit gate.
 *
 * Usage: limpid [--json] [--max-passive f] [--max-fk n] [--max-filler n] [--min-grade G] <file...>
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { type FileResult, checkText, formatResults, parseArgs, rubricFor } from "./run.js";

/**
 * Nearest `.limpid/rules.json`, walking up from `start` to the filesystem root.
 *
 * Discovery is per-file rather than per-invocation so that gating files from two
 * workspaces in one command applies each workspace's own house rules, which is
 * what a pre-commit hook over a monorepo actually needs.
 */
function findRulesFile(start: string): string | undefined {
  let dir = resolve(start);
  for (;;) {
    const candidate = join(dir, ".limpid", "rules.json");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** Read + JSON-parse a rules file. A bad file is reported and ignored, never fatal. */
function loadRules(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    process.stderr.write(
      `limpid: ignoring ${path}: ${e instanceof Error ? e.message : String(e)}\n`,
    );
    return undefined;
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.files.length === 0) {
    process.stderr.write(
      "usage: limpid [--json] [--register paper|blog|grant|sop] [--rules path] [--no-user-rules]\n" +
        "              [--max-passive f] [--max-fk n] [--max-filler n] [--min-grade G] <file...>\n",
    );
    process.exit(2);
  }

  // Cache per rules-file path: a run over a hundred files in one vault reads and
  // validates the house rules once.
  const rulesCache = new Map<string, unknown>();
  const reported = new Set<string>();

  function rulesForFile(file: string): unknown {
    if (opts.noUserRules) return undefined;
    const path = opts.rulesPath ?? findRulesFile(dirname(resolve(file)));
    if (!path) return undefined;
    if (!rulesCache.has(path)) {
      const json = loadRules(path);
      rulesCache.set(path, json);
      if (json !== undefined && !reported.has(path)) {
        reported.add(path);
        const { ruleCount, errors } = rubricFor(opts.register, json);
        for (const err of errors) process.stderr.write(`limpid: ${path}: ${err}\n`);
        if (ruleCount > 0 && !opts.json) {
          process.stderr.write(`limpid: ${ruleCount} house rule(s) from ${path}\n`);
        }
      }
    }
    return rulesCache.get(path);
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
    results.push(await checkText(text, file, opts.thresholds, opts.register, rulesForFile(file)));
  }

  process.stdout.write(formatResults(results, opts.json) + "\n");
  const failed = readError || results.some((r) => r.failed);
  process.exit(failed ? 1 : 0);
}

void main();
