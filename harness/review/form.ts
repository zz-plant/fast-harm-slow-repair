import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { caseSchema } from "../../schemas/types.ts";

/**
 * The clinician review form (protocol §6): its value sets, its type, and its
 * validator. One form holds one reviewer's answers for one case.
 *
 * Every value set is read from the case schema, so the form uses exactly the
 * categories a case already uses and a reviewer's Part 1 answers can later be
 * set beside the author's `expectedStateTransition` field by field.
 * `schema.json` takes the same sets by `$ref`; `validateReviewForm` adds the
 * rules a schema cannot express.
 */
export const REVIEW_FORM_VERSION = 1;

const caseProperties = caseSchema.properties;
export const CLAIM_STATUSES =
  caseProperties.initialReferenceState.properties.claims.items.properties.status.enum;
export const ARTIFACTS = caseProperties.artifactDependencies.items.properties.artifact.enum;
export const TASK_STATUSES =
  caseProperties.expectedStateTransition.properties.downstreamTaskStatus.enum;
export const ACTION_STATUSES = caseProperties.expectedStateTransition.properties.actionStatus.enum;
export const DISPUTE_STATUSES = caseProperties.expectedDisputeStatus.enum;
/** Least to most severe, as the case schema lists them; the weighted κ relies on this order. */
export const SEVERITY_TIERS = caseProperties.severityTier.enum;

export type ClaimStatus = (typeof CLAIM_STATUSES)[number];
export type ArtifactName = (typeof ARTIFACTS)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type ActionStatus = (typeof ACTION_STATUSES)[number];
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];
export type SeverityTier = (typeof SEVERITY_TIERS)[number];

export interface EvidenceCheck {
  matchesEvidence: boolean;
  note: string;
}

export interface ReviewForm {
  formVersion: typeof REVIEW_FORM_VERSION;
  caseId: string;
  sheetSha256: string;
  reviewerInitials: string;
  licenceType: string;
  minutesSpent: number;
  part1: {
    correctionUnambiguous: boolean;
    claimTransitions: Record<string, ClaimStatus>;
    newClaims: Array<{ text: string; replacesClaimId: string | null }>;
    artifactMustChange: Record<ArtifactName, boolean>;
    downstreamTaskStatus: TaskStatus;
    actionStatus: ActionStatus;
    expectedDisputeStatus: DisputeStatus;
    severityTier: SeverityTier;
    notes: string;
  };
  part2: {
    artifactDependencies: Record<ArtifactName, EvidenceCheck>;
    unaffectedClaimListing: Record<string, EvidenceCheck>;
    notes: string;
  };
}

/** A form as `review:sheet` writes it: every answer still `null`. */
export type BlankReviewForm = Unanswered<ReviewForm>;
type Unanswered<T> = {
  [K in keyof T]: T[K] extends string | number | boolean ? T[K] | null : Unanswered<T[K]>;
};

const root = new URL("../../", import.meta.url);
const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, root), "utf8"));

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(readJson("schemas/case.schema.json"));
const reviewSchema = ajv.compile(readJson("harness/review/schema.json"));

/** Paths, written `part1.severityTier`, of every answer left as `null`. */
function unansweredPaths(value: unknown, path = ""): string[] {
  if (value === null) return [path || "(root)"];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => unansweredPaths(item, `${path}[${index}]`));
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      unansweredPaths(child, path ? `${path}.${key}` : key)
    );
  }
  return [];
}

const sameKeys = (a: object, b: object) => {
  const left = Object.keys(a).sort();
  const right = Object.keys(b).sort();
  return left.length === right.length && left.every((key, index) => key === right[index]);
};

/**
 * Checks a filled form. Returns one message per problem; an empty list means
 * the form can be used. A form with unanswered fields is reported by listing
 * them, before any other check, so a reviewer sees what is left to fill in.
 */
export function validateReviewForm(value: unknown): string[] {
  const unanswered = unansweredPaths(value);
  if (unanswered.length > 0) return unanswered.map((path) => `${path} has no answer`);

  if (!reviewSchema(value)) {
    return (reviewSchema.errors ?? []).map((error) => {
      const allowed = error.keyword === "enum" ? `: ${error.params.allowedValues.join(", ")}` : "";
      return `${error.instancePath || "(root)"} ${error.message ?? "is invalid"}${allowed}`;
    });
  }

  const form = value as ReviewForm;
  const errors: string[] = [];
  if (!sameKeys(form.part1.claimTransitions, form.part2.unaffectedClaimListing)) {
    errors.push(
      "part1.claimTransitions and part2.unaffectedClaimListing must name the same claims"
    );
  }
  form.part1.newClaims.forEach((claim, index) => {
    if (claim.replacesClaimId !== null && !(claim.replacesClaimId in form.part1.claimTransitions)) {
      errors.push(
        `part1.newClaims[${index}].replacesClaimId ${claim.replacesClaimId} is not a claim in this case`
      );
    }
  });
  const checks: Array<[string, EvidenceCheck]> = [
    ...Object.entries(form.part2.artifactDependencies).map(
      ([name, check]) => [`part2.artifactDependencies.${name}`, check] as [string, EvidenceCheck]
    ),
    ...Object.entries(form.part2.unaffectedClaimListing).map(
      ([name, check]) => [`part2.unaffectedClaimListing.${name}`, check] as [string, EvidenceCheck]
    ),
  ];
  for (const [path, check] of checks) {
    if (!check.matchesEvidence && check.note.trim() === "") {
      errors.push(`${path} is marked as not matching the evidence but has no note saying why`);
    }
  }
  return errors;
}
