import { readCases } from "./validate.ts";
import type { EvalCase } from "../schemas/types.ts";

/**
 * Prompt-construction contract (ABC T.5).
 *
 * The eval case file bundles the model-visible task with the scoring ground
 * truth. This module defines the *public projection* of a case: the only fields
 * a model may see. Everything the scorer checks — expected transitions,
 * affected/unaffected claims, dependencies, permissible/forbidden actions,
 * severity, authority family — must be absent, or the task is solvable by
 * looking up its own answer.
 *
 * `sourceEvidenceSpans[].purpose` is authoring metadata and frequently states
 * the correct handling (e.g. "must not be blindly propagated"), so it is
 * stripped; only the evidence `excerpt` is shown. `correctionEvent.affectedClaimIds`
 * is stripped for the same reason — the correction's target is the answer.
 */
export const PROMPT_EXCLUDED_FIELDS = [
  "authorityCondition",
  "contentFamily",
  "severityTier",
  "split",
  "evidenceLabels",
  "clinicalValidation",
  "constructionStatus",
  "affectedClaims",
  "unaffectedClaims",
  "affectedClaimIds",
  "artifactDependencies",
  "expectedStateTransition",
  "permissibleActions",
  "forbiddenActions",
  "maxRecourseTurnBudget",
  "purpose",
  "canary",
] as const;

export interface PublicCaseView {
  caseId: string;
  transcriptId: string;
  source: { name: string; license: string; citation: string };
  evidence: Array<{ artifact: string; excerpt: string }>;
  initialState: EvalCase["initialReferenceState"];
  correction: { id: string; source: string; statement: string; timing?: string };
}

/**
 * Projects a committed case down to the fields a model may see. This is the
 * function the (planned) prompt builder must call; nothing else may read the
 * case into a prompt directly.
 */
export function publicCaseView(evalCase: EvalCase): PublicCaseView {
  const spans = evalCase.sourceEvidenceSpans ?? [];
  return {
    caseId: evalCase.id,
    transcriptId: evalCase.transcriptId,
    source: {
      name: evalCase.sourceDataset?.name ?? "",
      license: evalCase.sourceDataset?.license ?? "",
      citation: evalCase.sourceDataset?.citation ?? "",
    },
    evidence: spans.map((span) => ({ artifact: span.artifact, excerpt: span.excerpt })),
    initialState: evalCase.initialReferenceState,
    correction: {
      id: evalCase.correctionEvent?.id,
      source: evalCase.correctionEvent?.source,
      statement: evalCase.correctionEvent?.statement,
      ...(evalCase.correctionEvent?.timing ? { timing: evalCase.correctionEvent.timing } : {}),
    },
  };
}

/** Collects every object key in a value, recursively and including arrays. */
export function collectKeys(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, found);
  } else if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      found.push(key);
      collectKeys(child, found);
    }
  }
  return found;
}

/** Returns the excluded-field keys present anywhere in a projected view. */
export function findExcludedKeys(
  view: unknown,
  forbidden: readonly string[] = PROMPT_EXCLUDED_FIELDS
): string[] {
  const present = new Set(collectKeys(view));
  return forbidden.filter((field) => present.has(field));
}

/**
 * Language that states the *handling* rather than the correction. An
 * incoming correction may legitimately ask for review, but a statement that
 * spells out the correct recovery ("must not", "requires review rather than
 * silent rejection") hands the model the answer. Advisory, not fatal.
 */
export const STATEMENT_HANDLING_TERMS = [
  "must not",
  "should not",
  "do not ",
  "rather than",
  "requires review",
  "automatic retraction",
  "silent rejection",
  "blindly",
] as const;

export function flagCorrectionStatement(statement: string): string[] {
  const lower = statement.toLowerCase();
  return STATEMENT_HANDLING_TERMS.filter((term) => lower.includes(term));
}

export interface PromptAuditRecord {
  caseId: string;
  excludedKeysFound: string[];
  statementHandlingTerms: string[];
}

/** Audits every committed case's public projection for ground-truth leakage. */
export function auditPromptLeakage(cases: EvalCase[]): PromptAuditRecord[] {
  return cases.map((evalCase) => ({
    caseId: evalCase.id,
    excludedKeysFound: findExcludedKeys(publicCaseView(evalCase)),
    statementHandlingTerms: flagCorrectionStatement(evalCase.correctionEvent?.statement ?? ""),
  }));
}

if (import.meta.main) {
  const root = new URL("../", import.meta.url).pathname;
  const records = auditPromptLeakage(readCases(`${root}data/development.jsonl`));
  let hardFailures = 0;
  for (const record of records) {
    if (record.excludedKeysFound.length > 0) {
      hardFailures += 1;
      console.error(`${record.caseId}: leaked scoring fields in prompt view: ${record.excludedKeysFound.join(", ")}`);
    }
    if (record.statementHandlingTerms.length > 0) {
      console.warn(
        `${record.caseId}: correction statement states the handling (${record.statementHandlingTerms.join(", ")}); ` +
          "the model should infer recovery, not be told it."
      );
    }
  }
  if (hardFailures > 0) process.exit(1);
  console.log(
    `${records.length} case(s) audited; no scoring fields leak into the prompt view. ` +
      "Statement warnings are advisory (case-authoring cleanup)."
  );
}
