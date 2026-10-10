# Threats to validity

Structured by validity type, with the mitigation in place and the residual risk that remains after it.

## Internal validity

| Threat | Mitigation | Residual |
| --- | --- | --- |
| Single-run variance | Three repetitions, pass³ consistency reported per cell. | Sampling noise persists; cells are either consistent or not. |
| Extraction noise contaminating every arm | One extraction step for all arms; clinician-reviewed sample; primary rates also on the extraction-certain subset. | Extraction errors remain in the full-holdout rates and are bounded, not removed. |
| Grader leakage into the primary comparison | The judge scores prose only, never gates propagation; audit-trail quality is separate; deterministic scorer for state. | The judge still touches secondary prose measures. |
| Scorer gaming (retract-all, hold-all, escalate-all) | Unaffected-claim preservation, collateral-retraction, unneeded-hold, false-refusal, and unnecessary-escalation measures; no composite score. | An unmodelled shortcut could exist; the gold and fixture controls bound the known ones. |
| Ground-truth leakage into the prompt (ABC T.5) | `harness/prompt.ts` public projection excludes scoring fields and authoring `purpose` text; `bun run prompt-audit` + tests enforce it. | Correction statements still state the handling in two dev cases (advisory warnings); fixed at holdout authoring. |
| Replacement content is not semantically checked | Linkage, status, and correction provenance are scored; the replacement's clinical content is not. The validated semantic judge must cover replacement and note content before holdout. | Until the judge is wired, a content-wrong linked replacement could pass propagation. |
| Narrated state vs performed state | Extraction is instructed to trust the revised note text over `CORRECTION STATUS` narration; clinician extraction validation bounds fidelity. | A confident narration claiming changes the text does not show could still mislead the extractor (condition A is prose by design). |
| Infrastructure leakage into safety attribution | Eval token budget sized for thinking models (4096) after a 1500 cap produced empty content scored as unsafe; `Call fail` and `No content` reported separately from behavior. | Residual infra noise possible; exclusion rules stay frozen before the run. |
| Harness confounding across arms | Identical resources, tools, token budget, and prompt variants; one extraction step. | Subtle tool-description differences could remain. |
| Hidden manual repair | Every intervention must appear in the audit log (own measure). | A repair that is never logged is unobservable by construction — inherent. |

## External validity

| Threat | Mitigation | Residual |
| --- | --- | --- |
| Synthetic records from one dataset | FHIR concept mapping; stated intended use; ACI-BENCH is real clinician–patient dialogue. | Not a production EHR; integration and scale effects untested. |
| English, single-source, US-primary-care style | Disclosed in `limitations.md`; results are comparative, not prevalence estimates. | No cross-language or cross-site generalisation. |
| Model and version churn | Models pinned and hashed; training cutoffs recorded; re-benchmarking plan. | A future model's behaviour is not predicted. |
| Sandbox tool semantics differ from real actions | Tools map to standard EHR concepts (entered-in-error, refuted, Task on-hold, Provenance); clinician review of the simulated semantics. | A real system's rollback may be irreversible in ways the sandbox is not. |

## Construct validity

| Threat | Mitigation | Residual |
| --- | --- | --- |
| "Unsafe persistence" is a proxy for harm | Grounded in an observed production failure mode (verified scribe census); severity tiers separate coordination delay from potential harm. | A proxy is not patient harm; no outcome link is claimed. |
| Correction events are authored transformations | Correction statements are new and disclosed; contamination reduced; statements are being cleaned of handling language. | Authoring is itself a modelling choice. |
| Severity rubric is a free judgment | Clinicians rate against a stated harm basis; κ/α reported. | Inter-rater disagreement remains and is reported. |
| Authority conditions may not cover real correction paths | Six conditions crossed with six content families; conflicts, stale evidence, and pressure included. | Unknown authority paths may exist. |

## Statistical conclusion validity

| Threat | Mitigation | Residual |
| --- | --- | --- |
| Underpowered for small effects | Power statement up front; effects below the resolvable size are labelled unresolved, not null. | Cannot detect ~<20 pp with 36 cases. |
| Zero-failure overconfidence | Wilson intervals; "zero observed ≠ zero underlying" stated in §9. | 0/36 rules out only rates above ~9.6%. |
| Multiplicity across secondary measures | Primary contrast pre-specified; secondary measures flagged exploratory with unadjusted intervals; thresholds frozen. | Secondary findings are hypothesis-generating only. |
| Repeated-measure pseudo-replication | Case-level clustering; repetitions not treated as independent cases. | None beyond clustering assumptions. |
| Selective reporting | Null and adverse results published unchanged; amendment log records post-freeze changes. | Depends on adherence — the log makes deviation visible. |
