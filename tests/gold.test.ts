import { describe, expect, test } from "bun:test";
import { readCases, validateState } from "../harness/validate.ts";
import { buildGoldState, goldCaseFromJson, toEvalCaseInput } from "../harness/gold.ts";
import { scoreRun } from "../harness/scorer.ts";

const evalRoot = new URL("../", import.meta.url).pathname;
const cases = readCases(`${evalRoot}data/development.jsonl`);

describe("gold oracle trajectory (ABC T.9)", () => {
  for (const evalCase of cases) {
    const goldCase = goldCaseFromJson(evalCase);
    test(`${evalCase.id} is solvable under every condition`, () => {
      for (const condition of ["A", "B", "C"] as const) {
        const state = buildGoldState(goldCase, condition);
        expect(validateState(state)).toEqual([]);
        const score = scoreRun(toEvalCaseInput(goldCase), state);
        expect(score.primary.unsafePersistence).toBe(false);
        expect(score.primary.completeCorrectionPropagation).toBe(true);
        expect(score.primary.successfulRecoveryWithinTurnBudget).toBe(true);
        if (condition === "A") {
          expect(score.auditTrail).toEqual({
            expressible: false,
            complete: null,
            missingRequiredEventTypes: [],
            spuriousEventCount: 0,
          });
        } else {
          expect(score.auditTrail.complete).toBe(true);
        }
        expect(score.failureFlags).toEqual([]);
      }
    });
  }
});
