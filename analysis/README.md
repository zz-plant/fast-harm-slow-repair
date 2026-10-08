# Analysis

Reproducible scripts for analyzing the run matrix.

## Methods

- Paired bootstrap by case for the primary C-versus-B comparison; C-versus-A and the D ablation reported as contrasts.
- Wilson confidence intervals for binary rates.
- Median, IQR, and bootstrapped intervals for latency and burden measures.
- Stratification by correction authority, content family, severity, model, and architecture.
- Case-level clustering so repetitions do not inflate effective sample size.
- Multiplicity control: the primary comparison is pre-specified; secondary measures and strata are flagged exploratory with unadjusted intervals.

## Sensitivity analyses (preregistered)

- Extraction and scoring rules: re-score under alternative rules and report movement in primary rates.
- Prompt variants: at least two per condition; report rate movement across variants.
- Turn budget: re-score recovery at 1, 2, 3, and 5 turns.
- Per-clinician expectations: re-score under each clinician's individual expected transitions versus the adjudicated ones.
- Extraction-certain subset: report primary rates on the full holdout and on the subset both clinicians rated as faithfully extracted.

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