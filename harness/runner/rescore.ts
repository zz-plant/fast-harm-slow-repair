import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readCases, validateState } from "../validate.ts";
import { goldCaseFromJson, toEvalCaseInput } from "../gold.ts";
import { scoreRun } from "../scorer.ts";
import {
  renderPerModelTable,
  renderSummary,
  unevaluableScore,
  type TrajectoryRecordOut,
} from "./report.ts";

/**
 * Offline re-score: applies the current scorer to a saved pilot run's
 * extracted states, with no model calls. Scoring-rule changes (or the
 * preregistered sensitivity analyses over alternative rules) can be measured
 * against the same raw outputs without re-running anything.
 *
 * Usage: bun run rescore <results/dev-pilot/<timestamp>> [cases.jsonl]
 * Writes to <dir>-rescored/ with re-scored trajectories and a fresh summary.
 */

const [dir, casesPath = "data/development.jsonl"] = Bun.argv.slice(2);
if (!dir) {
  console.error("Usage: bun run rescore <results/dev-pilot/<timestamp>> [cases.jsonl]");
  process.exit(1);
}

const root = new URL("../../", import.meta.url).pathname;
const recordsPath = join(root, dir, "trajectories.jsonl");

let rawRecords: Array<TrajectoryRecordOut & { promptText?: string }>;
try {
  rawRecords = readFileSync(recordsPath, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
} catch {
  console.error(`Cannot read ${recordsPath}`);
  process.exit(1);
}

const cases = readCases(join(root, casesPath));
const caseBy = new Map(cases.map((evalCase) => [evalCase.id, goldCaseFromJson(evalCase)]));

let rescores = 0;
const records: TrajectoryRecordOut[] = rawRecords.map((record) => {
  if (!record.extraction.ok || record.extractedState === undefined) return record;
  const goldCase = caseBy.get(record.caseId);
  if (!goldCase) return record;
  const errors = validateState(record.extractedState as Record<string, any>);
  if (errors.length > 0) {
    rescores += 1;
    return {
      ...record,
      extraction: { ok: false, reason: `re-score: state no longer valid: ${errors.join("; ")}`, notes: record.extraction.notes },
      score: unevaluableScore(record.caseId, record.condition, "extracted state invalid on re-score", "extraction_failure"),
    };
  }
  rescores += 1;
  return {
    ...record,
    score: scoreRun(toEvalCaseInput(goldCase), record.extractedState as never),
  };
});

const runs = Math.max(...records.map((r) => r.runIndex)) + 1;
const first = records[0]!;
const settings = {
  promptVariant: first.promptVariant,
  runs,
  temperature: first.settings.temperature,
  extractor: first.settings.extractorModel,
  fallbackExtractor: "",
};
const caseIds = cases.map((evalCase) => evalCase.id as string);

const outDir = join(root, `${dir.replace(/\/$/, "")}-rescored`);
mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, "trajectories.jsonl"),
  records.map((record) => JSON.stringify(record)).join("\n") + "\n"
);
writeFileSync(
  join(outDir, "summary.md"),
  renderSummary(records, settings, new Date(), caseIds)
);

console.log(`Re-scored ${rescores} trajectory record(s) against the current scorer; no model calls.`);
console.log(`Wrote ${join(outDir, "trajectories.jsonl")} and ${join(outDir, "summary.md")}`);
console.log("\n" + renderPerModelTable(records, caseIds, runs));