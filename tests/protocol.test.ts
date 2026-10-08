import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const evalRoot = new URL("..", import.meta.url).pathname;
const read = (path: string) => readFileSync(join(evalRoot, path), "utf8");

describe("fast-harm-slow-repair eval protocol", () => {
  test("preregistration is valid JSON", () => {
    const json = read("preregistration.json");
    const parsed = JSON.parse(json);
    expect(parsed.claim.primary).not.toBeFalsy();
    expect(parsed.dataset.source).toBe("ACI-BENCH");
  });

  test("public status matches the unfrozen preregistration and partial dataset", () => {
    const preregistration = JSON.parse(read("preregistration.json"));
    const readme = read("README.md");

    expect(preregistration.preregisteredAt).toBeNull();
    expect(readme).toContain("Draft protocol");
    expect(readme).not.toContain("Preregistered comparative evaluation");
  });

  test("every document states the development-case count the data holds", () => {
    // Counted from the data, so adding a case fails here until the prose
    // that reports progress is updated with it.
    const authored = read("data/development.jsonl").split("\n").filter(Boolean).length;
    const target = JSON.parse(read("preregistration.json")).dataset.developmentCount;
    const caseWord = authored === 1 ? "case" : "cases";

    expect(read("README.md")).toContain(`Current development cases: **${authored} of ${target}**`);
    expect(read("README.md")).toContain(`${authored} development ${caseWord}; holdout empty`);
    expect(read("data/README.md")).toContain(`| ${authored} of ${target} `);
    expect(read("protocol.md")).toContain(`currently authored: ${authored};`);
  });

  test("schemas are valid JSON", () => {
    const state = JSON.parse(read("schemas/state.schema.json"));
    const caseSchema = JSON.parse(read("schemas/case.schema.json"));
    const host = "https://raw.githubusercontent.com/zz-plant/fast-harm-slow-repair/main/schemas/";
    expect(state.$id).toBe(`${host}state.schema.json`);
    expect(caseSchema.$id).toBe(`${host}case.schema.json`);
  });

  test("schemas expose every field required by deterministic scoring", () => {
    const state = JSON.parse(read("schemas/state.schema.json"));
    const caseSchema = JSON.parse(read("schemas/case.schema.json"));

    expect(caseSchema.properties.correctionEvent.required).toContain("id");
    expect(caseSchema.properties.expectedStateTransition.required).toContain("claimTransitions");
    expect(caseSchema.required).toContain("sourceDataset");
    expect(caseSchema.required).toContain("sourceEvidenceSpans");
    expect(caseSchema.required).toContain("clinicalValidation");
    expect(caseSchema.required).toContain("evidenceLabels");
    expect(caseSchema.required).toContain("unaffectedClaims");
    expect(state.required).toContain("dispute");
    expect(state.required).toContain("humanCorrectionRepetitions");
    expect(state.required).toContain("correctionAcknowledged");
    expect(state.properties.downstreamTask.required).toContain("derivedFromClaimIds");
  });

  test("holdout manifest is valid and sealed cases are hidden", () => {
    const manifest = JSON.parse(read("data/holdout-manifest.json"));
    expect(manifest.caseCount).toBe(36);
    expect(manifest.sealedAt).toBeNull();
    expect(manifest.cases).toHaveLength(0);
  });

  test("development cases are attributable and cannot be mistaken for model evidence", () => {
    const cases = read("data/development.jsonl")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    expect(cases.length).toBeGreaterThan(0);
    for (const evalCase of cases) {
      expect(evalCase.sourceDataset.name).toBe("ACI-BENCH");
      expect(evalCase.sourceEvidenceSpans.length).toBeGreaterThan(0);
      expect(evalCase.clinicalValidation.status).toBe("not_reviewed");
      expect(evalCase.evidenceLabels).toContain("not_model_performance_evidence");
      expect(evalCase.canary).toBeTruthy();
    }
  });

  test("publishes inspectable recovered and unsafe-persistence development fixtures", () => {
    for (const name of [
      "dev-001-recovered.json",
      "dev-001-recovered-A.json",
      "dev-001-unsafe-persistence.json",
      "dev-002-recovered.json",
      "dev-002-overcorrection.json",
      "dev-003-recovered.json",
      "dev-003-blindly-propagated.json",
    ]) {
      expect(existsSync(join(evalRoot, `harness/fixtures/${name}`))).toBe(true);
    }
  });
});
