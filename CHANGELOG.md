# Changelog

Release scheme: semantic versioning of the protocol as one artifact. The preregistration, holdout manifest, prompts, and analysis code are hashed and frozen at the holdout run (see `artifacts/`); the frozen scoring script is versioned with each release. A DOI is assigned at publication.

## 0.1.0 — draft (unreleased)

Initial draft protocol and harness. Not preregistered (`preregisteredAt` is `null`); holdout not sealed.

### Added

- Protocol and preregistration: claim, controlled conditions A–D, 12 development / 36 sealed holdout cases, clinician validation, decision thresholds, statistical plan.
- Case and state JSON Schemas; deterministic scorer; cross-field validation.
- Extraction-first scoring with `correctionAcknowledged` and audit-trail quality as a separate measure.
- Unaffected-claim preservation, collateral-retraction, and unneeded-hold scoring; negative controls; over-deference (invented-claim) safety rule.
- Clinician-relative grader gate; pass³ consistency; power, multiplicity, and sensitivity commitments.
- Contamination canaries; de-identified `aci-*` case and event IDs.
- Gold oracle trajectory executor (`bun run gold`, ABC T.9); Inspect eval-log serializer; canary scanner.
- Standards documents: ABC mapping, TRIPOD-LLM map, FDA comment draft; this changelog.
- CI (typecheck, validate, tests) on push and pull request.
- Prompt-isolation contract (`harness/prompt.ts`) with `bun run prompt-audit` and tests (ABC T.5): scoring fields and authoring `purpose` notes never reach a prompt. The audit surfaced handling language in two development correction statements (advisory, to clean at holdout authoring).
- Leakage model (`docs/leakage-model.md`): structural, functional, lexical, and semantic leakage classes with detectors; counterfactual-invariance tests prove the prompt view is a function of permitted inputs alone.
- Scorer specification property tests (`tests/scorer-properties.test.ts`): permutation invariance, audit-log irrelevance, and single-fault sensitivity (no single violation escapes all three primary measures).
- `analysis/stats.ts`: the protocol's statistics (Wilson bounds, required sample size, exact paired-test power) computed and pinned by tests instead of asserted; protocol and prereg numbers updated to the computed values (80% power at ~21.5 points, 0.92 at 25 points, direction-consistency fragility).
- Cloudflare Workers AI pilot runner (`bun run pilot`): condition A through SOTA models on the development cases, with prompt-leakage guarding, canary scanning, one fixed extractor model, Inspect-log export, and neuron accounting. Development-pilot outputs live in `results/dev-pilot/` and are labeled harness validation, not study data.
- Extraction step implemented (`harness/extract.ts`): condition-A prose converted to structured state by a fixed extractor model under the same leakage discipline (ground truth never reaches extraction); unparseable output is scored conservatively as a failure per `docs/estimand.md`.
- Replacement-linkage scoring, found by the pilot: exact-identifier matching made complete propagation structurally unsatisfiable for every arm on replacement cases. Replacement transitions are now satisfied by a linked new claim with correction provenance; a "replacement" linked to a claim expected disputed stays unsafe (over-deference boundary preserved and pinned by tests).
- False-closure enforcement (`expectedDisputeStatus` on cases, enforced by the scorer), found by the pilot: the negative control rewarded "resolved, no change needed" over the honest "under review" answer. Resolving a review-expected dispute is now false closure under preregistered criterion 6; the case schema, the three development cases, the gold oracle, and property tests carry the field.
- Runner hardening from pilot evidence: eval token budget raised to 4096 (a 1500 cap scored thinking-model truncation as unsafe persistence), model-call failures flagged apart from extraction failures, empty-content rate reported per model, and progress lines carry failure reasons. clef-omni is excluded pending an adapter for its agent-style /ai/run contract.
- Extraction robustness (second pilot round): per-minute rate limits now back off 20/45/60s instead of burning retries in seconds; `parseJsonObject` rescues thinking-then-answer replies by scanning for the last balanced JSON object; extraction retries once through a non-thinking fallback model (llama-4-scout) when the thinking primary returns unparseable or schema-invalid output, with a validation-repair pass feeding schema errors back to the extractor; recovery paths are recorded in trajectory notes. Eval calls get a 240s timeout for thinking models at the 4096 budget.
- Discrimination screening: cases passed or failed by every model indiscriminately are flagged for re-adjudication before they count; the pilot's negative control (all models mark the disputed claim disputed) is queued for clinician review.
- Formal estimand and intercurrent-event handling (`docs/estimand.md`).
- Threats-to-validity analysis (`docs/threats-to-validity.md`).
- Ethics and data governance (`ETHICS.md`); amendment log (`AMENDMENTS.md`).
- Registration, run-budget/stopping-rule, and publish-regardless commitments.

### Fixed

- Unsafe-persistence metric no longer evadable by missing task provenance or inconsistent proceeded actions.
- Condition A no longer fails complete propagation by construction (extraction-first scoring).
- Grader gate made clinician-relative instead of an unreachable absolute threshold.
- "Retract everything / empty the note / hold every task" no longer scores as success.

## Upcoming

- 0.2.0: 12 development cases complete, prompts + prompt-variant isolation test (ABC T.5), pilot runs.
- 1.0.0: holdout sealed and hashed, clinician validation complete, frozen analysis, public report.