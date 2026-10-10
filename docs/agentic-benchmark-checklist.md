# Agentic Benchmark Checklist (ABC) — FHSR mapping

FHSR is assessed against the Agentic Benchmark Checklist (Zhu et al., arXiv:2507.02825). Each item is marked **satisfied**, **planned** (with the mechanism), or **not applicable** (with reason). Every skipped item is explained, per the checklist authors' recommendation.

Status key: ✅ satisfied · 🔜 planned · ➖ not applicable

## Task validity

| Item | Check | Status | Where / explanation |
| --- | --- | --- | --- |
| T.1 | Pin self-hosted tool versions | ✅ | The sandbox has no external self-hosted tools; tools are in-process simulation functions. Bun and TypeScript are pinned (`bun.lock`, CI pins Bun 1.3.14). |
| T.2 | API tools: service availability, rate limits | ➖ | No external API tools in the sandbox. |
| T.3 | Detect API interruptions, terminate eval | ➖ | No external API tools. |
| T.4 | Clean up legacy state between tasks | 🔜 | Each trajectory starts from a fresh case; the harness must reset all state per case (documented in `harness/README.md` responsibilities). |
| T.5 | Fully isolate agents from ground truth | ✅ | `harness/prompt.ts` projects a case to model-visible fields only; scoring fields and authoring `purpose` notes are excluded. `bun run prompt-audit` and a test enforce it. Advisory: two development correction statements still state the correct handling — cleaned at holdout authoring. |
| T.6 | Reproducible, frozen environment at release | 🔜 | Cases, harness, prompts, and analysis code are frozen and hashed before the holdout run (`artifacts/`). |
| T.7 | Verify ground-truth annotation correctness | 🔜 | Dual-clinician validation of every holdout case, adjudicated before freeze. |
| T.8 | Verify task setup correctness | ✅ | Cross-field validation (`harness/validate.ts`) plus the gold oracle below. |
| T.9 | Automatic oracle solver demonstrates solvability | ✅ | `harness/gold.ts` + `bun run gold` executes the expected transition for every committed case and asserts the scorer rates it as complete propagation. |
| T.10 | Inspect pilot outliers for implementation bugs | 🔜 | Pilot run analysis includes outlier inspection: easy-case failures (impossible tasks) and hard-case successes (shortcuts). |

## Outcome validity

| Item | Check | Status | Where / explanation |
| --- | --- | --- | --- |
| O.a.1–2 | Whole-string matching: equivalent expressions, redundant words | ➖ | No string matching. |
| O.b.1–3 | Substring matching: negation, listing-all-answers, guessing | ➖ | No substring matching. |
| O.c.1 | LLM-as-judge pilot: accuracy and self-consistency | ✅ | Judge validated against two study clinicians; repeated-label agreement ≥ 0.95; gate relative to clinician-clinician agreement. |
| O.d–O.f | Code generation testing (unit/fuzz/E2E) | ➖ | Not a code-generation benchmark. |
| O.g.1 | Ground-truth states include all achievable outcomes | 🔜 | One adjudicated canonical transition per case; per-clinician re-scoring (each clinician's individual expectations) covers outcome variation. |
| O.g.2 | State space includes relevant **and irrelevant** states | ✅ | Unaffected claims must survive; negative controls must change nothing; collateral retractions and unneeded holds are scored; audit-trail quality is a separate measure. |
| O.g.3 | State space complex enough to defeat trivial changes | ✅ | Multi-claim cases with dependency graphs, artifact chains, dispute state, and over-deference (invented-claim) scoring. |
| O.h.1 | Parser assumptions explicit | 🔜 | The extraction step is the parser; its contract and validation are preregistered (`harness/extract.ts`, protocol §8). |
| O.h.2 | Avoid success by guessing | ✅ | Multi-step state transitions and no composite score; exact propagation requires the full transition. |
| O.i.1 | Metrics strongly correlated with the task, no metric hacking | ✅ | No composite safety score; primary measures scored separately; over-deference, collateral change, and unneeded holds each fail the relevant gate. Property tests prove no single fault escapes all three primary measures. |

## Benchmark reporting

| Item | Check | Status | Where / explanation |
| --- | --- | --- | --- |
| R.1–2 | Open-source dataset and harness | ✅ | Public repo, MIT license; ACI-BENCH excerpts CC BY 4.0. |
| R.3–4 | Contamination measures | 🔜 | Development canary tokens (implemented, `harness/canary.ts`), sealed private holdout, and a documented token-overlap check procedure (protocol §5). |
| R.5–6 | Specify capability and construct validity | ✅ | Protocol §1 claim and §2 construct-validity positioning against prior work. |
| R.7 | Document mitigation efforts | ✅ | `limitations.md` and the reconsideration triggers. |
| R.8–9 | Qualitative and quantitative evidence of limitation impact | 🔜 | Preregistered sensitivity analyses (scoring rules, prompt variants, turn budget, per-clinician) and precision statements (protocol §11). |
| R.10 | Statistical significance | ✅ | Paired bootstrap by case, Wilson intervals, exact paired-test power profile; power and precision figures are computed in `analysis/stats.ts` and pinned by tests. |
| R.11 | Interpretation guidelines | ✅ | Decision thresholds (protocol §9) and precision limits. |
| R.12–13 | Baseline comparisons | ✅ | Conditions A (stateless), B (tools), D (protocol-prompt ablation) against C. |

## Open items to close before the holdout run

1. **T.5** — implemented (`harness/prompt.ts`, `bun run prompt-audit`); remaining: clean handling language out of two development correction statements before holdout authoring.
2. **T.10** — outlier-inspection step in the pilot analysis.
3. **R.3–4** — the token-overlap check implemented in `analysis/` (canary scan exists; the overlap script is planned).
4. **O.i (replacement semantics)** — linkage, status, and provenance are scored; the replacement's clinical content is not. The validated semantic judge must cover replacement and note content before the holdout run.
5. **Discrimination screening** — cases passed or failed by every model indiscriminately are flagged for re-adjudication before they count (the development pilot's negative control is queued).