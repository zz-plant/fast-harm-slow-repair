import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readCases, validateCase, validateState } from "./validate.ts";

// Validates every committed case and fixture. Run with `bun run validate`.
const path = (relative: string) => fileURLToPath(new URL(`../${relative}`, import.meta.url));
const problems: string[] = [];

const cases = readCases(path("data/development.jsonl"));
const seen = new Set<string>();
for (const evalCase of cases) {
  const label = `data/development.jsonl ${evalCase.id ?? "(no id)"}`;
  for (const error of validateCase(evalCase)) problems.push(`${label}: ${error}`);
  if (evalCase.split !== "development") problems.push(`${label}: split is ${evalCase.split}`);
  if (seen.has(evalCase.id)) problems.push(`${label}: duplicate case id`);
  seen.add(evalCase.id);
}

const fixtureDir = "harness/fixtures";
const fixtures = readdirSync(path(fixtureDir)).filter((name) => name.endsWith(".json"));
for (const name of fixtures) {
  const label = `${fixtureDir}/${name}`;
  const state = JSON.parse(readFileSync(path(label), "utf8"));
  for (const error of validateState(state)) problems.push(`${label}: ${error}`);
  if (!seen.has(state.caseId)) problems.push(`${label}: caseId ${state.caseId} matches no case`);
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`${cases.length} case(s) and ${fixtures.length} fixture(s) valid.`);
