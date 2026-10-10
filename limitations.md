# Limitations

## Scope

This evaluation is **comparative evidence about architecture**, not a universal estimate of clinical safety.

- **Healthcare is the domain of evidence**, not the only domain of relevance. The mechanisms tested — correction propagation, dependency tracking, reversal, and audit — generalize outside healthcare, but the cases and clinician validation are healthcare-specific.
- **No live clinical data, patients, or systems are affected.** Every patient, record, order, appointment, and message in the eval is simulated, and the sandbox is isolated (no network egress, no real EMR/FHIR APIs).
- **No demographic subgroup or equity analysis in v0.1.** The synthetic ACI-derived data does not include patient demographics. An equity review is required before any deployment claim, per CHAI / Joint Commission guidance.
- **ACI-BENCH is a conversation-to-note dataset.** We are adding synthetic correction events that did not exist in the original benchmark. The dataset construction is itself a modeling choice that must be documented and reviewed.
- **Clinician validation is required for the holdout run.** If we cannot obtain two independent licensed clinician reviews, the holdout run will be reported as a **methodological pilot**, not a healthcare safety evaluation.

## What this evaluation does not prove

- It does not prove that any tested architecture is safe for clinical deployment.
- It does not replace regulatory clearance, institutional review, or continuous monitoring.
- It does not test against adversarial prompting, production-scale load, or real-world integration failures.
- It does not demonstrate that the correction-aware control plane works for every model, prompt, or setting.

## Reconsideration triggers

The preregistration, schemas, thresholds, and analysis plan should be re-opened if any of the following occur:

- a correction authority or content family produces materially different failure patterns in the holdout sample;
- the semantic grader falls outside the clinician-relative validation gate (§10 of `protocol.md`);
- the extraction step shows low agreement on the clinician-reviewed sample, or the extraction-sensitivity analysis shows primary rates moving materially under alternative rules;
- negative controls show material over-correction rates, indicating the no-change scoring is not holding;
- wrong-correction cases show material over-deference rates, indicating the invented-claim safety rule is not binding;
- the primary C-versus-B comparison shows a smaller difference than the paired design can resolve, in which case the conclusion is reported as unresolved rather than as no-difference;
- a single model run shows run-to-run consistency below a usable threshold;
- a development or pilot case that no evaluated system passes, or every system passes, is flagged for re-adjudication before it counts — the development pilot's negative control is the live example, where every model marks the disputed claim "disputed" while the case adjudicates no change;
- clinician adjudication disagrees with the deterministic scorer on more than a small sample;
- the chosen frontier model changes substantially after the manifest is pinned;
- new evidence emerges showing that the metric set misses a consequential failure mode.

## Reuse

Any reuse of this protocol in a production setting requires its own preregistration, its own case set, its own clinician review, and its own deployment decision. Do not transfer the v0.1 thresholds to a different domain, model, or patient population without repeating the validation steps.
