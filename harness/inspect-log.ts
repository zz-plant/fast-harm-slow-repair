import type { ScoredRun } from "./scorer.ts";

/**
 * A trajectory as the future model harness will record it. Serialized to the
 * Inspect eval-log shape so safety institutes and METR can ingest FHSR runs
 * with their standard tooling (see inspect.aisi.org.uk / eval-logs).
 */
export interface TrajectoryRecord {
  caseId: string;
  condition: "A" | "B" | "C";
  model: string;
  promptVariant: string;
  runIndex: number;
  createdAt: string;
  inputText: string;
  /** Model messages, one entry per turn or reasoning step. */
  messages: Array<{ role: string; content: string }>;
  /** Tool calls (B, C, D) with their inputs and results. */
  toolCalls: Array<{ name: string; input: Record<string, unknown>; result: string }>;
  extractedState: unknown;
  score: ScoredRun;
  /** Token accounting, reported alongside success (tau-bench convention). */
  usage: { inputTokens: number; outputTokens: number; totalTokens: number; costUsd: number };
}

/** Minimal shape of an Inspect eval-log line (status, eval, results, stats, samples). */
export interface InspectEvalLog {
  status: "started" | "success" | "error";
  eval: {
    task: { id: string; dataset: string; name: string };
    model: string;
    created: string;
  };
  results: {
    metrics: Array<{
      name: string;
      value: number;
      options?: { sample_id?: string };
    }>;
  };
  stats: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cost_usd: number;
  };
  samples: Array<{
    id: string;
    input: string;
    target: string;
    output: Array<{ message: string }>;
    score: { value: number; answer?: string };
    events: Array<{
      event: string;
      tool?: string;
      input?: Record<string, unknown>;
      output?: string;
    }>;
  }>;
}

const PRIMARY_METRICS: Array<[string, keyof ScoredRun["primary"]]> = [
  ["unsafe_persistence", "unsafePersistence"],
  ["complete_correction_propagation", "completeCorrectionPropagation"],
  ["successful_recovery_within_turn_budget", "successfulRecoveryWithinTurnBudget"],
] as const;

/** Converts one FHSR trajectory into one Inspect eval-log record. */
export function toInspectEvalLog(trajectory: TrajectoryRecord): InspectEvalLog {
  const { score } = trajectory;
  const toNumber = (value: boolean) => (value ? 1 : 0);
  return {
    status: "success",
    eval: {
      task: { id: trajectory.caseId, dataset: "fast-harm-slow-repair", name: "FHSR" },
      model: trajectory.model,
      created: trajectory.createdAt,
    },
    results: {
      metrics: PRIMARY_METRICS.map(([name, key]) => ({
        name,
        value: toNumber(score.primary[key]),
        options: { sample_id: trajectory.caseId },
      })),
    },
    stats: {
      input_tokens: trajectory.usage.inputTokens,
      output_tokens: trajectory.usage.outputTokens,
      total_tokens: trajectory.usage.totalTokens,
      cost_usd: trajectory.usage.costUsd,
    },
    samples: [
      {
        id: `${trajectory.caseId}-${trajectory.condition}-${trajectory.model}-${trajectory.promptVariant}-run${trajectory.runIndex}`,
        input: trajectory.inputText,
        target: JSON.stringify(score.components),
        output: trajectory.messages.map((message) => ({ message: message.content })),
        score: {
          value: toNumber(score.primary.successfulRecoveryWithinTurnBudget),
          answer: JSON.stringify(score),
        },
        events: trajectory.toolCalls.map((call) => ({
          event: "tool",
          tool: call.name,
          input: call.input,
          output: call.result,
        })),
      },
    ],
  };
}