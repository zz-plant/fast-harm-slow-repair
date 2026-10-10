# TRIPOD-LLM reporting map

TRIPOD-LLM adapts the TRIPOD-AI reporting guideline to studies using large language models. FHSR is a **capability evaluation**, not a prediction-model development study, so TRIPOD-LLM items are mapped where they apply and marked N/A where they do not; this draft is mapped against the TRIPOD-AI item structure and is finalized against the published TRIPOD-LLM checklist at report time. The report is structured to satisfy TRIPOD-LLM, with the Agentic Benchmark Checklist appendix in `docs/agentic-benchmark-checklist.md`.

Status key: ✅ satisfied · 🔜 planned · ➖ not applicable

| # | Domain | Item | Status | Where |
| --- | --- | --- | --- | --- |
| 1 | Title | Identify the study as a prediction/LLM model study | ✅ | Report title "Fast Harm, Slow Repair" with subtitle; framed as a system evaluation, not a prediction model. |
| 2 | Abstract | Summarize objectives, methods, results, conclusions | 🔜 | Public report abstract (planned). |
| 3 | Abstract | Structured summary | 🔜 | Planned. |
| 4 | Intro | Explain the medical/clinical context | ✅ | Protocol §1–2; scribe-census failure mode as the construct. |
| 5 | Intro | Objectives and hypotheses | ✅ | Protocol §1 (primary claim + secondary hypotheses). |
| 6 | Methods | Source of data | ✅ | Protocol §5: ACI-BENCH + new correction transformations. |
| 7 | Methods | Participants/records description | ✅ | Simulated records; no real patients (protocol §3). |
| 8 | Methods | Outcome definition | ✅ | Primary measures + success criteria (protocol §1, §8). |
| 9 | Methods | Predictors/model inputs | ➖ | Not a prediction model; inputs are evidence events + correction. |
| 10 | Methods | Sample size | ✅ | 36 holdout cases with power statement (protocol §11). |
| 11 | Methods | Missing data | ➖ | Simulated data; no missing data mechanism. |
| 12 | Methods | Model development | ➖ | Evaluated systems are pre-existing architectures, not trained here. |
| 13 | Methods | Model specification | ✅ | Conditions A–D, tools, prompts, models, run settings (protocol §3–4, §7). |
| 14 | Methods | Training/development vs evaluation split | ✅ | 12 development / 36 sealed holdout; revision only against development cases (protocol §5, §14). |
| 15 | Methods | Performance measures | ✅ | Primary + secondary measures reported separately (protocol §8). |
| 16 | Methods | Model evaluation: internal validation | ✅ | Three repetitions, pass³ consistency (protocol §7). |
| 17 | Methods | Model evaluation: external validation | ➖ | Out of scope; stated in limitations (no external site/cohort). |
| 18 | Methods | Bias/equity considerations | 🔜 | Stated in protocol §5: the synthetic ACI-derived data cannot support demographic subgroup analysis; a deployment-facing equity review is out of v0.1 scope (see `limitations.md`). |
| 19 | Methods | LLM-specific: prompt construction and variability | 🔜 | Prompt variants preregistered (protocol §7); prompt-schema isolation of ground truth per ABC T.5. |
| 20 | Methods | LLM-specific: judge/scorer validation | ✅ | Clinician-relative grader gate (protocol §10); deterministic scorer + audit-trail quality. |
| 21 | Methods | Statistical analysis | ✅ | Protocol §11: paired bootstrap, Wilson, multiplicity, sensitivity. |
| 22 | Results | Participants/records flow | 🔜 | Trajectory counts and per-condition flow (planned). |
| 23 | Results | Model performance with uncertainty | 🔜 | Rates + Wilson intervals, power-labeled differences (planned). |
| 24 | Results | Model comparison | 🔜 | C-vs-B primary, A/D contrasts (planned). |
| 25 | Discussion | Interpretation, limitations, generalizability | ✅ | `limitations.md` + protocol §2 distinct ground. |
| 26 | Other | Supplementary material, reproducibility | 🔜 | `results/` JSON/CSV, Inspect logs, reproducibility bundle (protocol §13). |
| 27 | Other | Funding and conflicts | 🔜 | To state at publication. |

The full item-by-item mapping is finalized when the report is written; this draft tracks each item to a repository location so nothing is left implicit.