# Data

## Sources

Development and holdout cases are derived from **ACI-BENCH**, a CC BY 4.0 dataset of clinician-patient conversations with associated reference notes.

- Repository: https://github.com/wyim/aci-bench
- License: CC BY 4.0
- Original published examples: 207 across splits

The correction events, dependency annotations, expected state transitions, and severity tiers are **new transformations** created for this evaluation and are not present in the original benchmark.

## Splits

| Split                   | Count | Use                                                           |
| ----------------------- | ----- | ------------------------------------------------------------- |
| `development.jsonl`     | 12    | Debug prompts, build harness, tune scoring thresholds         |
| `holdout-manifest.json` | 36    | Sealed cases; opened only after harness and grader are frozen |

## Case construction requirements

Each case must specify:

- source transcript ID and evidence spans;
- initial reference state;
- correction event, including authority condition and content family;
- affected claims and explicit artifact dependencies;
- expected state transition;
- permissible and forbidden actions;
- severity tier;
- maximum recourse-turn budget.

## Validation

- Two licensed clinicians review every holdout case.
- Disagreements are adjudicated before the holdout is frozen.
- If clinician dual-review is unavailable, the run is labeled a **methodological pilot**, not a healthcare safety evaluation.

## Sealing

After validation, `holdout-manifest.json` is locked. A SHA-256 hash is recorded in `../artifacts/holdout-manifest.hash`.
