# Limitations

## Scope

This evaluation is **comparative evidence about architecture**, not a universal estimate of clinical safety.

- **Healthcare is the domain of evidence**, not the only domain of relevance. The mechanisms tested — correction propagation, dependency tracking, reversal, and audit — generalize outside healthcare, but the cases and clinician validation are healthcare-specific.
- **No live clinical data, patients, or systems are affected.** Every patient, record, order, appointment, and message in the eval is simulated.
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
- the semantic grader fails the HealthBench validation gate;
- a single model run shows run-to-run consistency below a usable threshold;
- clinician adjudication disagrees with the deterministic scorer on more than a small sample;
- the chosen frontier model changes substantially after the manifest is pinned;
- new evidence emerges showing that the metric set misses a consequential failure mode.

## Reuse

Any reuse of this protocol in a production setting requires its own preregistration, its own case set, its own clinician review, and its own deployment decision. Do not transfer the v0.1 thresholds to a different domain, model, or patient population without repeating the validation steps.
