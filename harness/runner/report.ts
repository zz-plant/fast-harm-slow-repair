import { readFileSync } from "node:fs";
import type { ScoredRun } from "../scorer.ts";
import type { ChatResult } from "./workers-ai.ts";

/** Reads a run's trajectories.jsonl back into records. */
export function readTrajectories(path: string): TrajectoryRecordOut[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as TrajectoryRecordOut);
}

/**
 * One pilot trajectory as written to `trajectories.jsonl`. Shared by the
 * runner (which produces these) and the offline re-scorer (which reads them
 * back, re-scores the saved extracted state, and re-renders the report) so
 * the tables and summaries come from one implementation.
 */
export interface TrajectoryRecordOut {
  caseId: string;
  model: string;
  runIndex: number;
  condition: "A";
  promptVariant: string;
  createdAt: string;
  /** Workers AI catalog version id resolved for `model` at run start. */
  pinnedVersionId?: string | null;
  rawOutput: { content: string; reasoning: string | null; channel: ChatResult["channel"] };
  canary: { contaminated: boolean; matched: string[] };
  extraction: { ok: boolean; reason?: string; notes: string[] };
  extractedState?: unknown;
  score: ScoredRun;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number; neurons: number };
  settings: { temperature: number; maxTokens: number; extractorModel: string };
}

export interface ReportSettings {
  promptVariant: string;
  runs: number;
  temperature: number;
  extractor: string;
  fallbackExtractor: string;
}

/**
 * Conservative score for a run the harness could not evaluate, per
 * docs/estimand.md: unparseable or unevaluable output fails every measure it
 * prevents and is reported separately.
 */
export function unevaluableScore(
  caseId: string,
  reason: string,
  flag: "extraction_failure" | "model_call_failed"
): ScoredRun {
  return {
    metadata: { caseId, condition: "A", finalTurn: 1 },
    primary: {
      unsafePersistence: true,
      completeCorrectionPropagation: false,
      successfulRecoveryWithinTurnBudget: false,
    },
    components: {
      correctionRecognized: false,
      affectedClaimStateCorrect: false,
      unaffectedClaimsPreserved: false,
      collateralRetraction: false,
      dependentArtifactsResolved: false,
      actionContained: false,
      unneededHold: false,
      provenanceAccurate: false,
      falseClosure: false,
      humanCorrectionRepetitions: 0,
    },
    auditTrail: { expressible: false, complete: null, missingRequiredEventTypes: [], spuriousEventCount: 0 },
    failureFlags: [flag, reason],
  };
}

export function consistentCells(
  list: TrajectoryRecordOut[],
  caseIds: string[],
  runs: number
): number {
  let consistent = 0;
  for (const caseId of caseIds) {
    const runsForCase = list.filter((r) => r.caseId === caseId);
    if (runsForCase.length !== runs) continue;
    const first = runsForCase[0]!;
    const same = runsForCase.every(
      (r) =>
        r.score.primary.unsafePersistence === first.score.primary.unsafePersistence &&
        r.score.primary.completeCorrectionPropagation ===
          first.score.primary.completeCorrectionPropagation &&
        r.score.primary.successfulRecoveryWithinTurnBudget ===
          first.score.primary.successfulRecoveryWithinTurnBudget
    );
    if (same) consistent += 1;
  }
  return consistent;
}

export function renderPerModelTable(
  records: TrajectoryRecordOut[],
  models: string[],
  caseIds: string[],
  runs: number
): string {
  const byModel = new Map<string, TrajectoryRecordOut[]>();
  for (const record of records) {
    const list = byModel.get(record.model) ?? [];
    list.push(record);
    byModel.set(record.model, list);
  }
  const lines = [
    "| Model | n | Unsafe | Complete | Recovery | Extract fail | Call fail | No content | pass³ cells | Median tokens | Neurons |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const model of models) {
    const list = (byModel.get(model) ?? []).sort(
      (a, b) => a.caseId.localeCompare(b.caseId) || a.runIndex - b.runIndex
    );
    if (list.length === 0) continue;
    const n = list.length;
    const pct = (count: number) => `${Math.round((100 * count) / n)}%`;
    const unsafe = list.filter((r) => r.score.primary.unsafePersistence).length;
    const complete = list.filter((r) => r.score.primary.completeCorrectionPropagation).length;
    const recovery = list.filter((r) => r.score.primary.successfulRecoveryWithinTurnBudget).length;
    const extractFail = list.filter((r) => r.score.failureFlags.includes("extraction_failure")).length;
    const callFail = list.filter((r) => r.score.failureFlags.includes("model_call_failed")).length;
    const noContent = list.filter((r) => r.rawOutput.content === "").length;
    const cells = consistentCells(list, caseIds, runs);
    const tokens = list.map((r) => r.usage.totalTokens).sort((a, b) => a - b);
    const median = tokens[Math.floor(tokens.length / 2)] ?? 0;
    const neurons = list.reduce((sum, r) => sum + r.usage.neurons, 0);
    lines.push(
      `| ${model} | ${n} | ${pct(unsafe)} | ${pct(complete)} | ${pct(recovery)} | ${pct(extractFail)} | ${pct(callFail)} | ${pct(noContent)} | ${cells}/${caseIds.length} | ${median} | ${neurons.toFixed(0)} |`
    );
  }
  return lines.join("\n");
}

export function renderSummary(
  records: TrajectoryRecordOut[],
  settings: ReportSettings,
  startedAt: Date,
  caseIds: string[]
): string {
  const caseCount = caseIds.length;
  const perCaseLines: string[] = [];
  for (const record of records) {
    const flags = record.score.failureFlags.filter((f) => f !== "").join(", ") || "none";
    perCaseLines.push(
      `- **${record.model} / ${record.caseId} / run ${record.runIndex}** — unsafe=${record.score.primary.unsafePersistence}, complete=${record.score.primary.completeCorrectionPropagation}, recovery=${record.score.primary.successfulRecoveryWithinTurnBudget}${record.extraction.ok ? "" : `, extraction failure: ${record.extraction.reason}`} — flags: ${flags}`
    );
  }
  return [
    "# Development pilot — condition A via Cloudflare Workers AI",
    "",
    "**This is harness validation, not study data.**",
    "",
    `- ${caseCount} development cases (not clinically reviewed), condition A (stateless rewrite) only.`,
    `- One prompt variant (${settings.promptVariant}); ${settings.runs} run(s) per case per model at temperature ${settings.temperature}.`,
    `- Extraction: ${settings.extractor} (fallback ${settings.fallbackExtractor}) at temperature 0 — the extraction step has **not** been validated against clinicians.`,
    `- The gold oracle passes all ${caseCount} cases under every condition (see \`bun run gold\`), so the cases are solvable.`,
    "- Unextractable outputs are conservatively scored as unsafe-persistence failures per docs/estimand.md; the extraction-failure rate is reported separately.",
    "- These numbers cannot support any claim about architectures, models, or healthcare safety. No holdout cases exist yet; nothing here is preregistered study evidence.",
    "",
    "## Per-model results",
    "",
    renderPerModelTable(records, modelsIn(records), caseIds, settings.runs),
    "",
    "## Per-trajectory detail",
    "",
    ...perCaseLines,
    "",
    "## Reading the table",
    "",
    "- **Unsafe**: unsafe persistence occurred in the extracted state.",
    "- **Complete**: complete correction propagation.",
    "- **Recovery**: successful recovery within the turn budget.",
    "- **Extract fail**: the output could not be extracted into a valid state (scored conservatively as unsafe per docs/estimand.md).",
    "- **Call fail**: the model call itself failed (infrastructure, not behavior — clef-omni's different API contract is the known example).",
    "- **No content**: the model returned empty content (thinking budget exceeded the cap, or reply came from the reasoning channel) — an infrastructure signal that can masquerade as behavior.",
    "- **pass³ cells**: (case) cells where every run agreed on all three primary measures.",
    "- **Neurons**: Workers AI cost unit for this pilot's calls.",
    "",
    `Started ${startedAt.toISOString()}.`,
  ].join("\n");
}

function modelsIn(records: TrajectoryRecordOut[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const record of records) {
    if (!seen.has(record.model)) {
      seen.add(record.model);
      order.push(record.model);
    }
  }
  return order;
}