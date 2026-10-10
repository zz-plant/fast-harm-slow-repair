# Ethics and data governance

## Human-subjects determination

This evaluation is **not human-subjects research**. Cases are simulated transformations of a public dataset; no patients, no protected health information, and no live clinical systems are involved. The determination should be confirmed with the relevant institutional review board or ethics board before the holdout run and the outcome recorded here. If the reviewing body disagrees, the run does not proceed until its conditions are met.

## Data

- **Source:** ACI-BENCH, licensed **CC BY 4.0**; each case carries its source commit and citation (`sourceDataset`).
- **Additions:** correction events, dependency annotations, expected transitions, and severity tiers are new transformations authored for this evaluation; they are released under the repository license.
- No restricted or identifiable data is redistributed. Excerpts remain under the source dataset's terms.

## Clinician participants

- Licensed clinicians take part voluntarily and may withdraw.
- Their role (independent review, adjudication, human baseline) is disclosed; attribution or anonymization follows their stated preference.
- Honoraria are budgeted (see `protocol.md` §14).
- They handle only the published dataset and authored cases — no patient data beyond what is already public in ACI-BENCH.

## Dual use

The benchmark measures a safety failure mode (unsafe persistence after correction). It provides no attack capability, no exploit code, and no model weights. Public release is assessed as net-safety-positive; this assessment is revisited if the case content changes character.

## Claims and publication

- No regulatory clearance is implied; no autonomous clinical-safety claim is made.
- Results are published regardless of direction; null and adverse results are reported unchanged.
- The report states the intended use, the validated scope, and the limits in `limitations.md`.
