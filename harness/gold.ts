import type {
  ClaimStatus,
  EvalCaseInput,
  FinalStateInput,
} from "./scorer.ts";

/**
 * Gold-case inputs: the fields the oracle needs beyond what the scorer uses.
 * gold-all.ts converts committed JSON cases into this shape.
 */
export interface GoldClaim {
  id: string;
  text: string;
  evidenceIds: string[];
}

export interface GoldCase {
  id: string;
  authorityCondition: string;
  correctionEvent: {
    id: string;
    statement: string;
    source: string;
    affectedClaimIds: string[];
  };
  initialClaims: GoldClaim[];
  downstreamTaskDescription: string;
  affectedClaims: string[];
  unaffectedClaims: string[];
  artifactDependencies: EvalCaseInput["artifactDependencies"];
  expectedStateTransition: EvalCaseInput["expectedStateTransition"];
  expectedDisputeStatus?: "open" | "under_review" | "resolved";
  maxRecourseTurnBudget: number;
}

/** Builds a GoldCase from a committed JSON case, as read by `readCases`. */
export function goldCaseFromJson(evalCase: Record<string, any>): GoldCase {
  return {
    id: evalCase.id,
    authorityCondition: evalCase.authorityCondition,
    correctionEvent: {
      id: evalCase.correctionEvent.id,
      statement: evalCase.correctionEvent.statement,
      source: evalCase.correctionEvent.source,
      affectedClaimIds: evalCase.correctionEvent.affectedClaimIds,
    },
    initialClaims: evalCase.initialReferenceState.claims.map((claim: Record<string, any>) => ({
      id: claim.id,
      text: claim.text,
      evidenceIds: claim.evidenceIds,
    })),
    downstreamTaskDescription: evalCase.initialReferenceState.downstreamTask.description,
    affectedClaims: evalCase.affectedClaims,
    unaffectedClaims: evalCase.unaffectedClaims,
    artifactDependencies: evalCase.artifactDependencies,
    expectedStateTransition: evalCase.expectedStateTransition,
    expectedDisputeStatus: evalCase.expectedDisputeStatus,
    maxRecourseTurnBudget: evalCase.maxRecourseTurnBudget,
  };
}

/**
 * Deterministic oracle solver. It applies exactly what the case's expected
 * state transition declares and produces the final state that the scorer
 * should rate as complete correction propagation. This is ABC check T.9: an
 * automatic oracle solver demonstrating that the task configuration is
 * correct and that a competent system can actually reach the expected state.
 * `bun run gold` executes it for every committed case and asserts the score.
 */
export function buildGoldState(goldCase: GoldCase, condition: "A" | "B" | "C"): FinalStateInput {
  const correctionId = goldCase.correctionEvent.id;
  const initialById = new Map(goldCase.initialClaims.map((claim) => [claim.id, claim]));
  const transitionBy = new Map(
    goldCase.expectedStateTransition.claimTransitions.map((transition) => [
      transition.claimId,
      transition,
    ])
  );
  const newClaimIds = goldCase.expectedStateTransition.claimTransitions
    .filter((transition) => !initialById.has(transition.claimId))
    .map((transition) => transition.claimId);
  const replacedInitialIds = goldCase.expectedStateTransition.claimTransitions
    .filter(
      (transition) =>
        initialById.has(transition.claimId) &&
        (transition.status === "retracted" || transition.status === "replaced")
    )
    .map((transition) => transition.claimId);

  // When a correction introduces replacement claims, link each retracted or
  // replaced initial claim to the replacement in declaration order.
  const replacementIdFor = (claimId: string) => {
    if (newClaimIds.length === 0) return undefined;
    const index = replacedInitialIds.indexOf(claimId);
    return index >= 0 && index < newClaimIds.length ? newClaimIds[index] : undefined;
  };

  const claims: FinalStateInput["currentRecord"]["claims"] = [];
  for (const initial of goldCase.initialClaims) {
    const transition = transitionBy.get(initial.id);
    let status: ClaimStatus = "active";
    const evidenceIds = [...initial.evidenceIds];
    let replacementId: string | undefined;
    if (transition) {
      status = transition.status;
      if (status === "retracted" || status === "replaced") {
        replacementId = replacementIdFor(initial.id);
        // A retracted or replaced claim with no replacement must itself carry
        // the correction in provenance; with a replacement, the replacement does.
        if (!replacementId) evidenceIds.push(correctionId);
      } else if (status === "disputed") {
        evidenceIds.push(correctionId);
      }
    }
    claims.push({
      id: initial.id,
      text: initial.text,
      evidenceIds,
      status,
      ...(replacementId ? { replacementId } : {}),
    });
  }
  for (const claimId of newClaimIds) {
    const transition = transitionBy.get(claimId);
    claims.push({
      id: claimId,
      text: goldCase.correctionEvent.statement,
      evidenceIds: [correctionId],
      status: transition?.status ?? "active",
    });
  }

  const statusById = new Map(claims.map((claim) => [claim.id, claim.status]));
  const isActive = (claimId: string) => statusById.get(claimId) === "active";
  const dependencyOf = (artifact: string) =>
    goldCase.artifactDependencies.find((dependency) => dependency.artifact === artifact)
      ?.dependsOnClaimIds ?? [];
  const unique = (ids: string[]) => [...new Set(ids)];

  // Artifacts cite the claims they depend on that are still active, plus any
  // new active replacement claims. Contradicted claims are removed.
  const activeNewIds = newClaimIds.filter(isActive);
  const clinicalDraftNoteClaimIds = unique([
    ...dependencyOf("clinicalDraftNote").filter(isActive),
    ...activeNewIds,
  ]);
  const patientFacingSummaryClaimIds = unique([
    ...dependencyOf("patientFacingSummary").filter(isActive),
    ...activeNewIds,
  ]);

  // The explicit, clinician-adjudicated expectation wins; the inference is the
  // documented fallback for cases that do not declare one.
  const keepOpen = expectedDisputeStatusFor(goldCase) !== "resolved";

  const requiredAuditEventTypes = goldCase.expectedStateTransition.requiredAuditEventTypes ?? [];
  const auditLog: FinalStateInput["auditLog"] =
    condition === "A"
      ? []
      : requiredAuditEventTypes.map((eventType, index) => ({
          id: `gold-audit-${index}`,
          timestamp: "2026-01-01T00:00:00.000Z",
          eventType,
          actor: "oracle",
          claimIds: goldCase.affectedClaims,
          details: {},
        }));

  return {
    caseId: goldCase.id,
    condition,
    turn: 1,
    correctionAcknowledged: true,
    evidenceEvents: [
      {
        id: correctionId,
        timestamp: "2026-01-01T00:00:00.000Z",
        source: goldCase.correctionEvent.source,
        statement: goldCase.correctionEvent.statement,
        immutable: true,
      },
    ],
    currentRecord: { claims },
    clinicalDraftNote: {
      text: `Gold expected state for ${goldCase.id}.`,
      claimIds: clinicalDraftNoteClaimIds,
    },
    patientFacingSummary: {
      text: `Gold expected state for ${goldCase.id}.`,
      claimIds: patientFacingSummaryClaimIds,
    },
    downstreamTask: {
      id: `gold-task-${goldCase.id}`,
      description: goldCase.downstreamTaskDescription,
      status: goldCase.expectedStateTransition.downstreamTaskStatus,
      derivedFromClaimIds: dependencyOf("downstreamTask"),
    },
    actionStatus: goldCase.expectedStateTransition.actionStatus,
    dispute: keepOpen
      ? { status: "under_review", resolutionEvidenceIds: [] }
      : { status: "resolved", resolutionEvidenceIds: [correctionId] },
    humanCorrectionRepetitions: 0,
    auditLog,
  };
}

/** The scorer input for a gold case. */
export function toEvalCaseInput(goldCase: GoldCase): EvalCaseInput {
  return {
    id: goldCase.id,
    correctionEvent: {
      id: goldCase.correctionEvent.id,
      affectedClaimIds: goldCase.correctionEvent.affectedClaimIds,
    },
    affectedClaims: goldCase.affectedClaims,
    unaffectedClaims: goldCase.unaffectedClaims,
    initialClaimIds: goldCase.initialClaims.map((claim) => claim.id),
    artifactDependencies: goldCase.artifactDependencies,
    expectedStateTransition: goldCase.expectedStateTransition,
    expectedDisputeStatus: expectedDisputeStatusFor(goldCase),
    maxRecourseTurnBudget: goldCase.maxRecourseTurnBudget,
  };
}

/**
 * The dispute status the scorer will enforce: the case's explicit adjudication,
 * or the documented inference (any disputed transition, a negative control, or
 * a patient dispute keeps the dispute open for review).
 */
export function expectedDisputeStatusFor(
  goldCase: GoldCase
): "open" | "under_review" | "resolved" {
  if (goldCase.expectedDisputeStatus !== undefined) return goldCase.expectedDisputeStatus;
  const anyDisputed = goldCase.expectedStateTransition.claimTransitions.some(
    (transition) => transition.status === "disputed"
  );
  return anyDisputed || goldCase.affectedClaims.length === 0 || goldCase.authorityCondition === "patient_dispute"
    ? "under_review"
    : "resolved";
}