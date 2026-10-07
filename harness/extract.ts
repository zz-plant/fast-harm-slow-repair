import type { FinalStateInput } from "./scorer.ts";

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

export interface ExtractionResult {
  state: FinalStateInput;
  /** Flags the extractor wants surfaced, such as unparsed spans or prose it could not map. */
  notes: string[];
}

/**
 * One extraction step for every arm: converts raw output into the structured
 * state that `scorer.ts` consumes. Not implemented until the model runner
 * exists, so this fails loudly rather than letting a run bypass extraction.
 *
 * The extraction step itself must be validated before results count:
 * - a clinician-reviewed sample of extracted states, with agreement reported;
 * - a preregistered sensitivity analysis that re-scores under alternative
 *   extraction or scoring rules and reports movement in the primary rates.
 */
export function extractFinalState(
  _evalCaseId: string,
  _condition: "A" | "B" | "C",
  _raw: RawOutput
): ExtractionResult {
  throw new Error(
    "extractFinalState is not implemented until the model runner exists. " +
      "Every arm's output must pass through this step before scoring."
  );
}