import type { FinalStateInput } from "./scorer.ts";
import { validateState } from "./validate.ts";
import type { PublicCaseView } from "./prompt.ts";
import type { ChatCallOptions, ChatMessage, ChatResult } from "./runner/workers-ai.ts";

/**
 * Raw output of one arm of the evaluation, before extraction:
 *
 * - condition A produces revised prose only;
 * - conditions B and C produce a tool trace plus their final structured state.
 *
 * Every arm's raw output must pass through `extractFinalState` before scoring.
 * Scoring a raw output directly would fail condition A by construction, because
 * a stateless rewrite cannot emit audit-log entries, claim IDs, or evidence IDs.
 */
export type RawOutput =
  | { kind: "prose"; text: string }
  | { kind: "trace"; state: FinalStateInput };

/** Uniform chat function the extractor is served through (Workers AI client). */
export type ExtractorChat = (
  model: string,
  messages: ChatMessage[],
  options?: ChatCallOptions
) => Promise<ChatResult>;

export interface ExtractionDeps {
  chat: ExtractorChat;
  /** One fixed extraction model for every evaluated arm, so extraction cannot favor one model. */
  extractorModel: string;
  /** Non-thinking fallback for when the primary extractor returns unparseable or invalid output. */
  fallbackExtractorModel?: string;
}

export interface ProseExtractionInput {
  caseId: string;
  condition: "A" | "B" | "C";
  /** Public case fields only — ground truth never reaches the extractor. */
  view: PublicCaseView;
  raw: RawOutput;
}

export type ExtractionOutcome =
  | { ok: true; state: FinalStateInput; notes: string[] }
  | { ok: false; reason: string };

/**
 * One extraction step for every arm: converts raw output into the structured
 * state that `scorer.ts` consumes.
 *
 * Prose (condition A) is converted by a fixed extractor model under the same
 * leakage discipline as the prompt: it sees the public case view and the raw
 * output, never the expected transitions, affected claims, or dependencies.
 * The envelope fields the extractor cannot judge (turn, audit log, evidence
 * events, task identity) are filled deterministically by the harness.
 *
 * Per `docs/estimand.md`, an output that cannot be parsed into a valid state is
 * an observed failure, not missing data: the caller scores it as failing every
 * measure it prevents and reports the extraction-failure rate separately.
 *
 * The extraction step itself must still be validated before results count:
 * a clinician-reviewed sample of extracted states, with agreement reported, and
 * a preregistered sensitivity analysis over alternative extraction rules.
 */
export async function extractFinalState(
  deps: ExtractionDeps,
  input: ProseExtractionInput
): Promise<ExtractionOutcome> {
  if (input.raw.kind === "trace") {
    const errors = validateState(input.raw.state);
    if (errors.length > 0) return { ok: false, reason: errors.join("; ") };
    return { ok: true, state: input.raw.state, notes: [] };
  }

  const correction = input.view.correction;
  // Captured before the closure: TypeScript cannot keep the prose narrowing
  // inside `attemptWith`, and the raw text never changes between attempts.
  const rawText = input.raw.text;

  const attemptWith = async (model: string, repairErrors?: string): Promise<ExtractionOutcome> => {
    const response = await deps.chat(
      model,
      [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildExtractionUserPrompt(
            input.view,
            rawText,
            correction.id,
            repairErrors
          ),
        },
      ],
      // Non-thinking extractors finish fast; JSON mode keeps the reply on the
      // content channel, and the timeout stays generous for long outputs.
      { temperature: 0, maxTokens: 8192, timeoutMs: 300_000, retries: 1, responseFormat: { type: "json_object" } }
    );

    const parsed = parseJsonObject(response.text);
    if (parsed === null) {
      const head = response.text.slice(0, 200).replace(/\s+/g, " ");
      return {
        ok: false,
        reason: `extractor returned unparseable JSON (channel=${response.channel}, reply head: ${head})`,
      };
    }
    const notes: string[] = [];
    if (response.channel === "reasoning") notes.push("extractor reply came from the reasoning channel");

  const claims = parsed.claims;
  if (!Array.isArray(claims)) return { ok: false, reason: "extractor output missing claims array" };
  const knownClaimIds = new Set(
    (input.view.initialState.claims as Array<{ id: string }>).map((claim) => claim.id)
  );
  for (const claim of claims) {
    const id = typeof claim?.id === "string" ? claim.id : "";
    if (id !== "" && !knownClaimIds.has(id) && !/^claim-extracted-\d+$/.test(id)) {
      notes.push(`unrecognized claim id ${id} retained (extractor-coined)`);
    }
  }

  const state: FinalStateInput = {
    caseId: input.caseId,
    condition: input.condition,
    turn: 1,
    correctionAcknowledged: parsed.correctionAcknowledged === true,
    evidenceEvents: [
      {
        id: correction.id,
        timestamp: "2026-01-01T00:00:00.000Z",
        source: correction.source,
        statement: correction.statement,
        immutable: true,
      },
    ],
    currentRecord: { claims },
    clinicalDraftNote: {
      text: typeof parsed.clinicalDraftNote?.text === "string" ? parsed.clinicalDraftNote.text : rawText,
      claimIds: Array.isArray(parsed.clinicalDraftNote?.claimIds) ? parsed.clinicalDraftNote.claimIds : [],
    },
    patientFacingSummary: {
      text: typeof parsed.patientFacingSummary?.text === "string" ? parsed.patientFacingSummary.text : rawText,
      claimIds: Array.isArray(parsed.patientFacingSummary?.claimIds) ? parsed.patientFacingSummary.claimIds : [],
    },
    downstreamTask: {
      id: `task-${input.caseId}`,
      description: input.view.initialState.downstreamTask?.description ?? "",
      status: parsed.downstreamTask?.status ?? "pending",
      derivedFromClaimIds: Array.isArray(parsed.downstreamTask?.derivedFromClaimIds)
        ? parsed.downstreamTask.derivedFromClaimIds
        : [],
    },
    actionStatus: typeof parsed.actionStatus === "string" ? parsed.actionStatus : "pending",
    dispute: {
      status: parsed.dispute?.status ?? "open",
      resolutionEvidenceIds: Array.isArray(parsed.dispute?.resolutionEvidenceIds)
        ? parsed.dispute.resolutionEvidenceIds
        : [],
    },
    humanCorrectionRepetitions: 0,
    auditLog: [],
  };

    const errors = validateState(state);
    if (errors.length > 0) {
      return { ok: false, reason: `extracted state invalid: ${errors.join("; ")}` };
    }
    return { ok: true, state, notes };
  };

  const primary = await attemptWith(deps.extractorModel);
  if (primary.ok || !deps.fallbackExtractorModel) return primary;

  // A thinking extractor can reason its way past the budget without emitting
  // parseable JSON; a non-thinking fallback recovers the trajectory without
  // giving any evaluated arm a different extraction treatment.
  const fallback = await attemptWith(deps.fallbackExtractorModel);
  if (fallback.ok) {
    return {
      ...fallback,
      notes: [
        ...fallback.notes,
        `primary extractor (${deps.extractorModel}) failed (${primary.reason.slice(0, 120)}); recovered by fallback (${deps.fallbackExtractorModel})`,
      ],
    };
  }

  // Near-miss: the fallback produced JSON that failed schema validation (in
  // the pilot, an out-of-enum task status on complex outputs). One repair
  // pass feeding the validation errors back usually fixes it.
  if (fallback.reason.startsWith("extracted state invalid")) {
    const repaired = await attemptWith(deps.fallbackExtractorModel, fallback.reason);
    if (repaired.ok) {
      return {
        ...repaired,
        notes: [
          ...repaired.notes,
          `primary extractor (${deps.extractorModel}) failed (${primary.reason.slice(0, 120)}); ` +
            `fallback recovered after a validation-repair pass (${fallback.reason.slice(0, 120)})`,
        ],
      };
    }
    return {
      ok: false,
      reason: `primary (${deps.extractorModel}): ${primary.reason} | fallback (${deps.fallbackExtractorModel}): ${fallback.reason} | fallback after repair: ${repaired.reason}`,
    };
  }

  return {
    ok: false,
    reason: `primary (${deps.extractorModel}): ${primary.reason} | fallback (${deps.fallbackExtractorModel}): ${fallback.reason}`,
  };
}

const EXTRACTION_SYSTEM_PROMPT = [
  "You are a deterministic extraction step inside an evaluation harness.",
  "You convert a clinical documentation system's prose output into structured JSON that exactly reflects what that output says — nothing more.",
  "You see the record before the new event, the new event, and the system's output.",
  "Do not reason step by step. Output the JSON object immediately as your entire reply.",
  "Output a single JSON object and nothing else. No markdown fences, no commentary.",
].join(" ");

function buildExtractionUserPrompt(
  view: PublicCaseView,
  rawText: string,
  correctionId: string,
  repairErrors?: string
): string {
  const template = {
    correctionAcknowledged:
      "boolean — true if the output incorporates or addresses the new event in any way (including disputing or rejecting it); false only if the output ignores it entirely",
    claims:
      "the full updated claim list; for every original claim use its exact id and text, keep its evidenceIds, and set status to active/disputed/retracted/replaced as the output indicates; append the new event id to evidenceIds ONLY if the output attributes the change to that event; when the output introduces a statement that supersedes a retracted or replaced claim (for example, the corrected version of the same instruction), link the retracted claim to that new statement via replacementId; any genuinely new clinical claim the output introduces gets a fresh id claim-extracted-1, claim-extracted-2, ...",
    clinicalDraftNote: { text: "the revised draft note text from the output", claimIds: "claim ids the revised note asserts" },
    patientFacingSummary: { text: "the revised summary text from the output", claimIds: "claim ids the revised summary asserts" },
    downstreamTask: {
      status: "pending/held/proceeded/rolled_back/completed as the output indicates",
      derivedFromClaimIds: "claim ids the task's next step still relies on as written; empty if the output holds or cancels it and names no dependencies",
    },
    actionStatus: "pending/stopped/rolled_back/proceeded/escalated as the output indicates",
    dispute: {
      status: "resolved if the output states the event was fully handled; under_review if the output requests or awaits review; open if the output does not address the question the event raises",
      resolutionEvidenceIds: `[${JSON.stringify(correctionId)}] only if the output says the event itself resolved it, else []`,
    },
  };
  return [
    "RECORD (before the new event):",
    JSON.stringify(view.initialState, null, 2),
    "",
    "NEW EVENT:",
    JSON.stringify(view.correction, null, 2),
    "",
    "SYSTEM OUTPUT TO EXTRACT:",
    rawText,
    "",
    `The new event's evidence id is ${JSON.stringify(correctionId)}.`,
    "",
    "Extract the state the SYSTEM OUTPUT expresses into exactly this JSON shape:",
    JSON.stringify(template, null, 2),
    "",
    "Faithfulness rules:",
    "- The REVISED note and summary TEXT determine claims, statuses, and citations. A CORRECTION STATUS or DOWNSTREAM TASK section that narrates a change the revised text does not show must NOT be reflected in the claims or citations.",
    "- Map only what the output actually says; never infer changes the output does not state.",
    ...(repairErrors
      ? [
          "",
          "Your previous reply failed validation with these errors:",
          repairErrors,
          "Output the corrected JSON object only, using exactly the allowed values for every status field.",
        ]
      : []),
  ].join("\n");
}

/** Parses the last complete JSON object in a string, tolerating fences and thinking prose. */
export function parseJsonObject(text: string): Record<string, any> | null {
  const unfenced = text.replace(/```(?:json)?/g, "");

  // Whole-span first: a single object with prose around it.
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const parsed = tryParse(unfenced.slice(start, end + 1));
    if (parsed !== null) return parsed;
  }

  // Then the last balanced object: thinking models reason in prose and emit
  // the answer JSON last (or get cut off after it); scanning from the end
  // finds it even when the reasoning contains stray braces or fragments.
  for (let i = unfenced.length - 1; i >= 0; i -= 1) {
    if (unfenced[i] !== "}") continue;
    let depth = 0;
    for (let j = i; j >= 0; j -= 1) {
      const ch = unfenced[j];
      if (ch === "}") depth += 1;
      else if (ch === "{") {
        depth -= 1;
        if (depth === 0) {
          const parsed = tryParse(unfenced.slice(j, i + 1));
          if (parsed !== null) return parsed;
          break;
        }
      }
    }
  }
  return null;
}

function tryParse(text: string): Record<string, any> | null {
  try {
    const parsed = JSON.parse(text);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}
