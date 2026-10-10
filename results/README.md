# Results

This directory will contain the public report and reproducibility bundle after the holdout run is complete.

## Development pilot (pre-holdout)

`dev-pilot/<timestamp>/` holds condition-A pilot runs through Cloudflare Workers AI: `trajectories.jsonl` (full records including prompts, raw outputs, extracted states, scores, and usage), `inspect-logs.jsonl`, and `summary.md`. **These are harness validation, not study results**: development cases are not clinically reviewed, the extraction step is not yet validated against clinicians, and no comparison or safety claim may be drawn from them.

## Expected holdout contents

- `report.md` — evaluated claim, method, results, and decision;
- `trajectories/` — full JSON for every run;
- `tables/` — CSV exports of rate tables and confidence intervals;
- `failure-taxonomy.json` — categorized failures;
- `reproducibility.md` — exact commands to rerun the analysis.

No results are present yet because the holdout run has not been executed.
