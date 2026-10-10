import { describe, expect, test } from "bun:test";
import {
  buildPreferencePairs,
  cleanRuns,
  flagFrequency,
  renderFailureTaxonomy,
  renderStateDiff,
} from "../harness/runner/learning.ts";
import type { TrajectoryRecordOut } from "../harness/runner/report.ts";

function record(over: {
  caseId: string;
  model: string;
  runIndex: number;
  flags?: string[];
  output?: string;
  state?: Record<string, any>;
}): TrajectoryRecordOut {
  const clean = !over.flags?.length;
  return {
    caseId: over.caseId,
    model: over.model,
    runIndex: over.runIndex,
    condition: "A",
    promptVariant: "v1",
    createdAt: "2026-01-01T00:00:00.000Z",
    rawOutput: { content: over.output ?? "", reasoning: null, channel: "content" },
    canary: { contaminated: false, matched: [] },
    extraction: { ok: true, notes: [] },
    extractedState: over.state,
    score: {
      metadata: { caseId: over.caseId, condition: "A", finalTurn: 1 },
      primary: {
        unsafePersistence: over.flags?.includes("unsafe") ?? false,
        completeCorrectionPropagation: clean,
        successfulRecoveryWithinTurnBudget: clean,
      },
      components: {
        correctionRecognized: clean,
        affectedClaimStateCorrect: clean,
        unaffectedClaimsPreserved: clean,
        collateralRetraction: false,
        dependentArtifactsResolved: clean,
        actionContained: clean,
        unneededHold: false,
        provenanceAccurate: clean,
        falseClosure: false,
        humanCorrectionRepetitions: 0,
      },
      auditTrail: { expressible: false, complete: null, missingRequiredEventTypes: [], spuriousEventCount: 0 },
      failureFlags: over.flags ?? [],
    },
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, neurons: 0 },
    settings: { temperature: 0.2, maxTokens: 4096, extractorModel: "e" },
  };
}

describe("learning diagnostics", () => {
  test("flag frequency categorizes infra failures separately from their reasons", () => {
    const records = [
      record({ caseId: "c1", model: "m1", runIndex: 0, flags: ["extraction_failure", "very long reason string"] }),
      record({ caseId: "c1", model: "m1", runIndex: 1, flags: ["extraction_failure", "other reason"] }),
      record({ caseId: "c2", model: "m2", runIndex: 0, flags: ["unneeded_hold"] }),
    ];
    const frequency = flagFrequency(records);
    expect(frequency.get("extraction_failure")).toBe(2);
    expect(frequency.get("unneeded_hold")).toBe(1);
    expect(frequency.get("very long reason string")).toBeUndefined();
  });

  test("preference pairs match a clean chosen run against failing siblings per case", () => {
    const records = [
      record({ caseId: "c1", model: "good", runIndex: 0, output: "correct note" }),
      record({ caseId: "c1", model: "bad", runIndex: 0, flags: ["unneeded_hold"], output: "wrong note" }),
      record({ caseId: "c2", model: "bad", runIndex: 0, flags: ["unsafe"], output: "bad" }),
    ];
    expect(cleanRuns(records)).toHaveLength(1);
    const pairs = buildPreferencePairs(records);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.caseId).toBe("c1");
    expect(pairs[0]!.chosen.output).toBe("correct note");
    expect(pairs[0]!.rejected.map((r) => r.output)).toEqual(["wrong note"]);
  });

  test("state diff reports a claim status difference", () => {
    const a = record({
      caseId: "c1",
      model: "m1",
      runIndex: 0,
      state: { currentRecord: { claims: [{ id: "k", status: "retracted", evidenceIds: [] }] }, downstreamTask: { status: "held" }, actionStatus: "stopped", dispute: { status: "resolved" }, correctionAcknowledged: true },
    });
    const b = record({
      caseId: "c1",
      model: "m2",
      runIndex: 0,
      state: { currentRecord: { claims: [{ id: "k", status: "active", evidenceIds: [] }] }, downstreamTask: { status: "held" }, actionStatus: "stopped", dispute: { status: "resolved" }, correctionAcknowledged: true },
    });
    const diff = renderStateDiff("c1", a, b);
    expect(diff).toContain("claim k");
    expect(diff).toContain("retracted vs active");
  });

  test("taxonomy renders a model-by-case flag grid", () => {
    const records = [
      record({ caseId: "c1", model: "m1", runIndex: 0, flags: ["unneeded_hold"] }),
      record({ caseId: "c1", model: "m2", runIndex: 0 }),
    ];
    const md = renderFailureTaxonomy(records, ["m1", "m2"], ["c1"]);
    expect(md).toContain("Flag frequency");
    expect(md).toContain("unneeded_hold");
    expect(md).toContain("clean");
  });
});