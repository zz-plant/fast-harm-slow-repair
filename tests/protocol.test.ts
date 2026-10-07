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
    expect(readme).toContain("Current development cases: **1 of 12**");
  });

  test("schemas are valid JSON", () => {
    const state = JSON.parse(read("schemas/state.schema.json"));
    const caseSchema = JSON.parse(read("schemas/case.schema.json"));
    expect(state.$id).toContain("kanav.net");
    expect(caseSchema.$id).toContain("kanav.net");
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
    expect(state.required).toContain("dispute");
    expect(state.required).toContain("humanCorrectionRepetitions");
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

    expect(cases).toHaveLength(1);
    expect(cases[0].sourceDataset.name).toBe("ACI-BENCH");
    expect(cases[0].sourceDataset.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(cases[0].sourceEvidenceSpans.length).toBeGreaterThan(0);
    expect(cases[0].clinicalValidation.status).toBe("not_reviewed");
    expect(cases[0].evidenceLabels).toContain("not_model_performance_evidence");
  });

  test("publishes inspectable recovered and unsafe-persistence development fixtures", () => {
    expect(existsSync(join(evalRoot, "harness/fixtures/dev-001-recovered.json"))).toBe(true);
    expect(existsSync(join(evalRoot, "harness/fixtures/dev-001-unsafe-persistence.json"))).toBe(
      true
    );
  });
});
