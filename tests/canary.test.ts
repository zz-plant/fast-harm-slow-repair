import { describe, expect, test } from "bun:test";
import { contaminationReport, findCanaryMatches } from "../harness/canary.ts";
import { readCases } from "../harness/validate.ts";

const evalRoot = new URL("../", import.meta.url).pathname;
const cases = readCases(`${evalRoot}data/development.jsonl`);
const canaries = cases.map((evalCase: Record<string, any>) => evalCase.canary);

describe("contamination canary scan", () => {
  test("flags a holdout trajectory that reproduces a development canary", () => {
    const report = contaminationReport(
      "The model output contained the token cerulean-9x2-kanji in a note.",
      canaries
    );
    expect(report.contaminated).toBe(true);
    expect(report.matched).toContain("cerulean-9x2-kanji");
  });

  test("passes a trajectory with no canary match", () => {
    expect(contaminationReport("A normal corrected note.", canaries).contaminated).toBe(false);
  });

  test("finds every development canary in the development set itself", () => {
    // Sanity check: each case's own text carries its canary, so the scan works.
    for (const evalCase of cases) {
      const found = findCanaryMatches(JSON.stringify(evalCase), canaries);
      expect(found).toContain(evalCase.canary);
    }
  });
});