import { findExcludedKeys, PROMPT_EXCLUDED_FIELDS, type PublicCaseView } from "../prompt.ts";
import type { ChatMessage } from "./workers-ai.ts";

/**
 * Ground-truth field names, single-sourced from the isolation contract's
 * excluded fields: every field the public projection strips is accounted for
 * here, so the two lists cannot drift.
 *
 * Not all of them are safe to substring-match against prompt text: "split",
 * "purpose", and "canary" are ordinary English words that occur in legitimate
 * clinical prose. Those are checked structurally — as object keys anywhere in
 * the projected view — which is where a projection leak would actually show
 * up. Only distinctive identifiers (camelCase) are additionally matched
 * against the rendered text as defense in depth.
 */
const DISTINCTIVE_TEXT_MARKERS: readonly string[] = PROMPT_EXCLUDED_FIELDS.filter((field) =>
  /[A-Z_]/.test(field)
);

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
 * Throws if ground-truth material reaches a prompt: either as an object key
 * anywhere in the projected view the prompt is built from (structural check,
 * immune to ordinary prose), or as a distinctive marker or per-case value
 * (canaries) in the rendered text. `extraForbidden` carries the canaries the
 * generic marker list cannot know.
 */
export function assertPromptSafe(
  view: PublicCaseView,
  promptText: string,
  extraForbidden: string[] = []
): void {
  const keyHits = findExcludedKeys(view);
  const textHits = [...DISTINCTIVE_TEXT_MARKERS, ...extraForbidden].filter((marker) =>
    promptText.includes(marker)
  );
  const hits = [...new Set([...keyHits, ...textHits])];
  if (hits.length > 0) {
    throw new Error(`Ground-truth material leaked into the prompt: ${hits.join(", ")}`);
  }
}

/** Renders a prompt to the single text string the runner records and audits. */
export function renderPrompt(messages: ChatMessage[]): string {
  return messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n\n");
}
