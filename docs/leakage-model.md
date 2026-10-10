# Leakage model

Ground truth can leak into a model's prompt through more than one channel, and no single detector covers all of them. This document defines the leakage classes, the detector for each, and the current status.

## Classes and detectors

| Class | What leaks | Detector | Status |
| --- | --- | --- | --- |
| **Structural** | A ground-truth field is reachable inside the prompt object. | Key-absence scan: the public projection may contain none of the excluded fields, anywhere in the object tree (`harness/prompt.ts` → `findExcludedKeys`). | Enforced by `bun run prompt-audit` and tests. |
| **Functional** | The prompt view is *computed from* ground truth, even if no field is copied verbatim. | Counterfactual invariance: for a fixed set of ground-truth mutations (flipped transitions, emptied claim lists, changed severity/authority/canary, rewritten purpose notes), the projection must be byte-identical (`tests/prompt.test.ts`). | Enforced by tests. |
| **Lexical** | Surface text states the correct handling ("requires review rather than silent rejection"). | Term lint over correction statements (`flagCorrectionStatement`), surfaced as advisory warnings. | Active; two development cases currently flagged. |
| **Semantic** | A paraphrased giveaway that no term list catches. | No automated detector. Mitigated by authoring review, the rule that a correction statement describes the correction (not the recovery), holdout canaries, and the isolation of expected transitions. | Human review; stated limitation. |

## Why both structural and functional detectors

A structural scan is sound but incomplete: a field could be renamed, nested, or derived. The counterfactual invariance test closes that gap from the other direction — it does not care how the projection is implemented, only that its output is a function of the permitted inputs alone. Together they make the isolation claim testable rather than procedural.

## Lexical overlap is not leakage

Shared vocabulary between the prompt and the grading rubric (e.g. the words "retract" or "hold" appearing in both) is expected and benign. What the lexical lint flags is narrower: language that *instructs the model toward the graded behavior*. The distinction is functional dependence, not word overlap.

## Current findings

- `bun run prompt-audit`: no scoring fields reach the prompt view for any committed case.
- `aci-dev-002` and `aci-dev-003` correction statements contain handling language and are flagged. The statements should be rewritten to state only the correction before holdout authoring begins, so the model must infer the recovery.
