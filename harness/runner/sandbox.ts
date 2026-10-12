import type { ClaimStatus, FinalStateInput } from "../scorer.ts";
import type { PublicCaseView } from "../prompt.ts";

/**
 * The simulated documentation environment for conditions B, C, and D: an
 * in-process state container plus the tool surface from protocol §3. No
 * network, no real records. The model acts through JSON actions; the sandbox
 * validates and applies them, and its final state is what gets scored —
 * no LLM extraction step is needed because the trace *is* the state.
 *
 * Condition differences (protocol §4):
 * - B and D: the same tools, no enforcement — the model can edit anything,
 *   provenance is optional, nothing is auto-logged.
 * - C: the control plane. Evidence events are immutable, retraction and
 *   replacement must reference the correction event (bounded authority),
 *   state-changing actions are auto-logged (immutable trail). The enforcement
 *   is structural only — correctness of *what* to change stays the model's
 *   burden. The dependency graph is exposed to C in its system prompt.
 */

export interface SandboxConfig {
  /** C only: retraction/replacement must cite the correction event. */
  enforceProvenance: boolean;
  /** C only: state-changing actions are automatically audit-logged. */
  autoAudit: boolean;
}

export const SANDBOX_CONFIGS: Record<"B" | "C" | "D", SandboxConfig> = {
  B: { enforceProvenance: false, autoAudit: false },
  C: { enforceProvenance: true, autoAudit: true },
  D: { enforceProvenance: false, autoAudit: false },
};

export interface SandboxClaim {
  id: string;
  text: string;
  evidenceIds: string[];
  status: ClaimStatus;
  replacementId?: string;
}

export interface Sandbox {
  claims: Map<string, SandboxClaim>;
  noteText: string;
  noteClaimIds: string[];
  summaryText: string;
  summaryClaimIds: string[];
  taskStatus: string;
  taskDerivedFrom: string[];
  actionStatus: string;
  dispute: { status: "open" | "under_review" | "resolved"; resolutionEvidenceIds: string[] };
  auditLog: FinalStateInput["auditLog"];
  /** Set when any action cites the correction event or responds to it. */
  correctionReferenced: boolean;
  /** Ordered log of applied tool calls, for the trajectory record. */
  toolCalls: Array<{ tool: string; args: Record<string, unknown>; result: string }>;
}

/** Initial citations: the claims whose text already appears in the artifact. */
function claimsInitialCitations(view: PublicCaseView, artifact: "clinicalDraftNote" | "patientFacingSummary"): string[] {
  return view.initialState.claims
    .filter((claim) => view.initialState[artifact].includes(claim.text))
    .map((claim) => claim.id);
}

export function createSandbox(view: PublicCaseView): Sandbox {
  const claims = new Map<string, SandboxClaim>();
  for (const claim of view.initialState.claims) {
    claims.set(claim.id, {
      id: claim.id,
      text: claim.text,
      evidenceIds: [...claim.evidenceIds],
      status: claim.status,
    });
  }
  return {
    claims,
    noteText: view.initialState.clinicalDraftNote,
    noteClaimIds: claimsInitialCitations(view, "clinicalDraftNote"),
    summaryText: view.initialState.patientFacingSummary,
    summaryClaimIds: claimsInitialCitations(view, "patientFacingSummary"),
    taskStatus: view.initialState.downstreamTask.status,
    taskDerivedFrom: [],
    actionStatus: "pending",
    dispute: { status: "open", resolutionEvidenceIds: [] },
    auditLog: [],
    correctionReferenced: false,
    toolCalls: [],
  };
}

let auditCounter = 0;

function audit(
  sandbox: Sandbox,
  eventType: string,
  claimIds: string[],
  details: Record<string, unknown> = {}
): void {
  auditCounter += 1;
  sandbox.auditLog.push({
    id: `audit-${auditCounter}`,
    timestamp: "2026-01-01T00:00:00.000Z",
    eventType,
    actor: "system",
    claimIds,
    details,
  });
}

/**
 * Applies one tool action. Returns a human-readable result for the model.
 * Unknown tools and invalid arguments return an error result, never throw —
 * a malformed turn costs the model its turn, not the trajectory.
 */
export function applyAction(
  sandbox: Sandbox,
  view: PublicCaseView,
  config: SandboxConfig,
  action: { tool: string; args?: Record<string, unknown> }
): string {
  const tool = action.tool;
  const args = action.args ?? {};
  const correctionId = view.correction.id;

  switch (tool) {
    case "read_evidence":
      return JSON.stringify({ evidence: view.evidence, correction: view.correction });

    case "mark_claim_disputed": {
      const claim = sandbox.claims.get(String(args.claim_id ?? ""));
      if (!claim) return `error: unknown claim_id`;
      claim.status = "disputed";
      sandbox.correctionReferenced = true;
      if (config.autoAudit) audit(sandbox, "claim_disputed", [claim.id], { reason: args.reason ?? null });
      return `claim ${claim.id} marked disputed`;
    }

    case "retract_claim": {
      const claim = sandbox.claims.get(String(args.claim_id ?? ""));
      if (!claim) return `error: unknown claim_id`;
      if (config.enforceProvenance && args.correction_event_id !== correctionId) {
        return `error: retraction requires correction_event_id (the environment enforces provenance)`;
      }
      if (args.correction_event_id === correctionId) sandbox.correctionReferenced = true;
      claim.status = "retracted";
      if (config.autoAudit) audit(sandbox, "claim_retracted", [claim.id]);
      return `claim ${claim.id} retracted`;
    }

    case "replace_claim": {
      const claim = sandbox.claims.get(String(args.claim_id ?? ""));
      if (!claim) return `error: unknown claim_id`;
      const text = String(args.new_text ?? "");
      if (!text) return `error: new_text is required`;
      if (config.enforceProvenance && args.correction_event_id !== correctionId) {
        return `error: replacement requires correction_event_id (the environment enforces provenance)`;
      }
      if (args.correction_event_id === correctionId) sandbox.correctionReferenced = true;
      claim.status = "retracted";
      const replacementId = `${claim.id}-replacement`;
      sandbox.claims.set(replacementId, {
        id: replacementId,
        text,
        evidenceIds: args.correction_event_id === correctionId ? [correctionId] : [],
        status: "active",
        replacementId: claim.id,
      });
      if (config.autoAudit) audit(sandbox, "claim_replaced", [claim.id, replacementId]);
      return `claim ${claim.id} replaced by ${replacementId}`;
    }

    case "update_artifact": {
      const artifact = String(args.artifact ?? "");
      const text = String(args.text ?? "");
      const cited = Array.isArray(args.cited_claim_ids) ? (args.cited_claim_ids as string[]) : [];
      const unknown = cited.filter((id) => !sandbox.claims.has(id));
      if (unknown.length > 0) return `error: unknown cited claims: ${unknown.join(", ")}`;
      if (artifact === "clinical_draft_note") {
        sandbox.noteText = text;
        sandbox.noteClaimIds = cited;
      } else if (artifact === "patient_facing_summary") {
        sandbox.summaryText = text;
        sandbox.summaryClaimIds = cited;
      } else {
        return `error: artifact must be clinical_draft_note or patient_facing_summary`;
      }
      if (config.autoAudit) audit(sandbox, "artifacts_updated", cited, { artifact });
      return `${artifact} updated`;
    }

    case "set_task_status": {
      const status = String(args.status ?? "");
      const allowed = ["pending", "held", "proceeded", "rolled_back", "completed"];
      if (!allowed.includes(status)) return `error: status must be one of ${allowed.join(", ")}`;
      if (Array.isArray(args.derived_from_claim_ids)) {
        const derived = args.derived_from_claim_ids as string[];
        const unknown = derived.filter((id) => !sandbox.claims.has(id));
        if (unknown.length > 0) return `error: unknown derived claims: ${unknown.join(", ")}`;
        sandbox.taskDerivedFrom = derived;
      } else if (config.enforceProvenance && (status === "proceeded" || status === "completed")) {
        return `error: proceeding requires derived_from_claim_ids (the environment enforces task provenance)`;
      }
      sandbox.taskStatus = status;
      if (config.autoAudit) {
        audit(sandbox, status === "held" ? "task_held" : "task_status_changed", sandbox.taskDerivedFrom, { status });
      }
      return `task status set to ${status}`;
    }

    case "stop_action":
      sandbox.actionStatus = "stopped";
      if (config.autoAudit) audit(sandbox, "action_stopped", []);
      return `action stopped`;

    case "rollback_task":
      sandbox.taskStatus = "rolled_back";
      sandbox.actionStatus = "rolled_back";
      if (config.autoAudit) audit(sandbox, "task_rolled_back", sandbox.taskDerivedFrom);
      return `task rolled back`;

    case "request_clarification":
      sandbox.dispute = { status: "under_review", resolutionEvidenceIds: [] };
      sandbox.correctionReferenced = true;
      if (config.autoAudit) audit(sandbox, "dispute_review_requested", []);
      return `clarification requested; dispute is under review`;

    case "escalate":
      sandbox.actionStatus = "escalated";
      sandbox.correctionReferenced = true;
      if (config.autoAudit) audit(sandbox, "human_review_requested", [], { role: args.role ?? null });
      return `escalated to ${String(args.role ?? "human review")}`;

    case "append_audit": {
      auditCounter += 1;
      const rawDetails = args.details;
      const details =
        rawDetails !== null && typeof rawDetails === "object" && !Array.isArray(rawDetails)
          ? (rawDetails as Record<string, unknown>)
          : { value: rawDetails ?? null };
      const claimIds = Array.isArray(args.claim_ids)
        ? (args.claim_ids as unknown[]).map((id) => String(id))
        : [];
      sandbox.auditLog.push({
        id: `audit-${auditCounter}`,
        timestamp: "2026-01-01T00:00:00.000Z",
        eventType: String(args.event_type ?? "unspecified"),
        actor: "model",
        claimIds,
        details,
      });
      return `audit event appended`;
    }

    default:
      return `error: unknown tool ${tool}`;
  }
}

/** Builds the schema-valid final state from the sandbox after the last turn. */
export function sandboxToFinalState(
  sandbox: Sandbox,
  view: PublicCaseView,
  caseId: string,
  condition: "B" | "C" | "D",
  turn: number
): FinalStateInput {
  return {
    caseId,
    condition,
    turn,
    correctionAcknowledged: sandbox.correctionReferenced,
    evidenceEvents: [
      {
        id: view.correction.id,
        timestamp: "2026-01-01T00:00:00.000Z",
        source: view.correction.source,
        statement: view.correction.statement,
        immutable: true,
      },
    ],
    currentRecord: {
      claims: [...sandbox.claims.values()].map((claim) => ({
        id: claim.id,
        text: claim.text,
        status: claim.status,
        evidenceIds: claim.evidenceIds,
        ...(claim.replacementId ? { replacementId: claim.replacementId } : {}),
      })),
    },
    clinicalDraftNote: { text: sandbox.noteText, claimIds: sandbox.noteClaimIds },
    patientFacingSummary: { text: sandbox.summaryText, claimIds: sandbox.summaryClaimIds },
    downstreamTask: {
      id: `task-${caseId}`,
      description: view.initialState.downstreamTask.description,
      status: sandbox.taskStatus,
      derivedFromClaimIds: sandbox.taskDerivedFrom,
    },
    actionStatus: sandbox.actionStatus,
    dispute: { ...sandbox.dispute },
    humanCorrectionRepetitions: 0,
    auditLog: sandbox.auditLog,
  };
}

/** Compact state readout returned to the model after each turn. */
export function sandboxReadout(sandbox: Sandbox): string {
  const claims = [...sandbox.claims.values()].map((claim) => ({
    id: claim.id,
    status: claim.status,
    ...(claim.replacementId ? { replacementId: claim.replacementId } : {}),
  }));
  return JSON.stringify(
    {
      claims,
      clinical_draft_note: { text: sandbox.noteText, cited_claim_ids: sandbox.noteClaimIds },
      patient_facing_summary: { text: sandbox.summaryText, cited_claim_ids: sandbox.summaryClaimIds },
      downstream_task: { status: sandbox.taskStatus, derived_from_claim_ids: sandbox.taskDerivedFrom },
      action_status: sandbox.actionStatus,
      dispute: sandbox.dispute,
    },
    null,
    2
  );
}
