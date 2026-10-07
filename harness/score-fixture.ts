import { readFileSync } from "node:fs";
import { scoreRun, type EvalCaseInput } from "./scorer.ts";
import { readCases, validateCase, validateState } from "./validate.ts";

const [casePath, statePath] = Bun.argv.slice(2);

if (!casePath || !statePath) {
  console.error("Usage: bun run score <cases.jsonl> <final-state.json>");
  process.exit(1);
}

const finalState = JSON.parse(readFileSync(statePath, "utf8"));
const evalCase = readCases(casePath).find((candidate) => candidate.id === finalState.caseId);

if (!evalCase) {
  console.error(`No eval case found for state caseId ${finalState.caseId}.`);
  process.exit(1);
}

// A malformed input would otherwise score silently, often as a pass on the
// checks that look for something being absent.
const problems = [
  ...validateCase(evalCase).map((error) => `case ${evalCase.id}: ${error}`),
  ...validateState(finalState).map((error) => `${statePath}: ${error}`),
];
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}

// Validated above against the case schema, which is stricter than EvalCaseInput.
console.log(JSON.stringify(scoreRun(evalCase as unknown as EvalCaseInput, finalState), null, 2));
