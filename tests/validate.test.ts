import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readCases, validateCase, validateState } from "../harness/validate.ts";

const path = (relative: string) => fileURLToPath(new URL(`../${relative}`, import.meta.url));
const publishedCase = () => readCases(path("data/development.jsonl"))[0]!;
const negativeControl = () => readCases(path("data/development.jsonl"))[1]!;
const recovered = () =>
  JSON.parse(readFileSync(path("harness/fixtures/dev-001-recovered.json"), "utf8"));

describe("case and state validation", () => {
  test("every committed case and fixture is valid", () => {
    const result = Bun.spawnSync(["bun", "run", path("harness/validate-all.ts")]);
    expect(result.stderr.toString()).toBe("");
    expect(result.exitCode).toBe(0);
  });

  test("rejects a case missing a required field", () => {
    const evalCase = publishedCase();
    delete evalCase.severityTier;
    expect(validateCase(evalCase)).toContain("(root) must have required property 'severityTier'");
  });

  test("rejects a case whose two affected-claim lists disagree", () => {
    const evalCase = publishedCase();
    evalCase.correctionEvent.affectedClaimIds = ["claim-something-else"];
    expect(validateCase(evalCase)).toContain(
      "affectedClaims and correctionEvent.affectedClaimIds name different claims"
    );
  });

  test("rejects a case with an affected claim that has no expected transition", () => {
    const evalCase = publishedCase();
    evalCase.expectedStateTransition.claimTransitions = [];
    evalCase.expectedStateTransition.retractedClaimIds = [];
    expect(validateCase(evalCase)).toContain(
      "affected claim claim-lisinopril-40mg has no expected claim transition"
    );
  });

  test("validates the negative-control case and its fixtures", () => {
    const evalCase = negativeControl();
    expect(validateCase(evalCase)).toEqual([]);
    expect(evalCase.affectedClaims).toEqual([]);
    expect(evalCase.unaffectedClaims.length).toBeGreaterThan(0);
    for (const name of ["dev-002-recovered.json", "dev-002-overcorrection.json"]) {
      const state = JSON.parse(
        readFileSync(path(`harness/fixtures/${name}`), "utf8")
      );
      expect(validateState(state)).toEqual([]);
    }
  });

  test("rejects a negative control that declares claim transitions", () => {
    const evalCase = negativeControl();
    evalCase.expectedStateTransition.claimTransitions = [
      { claimId: "claim-pcn-allergy", status: "disputed" },
    ];
    expect(validateCase(evalCase)).toContain(
      "negative control declares claim transitions but has no affected claims"
    );
  });

  test("rejects an unaffected claim that has an expected transition", () => {
    const evalCase = publishedCase();
    evalCase.expectedStateTransition.claimTransitions = [
      ...evalCase.expectedStateTransition.claimTransitions,
      { claimId: "claim-metformin-500", status: "disputed" },
    ];
    expect(validateCase(evalCase)).toContain(
      "unaffected claim claim-metformin-500 must stay active but has an expected claim transition"
    );
  });

  test("rejects an unaffected claim that is not an initial claim", () => {
    const evalCase = publishedCase();
    evalCase.unaffectedClaims = ["claim-invented"];
    expect(validateCase(evalCase)).toContain(
      "unaffected claim claim-invented is not in initialReferenceState.claims"
    );
  });

  test("rejects a state with an out-of-vocabulary task status", () => {
    const state = recovered();
    state.downstreamTask.status = "paused";
    expect(validateState(state)).toContain(
      "/downstreamTask/status must be equal to one of the allowed values"
    );
  });

  test("rejects a state whose patient summary cites a claim the record lacks", () => {
    const state = recovered();
    state.patientFacingSummary.claimIds = ["claim-invented"];
    expect(validateState(state)).toContain(
      "patientFacingSummary cites claim-invented, which is not in the record"
    );
  });

  test("rejects a proceeded action on a held task", () => {
    const state = recovered();
    state.actionStatus = "proceeded";
    expect(validateState(state)).toContain(
      "actionStatus is proceeded but the downstream task is not proceeded or completed"
    );
  });

  test("rejects a task state without provenance", () => {
    const state = recovered();
    delete state.downstreamTask.derivedFromClaimIds;
    expect(validateState(state)).toContain(
      "/downstreamTask must have required property 'derivedFromClaimIds'"
    );
  });

  test("the scoring command refuses an invalid state instead of scoring it", () => {
    const state = recovered();
    delete state.auditLog;
    const dir = mkdtempSync(join(tmpdir(), "fhslr-"));
    const statePath = join(dir, "invalid-state.json");
    writeFileSync(statePath, JSON.stringify(state));
    try {
      const result = Bun.spawnSync([
        "bun",
        "run",
        path("harness/score-fixture.ts"),
        path("data/development.jsonl"),
        statePath,
      ]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain("must have required property 'auditLog'");
      expect(result.stdout.toString()).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
