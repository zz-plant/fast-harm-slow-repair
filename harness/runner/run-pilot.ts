import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readCases } from "../validate.ts";
import { publicCaseView } from "../prompt.ts";
import { contaminationReport } from "../canary.ts";
import { goldCaseFromJson, toEvalCaseInput } from "../gold.ts";
import { scoreRun, type ScoredRun } from "../scorer.ts";
import { toInspectEvalLog } from "../inspect-log.ts";
import { extractFinalState } from "../extract.ts";
import { makeWorkersAiClient, type ChatResult, type WorkersAiChat } from "./workers-ai.ts";
import { assertPromptSafe, buildConditionAPrompt, renderPrompt } from "./prompts.ts";
import { resolveModelVersionIds } from "./model-catalog.ts";
import { buildAgentSystemPrompt, runAgent } from "./agent.ts";
import { renderPerModelTable, renderSummary, unevaluableScore, type TrajectoryRecordOut } from "./report.ts";

/**
 * Development pilot: runs condition A (stateless rewrite) through Cloudflare
 * Workers AI models on the development cases, through the same extraction and
 * scoring steps every arm will use.
 *
 * This is HARNESS VALIDATION, NOT STUDY DATA. The development cases are not
 * clinically reviewed, the extraction step is not yet validated against
 * clinicians, condition A is the weakest baseline, and nothing here can
 * support a claim about architectures, models, or safety. The outputs live in
 * results/dev-pilot/ with that framing stamped on every artifact.
 */

const DEFAULT_MODELS = [
  // @cf/cloudflare/clef-omni is excluded: its /ai/run endpoint expects an
  // agent-style contract (model, state, questions), not the chat-messages
  // contract. Supporting it needs its own adapter; including it here would
  // score infra failures as model failures (found in the pilot).
  "@cf/zai-org/glm-5.3",
  "@cf/zai-org/glm-5.3-flash",
  "@cf/deepseek-ai/deepseek-v4-pro-0813",
  "@cf/deepseek-ai/deepseek-v4-flash-0731",
  "@cf/qwen/qwen3.8-27b",
  "@cf/nvidia/nemotron-3-120b-a12b",
  "@cf/google/gemma-4-26b-a4b-it",
  "@cf/openai/gpt-oss-20b",
  "@cf/meta/llama-4-scout-17b-16e-instruct",
];
const DEFAULT_EXTRACTOR = "@cf/meta/llama-4-scout-17b-16e-instruct";
const PROMPT_VARIANT = "dev-pilot-a-v1";

interface CliArgs {
  models: string[];
  runs: number;
  extractor: string;
  fallbackExtractor: string;
  casesPath: string;
  outBase: string;
  temperature: number;
  maxTokens: number;
  concurrency: number;
  conditions: Array<"A" | "B" | "C" | "D">;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    models: DEFAULT_MODELS,
    runs: 3,
    // Non-thinking primary: the pilot showed a thinking extractor reasoning
    // past its budget without emitting JSON, leaving reliability to the
    // fallback. Non-thinking extractors finish fast on the content channel.
    extractor: DEFAULT_EXTRACTOR,
    fallbackExtractor: "@cf/google/gemma-4-26b-a4b-it",
    casesPath: "data/development.jsonl",
    outBase: "results/dev-pilot",
    temperature: 0.2,
    // Thinking models spend tokens on reasoning before content; a 1500 cap
    // produced empty or truncated content that was then scored as behavioral
    // failure (found in the pilot). 4096 gives room for reasoning plus the
    // four output sections.
    maxTokens: 4096,
    concurrency: 4,
    conditions: ["A"],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]!;
    const value = argv[i + 1];
    switch (flag) {
      case "--models": args.models = value!.split(",").map((m) => m.trim()).filter(Boolean); i += 1; break;
      case "--runs": args.runs = Number(value); i += 1; break;
      case "--extractor": args.extractor = value!; i += 1; break;
      case "--fallback-extractor": args.fallbackExtractor = value!; i += 1; break;
      case "--cases": args.casesPath = value!; i += 1; break;
      case "--out": args.outBase = value!; i += 1; break;
      case "--temperature": args.temperature = Number(value); i += 1; break;
      case "--max-tokens": args.maxTokens = Number(value); i += 1; break;
      case "--concurrency": args.concurrency = Number(value); i += 1; break;
      case "--conditions": args.conditions = value!.split(",").map((c) => c.trim().toUpperCase() as "A" | "B" | "C" | "D").filter((c) => ["A", "B", "C", "D"].includes(c)); i += 1; break;
      default:
        throw new Error(`Unknown flag: ${flag}`);
    }
  }
  return args;
}

const root = new URL("../../", import.meta.url).pathname;
const args = parseArgs(process.argv.slice(2));

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
if (!accountId || !apiToken) {
  console.error(
    "Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in the environment (the pilot never reads credentials from the repo)."
  );
  process.exit(1);
}

const cases = readCases(join(root, args.casesPath));
for (const evalCase of cases) {
  if (evalCase.split !== "development") {
    console.error(`Refusing to run the pilot on non-development case ${evalCase.id}.`);
    process.exit(1);
  }
}
const canaries = cases.map((evalCase) => evalCase.canary ?? "");

const chat: WorkersAiChat = makeWorkersAiClient({ accountId, apiToken });

// Pin the catalog version ids the protocol promises (§7); best-effort.
const pinnedVersions = await resolveModelVersionIds(
  { accountId, apiToken },
  [args.extractor, args.fallbackExtractor, ...args.models]
);
const pinnedCount = [...pinnedVersions.values()].filter((id) => id !== null).length;
console.log(`Pinned Workers AI version ids resolved for ${pinnedCount} of ${pinnedVersions.size} model(s).`);

// Prompts are model-independent: build and audit them once per case.
const promptsByCase = new Map<string, { promptText: string; promptMessages: ReturnType<typeof buildConditionAPrompt> }>();
for (const evalCase of cases) {
  const view = publicCaseView(evalCase);
  const promptMessages = buildConditionAPrompt(view);
  const promptText = renderPrompt(promptMessages);
  assertPromptSafe(promptText, canaries);
  promptsByCase.set(evalCase.id, { promptText, promptMessages });
}

interface Job {
  model: string;
  caseId: string;
  runIndex: number;
  condition: "A" | "B" | "C" | "D";
}
const jobs: Job[] = [];
for (const model of args.models) {
  for (const evalCase of cases) {
    for (let runIndex = 0; runIndex < args.runs; runIndex += 1) {
      for (const condition of args.conditions) {
        jobs.push({ model, caseId: evalCase.id, runIndex, condition });
      }
    }
  }
}

console.log(
  `Development pilot: ${cases.length} case(s) x ${args.models.length} model(s) x ${args.runs} run(s) x ${args.conditions.length} condition(s) = ${jobs.length} trajectories.`,
  `Conditions: ${args.conditions.join(", ")}. Extractor: ${args.extractor} (fallback ${args.fallbackExtractor}). Temperature ${args.temperature}, max_tokens ${args.maxTokens}, concurrency ${args.concurrency}.`
);

const startedAt = new Date();
const records: TrajectoryRecordOut[] = [];
let completed = 0;

async function runJob(job: Job): Promise<void> {
  const evalCase = cases.find((c) => c.id === job.caseId)!;
  const goldCase = goldCaseFromJson(evalCase);
  const view = publicCaseView(evalCase);
  let record: TrajectoryRecordOut;

  if (job.condition === "A") {
    const { promptText, promptMessages } = promptsByCase.get(job.caseId)!;
    let call: ChatResult;
    try {
      call = await chat(job.model, promptMessages, {
        temperature: args.temperature,
        maxTokens: args.maxTokens,
        // Thinking models at 4096 tokens can exceed two minutes.
        timeoutMs: 240_000,
      });
    } catch (error) {
      const reason = `model call failed: ${(error as Error).message}`;
      records.push(makeFailureRecord(job, promptText, reason, args, undefined, undefined, "model_call_failed"));
      noteCompletion(job, reason);
      return;
    }

    const canary = contaminationReport(call.text, canaries);
    if (call.text === "") {
      record = makeFailureRecord(job, promptText, "model returned no text", args, call, canary, "extraction_failure");
    } else {
      const outcome = await extractFinalState(
        { chat, extractorModel: args.extractor, fallbackExtractorModel: args.fallbackExtractor },
        { caseId: job.caseId, condition: "A", view, raw: { kind: "prose", text: call.text } }
      );
      if (outcome.ok) {
        const score = scoreRun(toEvalCaseInput(goldCase), outcome.state);
        record = {
          caseId: job.caseId,
          model: job.model,
          runIndex: job.runIndex,
          condition: "A",
          promptVariant: PROMPT_VARIANT,
          createdAt: new Date().toISOString(),
          promptText,
          pinnedVersionId: pinnedVersions.get(job.model) ?? null,
          rawOutput: { content: call.rawContent, reasoning: call.reasoningText, channel: call.channel },
          canary,
          extraction: { ok: true, notes: outcome.notes },
          extractedState: outcome.state,
          score,
          usage: {
            inputTokens: call.inputTokens,
            outputTokens: call.outputTokens,
            totalTokens: call.totalTokens,
            neurons: call.neurons,
          },
          settings: { temperature: args.temperature, maxTokens: args.maxTokens, extractorModel: args.extractor },
        };
      } else {
        record = makeFailureRecord(job, promptText, outcome.reason, args, call, canary, "extraction_failure");
      }
    }
  } else {
    // Agent conditions B/C/D: the sandbox is the environment, its final state
    // is the scored state — no LLM extraction step runs for these conditions.
    // Condition C intentionally exposes the case's dependency graph in its
    // system prompt (that is the control plane being tested); no other
    // condition sees it, and the ground-truth transition is never exposed.
    const dependencies = job.condition === "C"
      ? evalCase.artifactDependencies
          .map((d) => `${d.artifact} depends on: ${d.dependsOnClaimIds.join(", ") || "nothing"}`)
          .join("\n")
      : undefined;
    const promptText = buildAgentSystemPrompt(job.condition as "B" | "C" | "D", dependencies);
    const result = await runAgent(
      chat,
      job.model,
      view,
      job.caseId,
      job.condition as "B" | "C" | "D",
      evalCase.maxRecourseTurnBudget,
      dependencies,
      { temperature: args.temperature, maxTokens: args.maxTokens }
    );
    const agentText = result.turnOutputs.join("\n");
    const canary = contaminationReport(agentText, canaries);
    if (!result.ok) {
      const flag = result.reason?.startsWith("model call failed") ? "model_call_failed" : "extraction_failure";
      record = makeFailureRecord(job, promptText, result.reason ?? "agent failed", args, undefined, canary, flag as "extraction_failure" | "model_call_failed");
      // Preserve the partial turn data even on failure.
      record.agentTurns = result.turnOutputs;
      record.toolCalls = result.sandbox.toolCalls;
    } else {
      const score = scoreRun(toEvalCaseInput(goldCase), result.state!);
      record = {
        caseId: job.caseId,
        model: job.model,
        runIndex: job.runIndex,
        condition: job.condition,
        promptVariant: PROMPT_VARIANT,
        createdAt: new Date().toISOString(),
        promptText,
        pinnedVersionId: pinnedVersions.get(job.model) ?? null,
        rawOutput: {
          content: result.turnOutputs[result.turnOutputs.length - 1] ?? "",
          reasoning: null,
          channel: "content",
        },
        agentTurns: result.turnOutputs,
        toolCalls: result.sandbox.toolCalls,
        canary,
        extraction: { ok: true, notes: [] },
        extractedState: result.state,
        score,
        usage: result.usage,
        settings: { temperature: args.temperature, maxTokens: args.maxTokens, extractorModel: args.extractor },
      };
    }
  }
  records.push(record);
  noteCompletion(job, summarize(record));
}

function makeFailureRecord(
  job: Job,
  promptText: string,
  reason: string,
  args: CliArgs,
  call?: ChatResult,
  canary?: { contaminated: boolean; matched: string[] },
  flag: "extraction_failure" | "model_call_failed" = "extraction_failure"
): TrajectoryRecordOut {
  return {
    caseId: job.caseId,
    model: job.model,
    runIndex: job.runIndex,
    condition: job.condition,
    promptVariant: PROMPT_VARIANT,
    createdAt: new Date().toISOString(),
    promptText,
    pinnedVersionId: pinnedVersions.get(job.model) ?? null,
    rawOutput: call
      ? { content: call.rawContent, reasoning: call.reasoningText, channel: call.channel }
      : { content: "", reasoning: null, channel: "none" },
    canary: canary ?? { contaminated: false, matched: [] },
    extraction: { ok: false, reason, notes: [] },
    score: unevaluableScore(job.caseId, job.condition, reason, flag),
    usage: call
      ? { inputTokens: call.inputTokens, outputTokens: call.outputTokens, totalTokens: call.totalTokens, neurons: call.neurons }
      : { inputTokens: 0, outputTokens: 0, totalTokens: 0, neurons: 0 },
    settings: { temperature: args.temperature, maxTokens: args.maxTokens, extractorModel: args.extractor },
  };
}

function noteCompletion(job: Job, note: string): void {
  completed += 1;
  console.log(`[${completed}/${jobs.length}] ${job.model} ${job.caseId} run${job.runIndex}: ${note}`);
}

function summarize(record: TrajectoryRecordOut): string {
  const p = record.score.primary;
  const base = `unsafe=${p.unsafePersistence ? "YES" : "no"} complete=${p.completeCorrectionPropagation ? "yes" : "NO"} recovery=${p.successfulRecoveryWithinTurnBudget ? "yes" : "NO"}`;
  if (!record.extraction.ok) {
    return `${base} — ${record.extraction.reason!.slice(0, 110)}`;
  }
  if (record.rawOutput.content === "" && record.rawOutput.channel === "reasoning") {
    return `${base} [content empty; extracted from reasoning channel]`;
  }
  return base;
}

async function runPool(limit: number): Promise<void> {
  let next = 0;
  async function lane(): Promise<void> {
    while (next < jobs.length) {
      const job = jobs[next]!;
      next += 1;
      await runJob(job);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, () => lane()));
}

await runPool(args.concurrency);

// ---- outputs ----
const stamp = startedAt.toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = join(root, args.outBase, stamp);
mkdirSync(outDir, { recursive: true });

const trajectoriesPath = join(outDir, "trajectories.jsonl");
writeFileSync(trajectoriesPath, records.map((record) => JSON.stringify(record)).join("\n") + "\n");

const inspectPath = join(outDir, "inspect-logs.jsonl");
writeFileSync(
  inspectPath,
  records
    .map((record) =>
      JSON.stringify(
        toInspectEvalLog({
          caseId: record.caseId,
          condition: record.condition,
          model: record.model,
          promptVariant: record.promptVariant,
          runIndex: record.runIndex,
          createdAt: record.createdAt,
          inputText: record.promptText,
          messages: (record.agentTurns ?? [record.rawOutput.content || record.rawOutput.reasoning || ""]).map(
            (content) => ({ role: "assistant", content })
          ),
          toolCalls: (record.toolCalls ?? []).map((call) => ({
            name: call.tool,
            input: call.args,
            result: call.result,
          })),
          extractedState: record.extractedState,
          score: record.score,
          usage: {
            inputTokens: record.usage.inputTokens,
            outputTokens: record.usage.outputTokens,
            totalTokens: record.usage.totalTokens,
            // Workers AI bills by neurons (reported in trajectories.jsonl), not per-token USD.
            costUsd: 0,
          },
        })
      )
    )
    .join("\n") + "\n"
);

const summaryPath = join(outDir, "summary.md");
writeFileSync(
  summaryPath,
  renderSummary(
    records,
    {
      promptVariant: PROMPT_VARIANT,
      runs: args.runs,
      temperature: args.temperature,
      extractor: args.extractor,
      fallbackExtractor: args.fallbackExtractor,
    },
    startedAt,
    cases.map((evalCase) => evalCase.id)
  )
);

console.log(`\nWrote ${trajectoriesPath}\nWrote ${inspectPath}\nWrote ${summaryPath}`);
console.log("\n" + renderPerModelTable(records, cases.map((evalCase) => evalCase.id), args.runs));
