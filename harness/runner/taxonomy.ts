import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { readCases } from "../validate.ts";
import { readTrajectories } from "./report.ts";
import { renderFailureTaxonomy } from "./learning.ts";

// Aggregates failure modes from a saved pilot run. Usage:
//   bun run taxonomy <results/dev-pilot/<timestamp>>
const [dir] = Bun.argv.slice(2);
if (!dir) {
  console.error("Usage: bun run taxonomy <results/dev-pilot/<timestamp>>");
  process.exit(1);
}

const root = new URL("../../", import.meta.url).pathname;
const records = readTrajectories(join(root, dir, "trajectories.jsonl"));
const cases = readCases(join(root, "data/development.jsonl"));
const models = [...new Set(records.map((record) => record.model))];

const markdown = renderFailureTaxonomy(records, models, cases.map((c) => c.id));
const outPath = join(root, dir, "failure-taxonomy.md");
writeFileSync(outPath, markdown + "\n");
console.log(markdown);
console.log(`\nWrote ${outPath}`);