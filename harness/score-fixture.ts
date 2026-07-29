import { readFileSync } from "node:fs";
import { scoreRun } from "./scorer.ts";

const [casePath, statePath] = Bun.argv.slice(2);

if (!casePath || !statePath) {
  console.error("Usage: bun run score-fixture.ts <development.jsonl> <final-state.json>");
  process.exit(1);
}

const finalState = JSON.parse(readFileSync(statePath, "utf8"));
const evalCases = readFileSync(casePath, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const evalCase = evalCases.find((candidate) => candidate.id === finalState.caseId);

if (!evalCase) {
  console.error(`No eval case found for state caseId ${finalState.caseId}.`);
  process.exit(1);
}

console.log(JSON.stringify(scoreRun(evalCase, finalState), null, 2));
