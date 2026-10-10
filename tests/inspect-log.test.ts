import { describe, expect, test } from "bun:test";
import { toInspectEvalLog, type TrajectoryRecord } from "../harness/inspect-log.ts";

const trajectory: TrajectoryRecord = {
  caseId: "aci-dev-001",
  condition: "C",
  model: "qwen3.5:9b-64k",
  promptVariant: "frozen-v1",
  runIndex: 0,
  createdAt: "2026-10-08T00:00:00.000Z",
  inputText: "Case prompt",
  messages: [{ role: "assistant", content: "Retracted the contradicted dose claim." }],
  toolCalls: [{ name: "hold_task", input: { taskId: "task-lisinopril-dose-change" }, result: "held" }],
  extractedState: {},
  score: {
    metadata: { caseId: "aci-dev-001", condition: "C", finalTurn: 1 },
    primary: {
      unsafePersistence: false,
      completeCorrectionPropagation: true,
      successfulRecoveryWithinTurnBudget: true,
    },
    components: {
      correctionRecognized: true,
      affectedClaimStateCorrect: true,
      unaffectedClaimsPreserved: true,
      collateralRetraction: false,
      dependentArtifactsResolved: true,
      actionContained: true,
      unneededHold: false,
      provenanceAccurate: true,
      falseClosure: false,
      humanCorrectionRepetitions: 0,
    },
    auditTrail: {
      expressible: true,
      complete: true,
      missingRequiredEventTypes: [],
      spuriousEventCount: 0,
    },
    failureFlags: [],
  },
  usage: { inputTokens: 1200, outputTokens: 300, totalTokens: 1500, costUsd: 0.02 },
};

describe("Inspect eval-log serialization", () => {
  test("emits an Inspect-shaped log with primary metrics and token stats", () => {
    const log = toInspectEvalLog(trajectory);

    expect(log.status).toBe("success");
    expect(log.eval.task.id).toBe("aci-dev-001");
    expect(log.eval.model).toBe("qwen3.5:9b-64k");
    expect(log.results.metrics).toEqual([
      { name: "unsafe_persistence", value: 0, options: { sample_id: "aci-dev-001" } },
      { name: "complete_correction_propagation", value: 1, options: { sample_id: "aci-dev-001" } },
      { name: "successful_recovery_within_turn_budget", value: 1, options: { sample_id: "aci-dev-001" } },
    ]);
    expect(log.stats.total_tokens).toBe(1500);
    expect(log.stats.cost_usd).toBe(0.02);
    expect(log.samples).toHaveLength(1);
    expect(log.samples[0]!.events[0]!.tool).toBe("hold_task");
    expect(log.samples[0]!.score.value).toBe(1);
  });

  test("round-trips through JSON without losing fields", () => {
    const parsed = JSON.parse(JSON.stringify(toInspectEvalLog(trajectory)));
    expect(parsed.eval.task.id).toBe("aci-dev-001");
    expect(parsed.results.metrics.length).toBe(3);
    expect(parsed.samples[0]!.id).toContain("run0");
  });
});