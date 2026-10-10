import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = new URL("../", import.meta.url);
const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, root), "utf8"));

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const caseSchema = ajv.compile(readJson("schemas/case.schema.json"));
const stateSchema = ajv.compile(readJson("schemas/state.schema.json"));

type Json = Record<string, any>;

function schemaErrors(validate: typeof caseSchema, value: unknown): string[] {
  if (validate(value)) return [];
  return (validate.errors ?? []).map(
    (error) => `${error.instancePath || "(root)"} ${error.message ?? "is invalid"}`
  );
}

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && new Set([...a, ...b]).size === new Set(a).size;

/**
 * Checks an eval case against the case schema and the cross-field rules the
 * scorer relies on but the schema cannot express. Returns one message per
 * problem; an empty list means the case is usable.
 */
export function validateCase(evalCase: Json): string[] {
  const errors = schemaErrors(caseSchema, evalCase);
  if (errors.length > 0) return errors;

  const claimIds = new Set<string>(
    evalCase.initialReferenceState.claims.map((claim: Json) => claim.id)
  );
  const transitions: Json[] = evalCase.expectedStateTransition.claimTransitions;
  const transitionFor = (claimId: string) => transitions.find((t) => t.claimId === claimId);

  if (!sameSet(evalCase.affectedClaims, evalCase.correctionEvent.affectedClaimIds)) {
    errors.push("affectedClaims and correctionEvent.affectedClaimIds name different claims");
  }
  for (const claimId of evalCase.affectedClaims) {
    if (!claimIds.has(claimId)) {
      errors.push(`affected claim ${claimId} is not in initialReferenceState.claims`);
    }
    if (!transitionFor(claimId)) {
      errors.push(`affected claim ${claimId} has no expected claim transition`);
    }
  }
  for (const claimId of evalCase.unaffectedClaims) {
    if (!claimIds.has(claimId)) {
      errors.push(`unaffected claim ${claimId} is not in initialReferenceState.claims`);
    }
    if (evalCase.affectedClaims.includes(claimId)) {
      errors.push(`claim ${claimId} is listed as both affected and unaffected`);
    }
    if (transitionFor(claimId)) {
      errors.push(
        `unaffected claim ${claimId} must stay active but has an expected claim transition`
      );
    }
  }
  // A claim that transitions without being affected must be a replacement claim
  // introduced by the correction: a new claim, not an initial one. Unaffected
  // initial claims must stay active, which is what the scorer enforces.
  for (const transition of transitions) {
    if (!evalCase.affectedClaims.includes(transition.claimId) && claimIds.has(transition.claimId)) {
      errors.push(
        `transitioned claim ${transition.claimId} is an initial claim that is not affected`
      );
    }
  }
  if (evalCase.affectedClaims.length === 0) {
    // Negative control: the correction must not propagate at all.
    if (transitions.length > 0) {
      errors.push("negative control declares claim transitions but has no affected claims");
    }
    if (evalCase.expectedStateTransition.updatedArtifacts.length > 0) {
      errors.push("negative control declares updated artifacts but has no affected claims");
    }
    if (evalCase.expectedStateTransition.retractedClaimIds.length > 0) {
      errors.push("negative control declares retracted claims but has no affected claims");
    }
  }
  for (const dependency of evalCase.artifactDependencies) {
    for (const claimId of dependency.dependsOnClaimIds) {
      if (!claimIds.has(claimId)) {
        errors.push(`${dependency.artifact} depends on ${claimId}, which is not an initial claim`);
      }
    }
  }
  const retracted = transitions.filter((t) => t.status === "retracted").map((t) => t.claimId);
  if (!sameSet(retracted, evalCase.expectedStateTransition.retractedClaimIds)) {
    errors.push("retractedClaimIds does not match the claim transitions with status retracted");
  }
  if (evalCase.split === "development" && !evalCase.canary) {
    errors.push("development case must carry a canary token");
  }
  if (evalCase.correctionEvent.timing === "after_action_started") {
    // Once an action has started, stopping is not a recovery path: the action
    // must be rolled back or escalated for review.
    const permitted = new Set(["rolled_back", "escalated"]);
    if (!permitted.has(evalCase.expectedStateTransition.actionStatus)) {
      errors.push(
        "after_action_started corrections require a rolled_back or escalated expected action status"
      );
    }
  }
  if (evalCase.expectedDisputeStatus === "resolved") {
    const anyDisputed = transitions.some((t: Json) => t.status === "disputed");
    if (anyDisputed) {
      errors.push(
        "expectedDisputeStatus is resolved but the case has a claim transition to disputed; a disputed claim keeps the question under review"
      );
    }
  }
  return errors;
}

/** Checks a final state against the state schema and its internal references. */
export function validateState(state: Json): string[] {
  const errors = schemaErrors(stateSchema, state);
  if (errors.length > 0) return errors;

  const claimIds = new Set<string>(state.currentRecord.claims.map((claim: Json) => claim.id));
  for (const claim of state.currentRecord.claims) {
    if (claim.replacementId && !claimIds.has(claim.replacementId)) {
      errors.push(`claim ${claim.id} names replacement ${claim.replacementId}, which is not in the record`);
    }
  }
  for (const artifact of ["clinicalDraftNote", "patientFacingSummary"] as const) {
    for (const claimId of state[artifact].claimIds) {
      if (!claimIds.has(claimId)) {
        errors.push(`${artifact} cites ${claimId}, which is not in the record`);
      }
    }
  }
  // The action status and the downstream task must agree on whether the
  // dependent action proceeded. A held or pending task with a proceeded action
  // is internally inconsistent and would otherwise let a run that acted on the
  // contradicted claim pass the zero-unsafe-persistence gate.
  const proceededTaskStatuses = new Set(["proceeded", "completed"]);
  if (state.actionStatus === "proceeded" && !proceededTaskStatuses.has(state.downstreamTask.status)) {
    errors.push("actionStatus is proceeded but the downstream task is not proceeded or completed");
  }
  if (proceededTaskStatuses.has(state.downstreamTask.status) && state.actionStatus !== "proceeded") {
    errors.push("downstream task is proceeded or completed but actionStatus is not proceeded");
  }
  return errors;
}

/** Reads a JSONL file of eval cases, one object per non-empty line. */
export function readCases(path: string): Json[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`${path}:${index + 1} is not valid JSON`);
      }
    });
}
