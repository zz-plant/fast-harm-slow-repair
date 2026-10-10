import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { readCases } from "../validate.ts";
import { readTrajectories } from "./report.ts";
import { renderStateDiff } from "./learning.ts";

// Differential profile: where two models differ on each case, from their
// extracted states. Usage:
//   bun run diff <results/dev-pilot/<timestamp>> <modelA> <modelB>
const [dir, modelA, modelB] = Bun.argv.slice(2);
if (!dir || !modelA || !modelB) {
  console.error("Usage: bun run diff <results/dev-pilot/<timestamp>> <modelA> <modelB>");
  process.exit(1);
}

const root = new URL("../../", import.meta.url).pathname;
const records = readTrajectories(join(root, dir, "trajectories.jsonl"));
const cases = readCases(join(root, "data/development.jsonl"));

const lines = [`# ${modelA} vs ${modelB}`, ""];
for (const evalCase of cases) {
  const a = records.find((r) => r.model === modelA && r.caseId === evalCase.id && r.runIndex === 0);
  const b = records.find((r) => r.model === modelB && r.caseId === evalCase.id && r.runIndex === 0);
  if (!a || !b) continue;
  lines.push(renderStateDiff(evalCase.id, a, b), "");
}

const outName = `diff-${sanitize(modelA)}-vs-${sanitize(modelB)}.md`;
const outPath = join(root, dir, outName);
writeFileSync(outPath, lines.join("\n"));
console.log(lines.join("\n"));
console.log(`\nWrote ${outPath}`);

function sanitize(model: string): string {
  return model.replace(/[^a-zA-Z0-9.-]+/g, "-");
}