import { readCases, validateState } from "./validate.ts";
import { buildGoldState, goldCaseFromJson, toEvalCaseInput } from "./gold.ts";
import { scoreRun, type FinalStateInput } from "./scorer.ts";

// Executes the gold (oracle) trajectory for every committed case and asserts
// that the deterministic scorer rates it as complete correction propagation.
// This is ABC check T.9: an automatic oracle solver demonstrating that each
// task configuration is correct and solvable. Run with `bun run gold`.
const path = (relative: string) => new URL(`../${relative}`, import.meta.url).pathname;

const cases = readCases(path("data/development.jsonl"));
const problems: string[] = [];

for (const evalCase of cases) {
  const goldCase = goldCaseFromJson(evalCase);
  for (const condition of ["A", "B", "C"] as const) {
    const label = `${evalCase.id} condition ${condition}`;
    let state: FinalStateInput;
    try {
      state = buildGoldState(goldCase, condition);
    } catch (error) {
      problems.push(`${label}: gold builder failed: ${(error as Error).message}`);
      continue;
    }
    for (const error of validateState(state)) problems.push(`${label}: gold state invalid: ${error}`);
    const score = scoreRun(toEvalCaseInput(goldCase), state);
    if (score.primary.unsafePersistence) {
      problems.push(`${label}: gold state scored as unsafe persistence`);
    }
    if (!score.primary.completeCorrectionPropagation) {
      problems.push(`${label}: gold state did not achieve complete propagation`);
    }
    if (!score.primary.successfulRecoveryWithinTurnBudget) {
      problems.push(`${label}: gold state did not achieve successful recovery`);
    }
    if (condition !== "A" && score.auditTrail.complete !== true) {
      problems.push(`${label}: gold audit trail not complete`);
    }
  }
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`${cases.length} case(s) gold-reachable under conditions A, B, and C.`);
