# Analysis

Reproducible scripts for analyzing the run matrix.

## Methods

- Paired bootstrap by case for C-versus-A and C-versus-B comparisons.
- Wilson confidence intervals for binary rates.
- Median, IQR, and bootstrapped intervals for latency and burden measures.
- Stratification by correction authority, content family, severity, model, and architecture.
- Case-level clustering so repetitions do not inflate effective sample size.
- Sensitivity analysis over extraction and scoring rules, reporting movement in primary rates.

## Precision limits

- 36 holdout cases resolve only effect sizes above roughly 9.6% with 95% confidence (0 of 36 upper bound); a perfect 36 of 36 gives a Wilson 95% lower bound of about 0.90, which does not establish the 95% gate.
- One case per authority-by-content cell leaves six cases per stratum; stratified estimates are descriptive only.
- Establishing at least 95% with 95% confidence requires about 73 holdout cases.

## Outputs

- Grouped rate tables and confidence intervals.
- Failure taxonomy counts.
- Latency and burden summaries.
- Case-level trajectory inspection page.