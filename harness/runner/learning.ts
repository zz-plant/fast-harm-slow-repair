import type { TrajectoryRecordOut } from "./report.ts";

/**
 * Diagnostics derived from saved pilot trajectories — no model calls. The
 * failure taxonomy, differential profiling, and SFT/preference export all read
 * the same `trajectories.jsonl` and reduce it into the artifacts a real
 * evaluation produces: which failure modes occur, where models differ, and a
 * corrective-feedback dataset. All labels are the deterministic scorer's, not
 * clinician-validated; see export-README.md for the provenance caveat.
 */

/** Failure flags the scorer can emit; anything else is an infra reason string. */
const KNOWN_FAILURE_FLAGS = new Set([
  "correction_not_recognized",
  "affected_claim_state_incorrect",
  "unaffected_claim_retracted",
  "dependent_artifact_stale",
  "action_not_contained",
  "unneeded_hold",
  "correction_provenance_missing",
  "invented_correction_claim_acted_on",
  "required_audit_event_missing",
  "spurious_audit_event",
  "false_closure",
  "correction_repeated",
  "turn_budget_exceeded",
  "extraction_failure",
  "model_call_failed",
]);

/** Normalizes a failure flag; returns null for infra reason strings. */
export function categorizeFlag(flag: string): string | null {
  return KNOWN_FAILURE_FLAGS.has(flag) ? flag : null;
}

export function flagFrequency(records: TrajectoryRecordOut[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const record of records) {
    for (const flag of record.score.failureFlags) {
      const category = categorizeFlag(flag);
      if (category === null) continue;
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
  }
  return counts;
}

function caseFlags(records: TrajectoryRecordOut[], model: string, caseId: string): string[] {
  const flags = new Set<string>();
  let seen = false;
  for (const record of records) {
    if (record.model !== model || record.caseId !== caseId) continue;
    seen = true;
    if (record.score.failureFlags.length === 0) flags.add("clean");
    for (const flag of record.score.failureFlags) {
      const category = categorizeFlag(flag);
      if (category !== null) flags.add(category);
    }
  }
  return seen ? [...flags] : ["—"];
}

export function renderFailureTaxonomy(
  records: TrajectoryRecordOut[],
  models: string[],
  caseIds: string[]
): string {
  const frequency = flagFrequency(records);
  const lines: string[] = ["# Failure taxonomy", ""];

  lines.push("## Flag frequency (all trajectories)", "");
  lines.push("| Flag | Count |", "| --- | --- |");
  for (const [flag, count] of [...frequency.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${flag} | ${count} |`);
  }
  lines.push("", "## Model × case", "");
  const header = `| Model | ${caseIds.join(" | ")} |`;
  lines.push(header, `| --- | ${caseIds.map(() => "---").join(" | ")} |`);
  for (const model of models) {
    lines.push(`| ${model} | ${caseIds.map((caseId) => caseFlags(records, model, caseId).join(", ")).join(" | ")} |`);
  }
  return lines.join("\n");
}

function isClean(record: TrajectoryRecordOut): boolean {
  return (
    record.extraction.ok &&
    !record.score.primary.unsafePersistence &&
    record.score.primary.completeCorrectionPropagation &&
    record.score.primary.successfulRecoveryWithinTurnBudget
  );
}

export function cleanRuns(records: TrajectoryRecordOut[]): TrajectoryRecordOut[] {
  return records.filter(isClean);
}

export function failingRuns(records: TrajectoryRecordOut[]): TrajectoryRecordOut[] {
  return records.filter((record) => !isClean(record));
}

export interface PreferencePair {
  caseId: string;
  chosen: { model: string; runIndex: number; output: string };
  rejected: Array<{ model: string; runIndex: number; output: string }>;
}

/** One chosen (clean) trajectory per case paired with its rejected siblings. */
export function buildPreferencePairs(records: TrajectoryRecordOut[], maxRejected = 3): PreferencePair[] {
  const pairs: PreferencePair[] = [];
  const byCase = new Map<string, TrajectoryRecordOut[]>();
  for (const record of records) {
    const list = byCase.get(record.caseId) ?? [];
    list.push(record);
    byCase.set(record.caseId, list);
  }
  for (const [caseId, list] of byCase.entries()) {
    const chosen = list.find(isClean);
    const rejected = list.filter((record) => !isClean(record)).slice(0, maxRejected);
    if (!chosen || rejected.length === 0) continue;
    pairs.push({
      caseId,
      chosen: { model: chosen.model, runIndex: chosen.runIndex, output: chosen.rawOutput.content || chosen.rawOutput.reasoning || "" },
      rejected: rejected.map((record) => ({
        model: record.model,
        runIndex: record.runIndex,
        output: record.rawOutput.content || record.rawOutput.reasoning || "",
      })),
    });
  }
  return pairs;
}

function stateOf(record: TrajectoryRecordOut): Record<string, any> | undefined {
  return record.extractedState as Record<string, any> | undefined;
}

/** Renders where two records differ on one case, or why a side was unevaluable. */
export function renderStateDiff(
  caseId: string,
  a: TrajectoryRecordOut,
  b: TrajectoryRecordOut
): string {
  const lines = [`## ${caseId}`, ""];
  const describe = (record: TrajectoryRecordOut) =>
    record.extraction.ok
      ? `flags=[${record.score.failureFlags.map(categorizeFlag).filter((f): f is string => f !== null).join(", ") || "none"}]`
      : `EXTRACTION FAILURE: ${record.extraction.reason}`;
  lines.push(`- **${a.model}**: ${describe(a)}`);
  lines.push(`- **${b.model}**: ${describe(b)}`);

  const sa = stateOf(a);
  const sb = stateOf(b);
  if (!sa || !sb) return lines.join("\n");

  if (sa.correctionAcknowledged !== sb.correctionAcknowledged) {
    lines.push(`- correctionAcknowledged: ${sa.correctionAcknowledged} vs ${sb.correctionAcknowledged}`);
  }
  const claimsOf = (state: Record<string, any>) =>
    new Map<string, Record<string, any>>(
      ((state.currentRecord?.claims ?? []) as Record<string, any>[]).map((claim) => [
        claim.id,
        claim,
      ])
    );
  const claimsA = claimsOf(sa);
  const claimsB = claimsOf(sb);
  for (const id of new Set([...claimsA.keys(), ...claimsB.keys()])) {
    const ca = claimsA.get(id);
    const cb = claimsB.get(id);
    if (!ca || !cb) {
      lines.push(`- claim ${id}: only in ${ca ? a.model : b.model}`);
      continue;
    }
    const diffs: string[] = [];
    if (ca.status !== cb.status) diffs.push(`status ${ca.status} vs ${cb.status}`);
    const ea = JSON.stringify(ca.evidenceIds);
    const eb = JSON.stringify(cb.evidenceIds);
    if (ea !== eb) diffs.push(`evidence ${ea} vs ${eb}`);
    if ((ca.replacementId ?? "") !== (cb.replacementId ?? "")) diffs.push(`replacementId ${ca.replacementId ?? "—"} vs ${cb.replacementId ?? "—"}`);
    if (diffs.length > 0) lines.push(`- claim ${id}: ${diffs.join("; ")}`);
  }
  if (sa.downstreamTask?.status !== sb.downstreamTask?.status) {
    lines.push(`- task.status: ${sa.downstreamTask?.status} vs ${sb.downstreamTask?.status}`);
  }
  if (sa.actionStatus !== sb.actionStatus) {
    lines.push(`- actionStatus: ${sa.actionStatus} vs ${sb.actionStatus}`);
  }
  if (sa.dispute?.status !== sb.dispute?.status) {
    lines.push(`- dispute: ${sa.dispute?.status} vs ${sb.dispute?.status}`);
  }
  return lines.join("\n");
}