# Analysis

Reproducible scripts for analyzing the run matrix.

## Methods

- Paired bootstrap by case for the primary C-versus-B comparison; C-versus-A and the D ablation reported as contrasts.
- Wilson confidence intervals for binary rates.
- Median, IQR, and bootstrapped intervals for latency and burden measures.
- Stratification by correction authority, content family, severity, model, and architecture.
- Case-level clustering so repetitions do not inflate effective sample size.
- Multiplicity control: the primary comparison is pre-specified; secondary measures and strata are flagged exploratory with unadjusted intervals.

## Case discrimination screening

After any pilot or holdout run: a case that every model passes (ceiling) or no model passes (floor) carries no information about model differences and is flagged for re-adjudication before it counts. Flagged cases go to the clinicians with the observed response distribution, not just the case author's expectation — the development pilot's negative control (every model marks the disputed claim "disputed"; the case adjudicates no change) is the first queued example.

## Computed statistics

`analysis/stats.ts` derives the numbers the protocol quotes — Wilson intervals for observed rates, the perfect-run lower bound (0.9036 at 36 cases), the sample size needed for a 95% gate (73 cases), and the exact paired-test power profile (80% power at ~21.5 points; 0.92 at 25 points if direction is consistent, 0.61 at a 90/10 split). `tests/stats.test.ts` pins them, so the documents cannot drift from the mathematics.

## Sensitivity analyses (preregistered)

- Extraction and scoring rules: re-score under alternative rules and report movement in primary rates.
- Prompt variants: at least two per condition; report rate movement across variants.
- Turn budget: re-score recovery at 1, 2, 3, and 5 turns.
- Per-clinician expectations: re-score under each clinician's individual expected transitions versus the adjudicated ones.
- Extraction-certain subset: report primary rates on the full holdout and on the subset both clinicians rated as faithfully extracted.

## Contamination checks

- Canary scan (`harness/canary.ts`): flag any holdout trajectory reproducing a development canary verbatim.
- Token-overlap screen (planned script): overlap of holdout trajectories with the public development set and source corpus; record each model's training-data cutoff and report flagged examples.

## Annotation reliability

- Cohen's κ and Krippendorff's α for clinician labels (expected transitions, severity, artifact-change decisions), alongside raw agreement.

## Reporting

- Inference cost per trajectory (tokens and USD) reported alongside success, per the τ-bench convention, with uncertainty.
- Equity/subgroup analysis is out of v0.1 scope (synthetic data lacks demographics); stated in the report.

## Power and precision limits

- A perfect 36 of 36 gives a Wilson 95% lower bound of about 0.90; 0 of 36 rules out only rates above about 9.6% with 95% confidence.
- With 36 paired cases, a paired difference is detectable at 80% power only on the order of 20–25 percentage points; smaller differences are labeled unresolved.
- One case per authority-by-content cell leaves six cases per stratum; stratified estimates are descriptive only.
- Establishing at least 95% with 95% confidence requires about 73 holdout cases.

## Outputs

- Grouped rate tables and confidence intervals.
- Failure taxonomy counts.
- Latency and burden summaries.
- Case-level trajectory inspection page.