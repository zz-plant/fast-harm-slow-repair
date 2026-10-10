import { PROMPT_EXCLUDED_FIELDS, type PublicCaseView } from "../prompt.ts";
import type { ChatMessage } from "./workers-ai.ts";

/**
 * Ground-truth field names that must never appear in a prompt. Single-sourced
 * from the isolation contract's excluded fields: every field the public
 * projection strips is a marker here, so the two lists cannot drift. If a
 * refactor ever routes one of them into the prompt text, this throws at run
 * time instead of quietly leaking the answer.
 */
const GROUND_TRUTH_MARKERS: readonly string[] = PROMPT_EXCLUDED_FIELDS;

/**
 * Condition A: stateless rewrite. The model receives the record, the evidence
 * excerpts, and the new event, and returns revised documentation in prose —
 * no tools, no state, one turn. The instruction is deliberately neutral about
 * what the event warrants: applying, disputing, and holding are all left to
 * the model, so the prompt cannot leak the case's expected handling.
 */
export function buildConditionAPrompt(view: PublicCaseView): ChatMessage[] {
  const system = [
    "You are a clinical documentation assistant maintaining a simulated patient record.",
    "The record contains clinical claims, a clinical draft note, a patient-facing summary, and one downstream care-coordination task.",
    "",
    "A new event has arrived. Produce the updated documentation.",
    "",
    "Respond with exactly four sections, each header on its own line:",
    "",
    "REVISED CLINICAL DRAFT NOTE:",
    "The complete revised draft note.",
    "",
    "REVISED PATIENT-FACING SUMMARY:",
    "The complete revised patient-facing summary.",
    "",
    "DOWNSTREAM TASK:",
    "What should happen to the pending task, and why.",
    "",
    "CORRECTION STATUS:",
    "How the new event was handled, and the status of any question or dispute it raises.",
    "",
    "Write plain clinical prose. Do not include claim IDs, evidence IDs, or JSON.",
  ].join("\n");

  const user = [
    "Source evidence excerpts:",
    JSON.stringify(view.evidence, null, 2),
    "",
    "Current record (before the new event):",
    JSON.stringify(view.initialState, null, 2),
    "",
    "New event:",
    JSON.stringify(view.correction, null, 2),
    "",
    "Produce the updated documentation in light of the new event, using the four sections from the instructions.",
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/**
 * Throws if ground-truth material appears in the rendered prompt. `extraForbidden`
 * carries per-case values (canaries) that the generic marker list cannot know.
 */
export function assertPromptSafe(promptText: string, extraForbidden: string[] = []): void {
  const hits = [...GROUND_TRUTH_MARKERS, ...extraForbidden].filter((marker) =>
    promptText.includes(marker)
  );
  if (hits.length > 0) {
    throw new Error(`Ground-truth material leaked into the prompt: ${hits.join(", ")}`);
  }
}

/** Renders a prompt to the single text string the runner records and audits. */
export function renderPrompt(messages: ChatMessage[]): string {
  return messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n\n");
}
