# Draft comment — FDA discussion paper on generative AI-enabled medical devices

**Docket:** FDA-2026-N-7874
**Comment deadline:** 19 October 2026
**Status:** DRAFT — not filed. Review for accuracy against the discussion paper before submitting (this draft was written from FDA's announcement and secondary summaries, not the paper itself).

---

## 1. Identification

Comment submitted on behalf of the Fast Harm, Slow Repair evaluation (a non-clinical benchmark for correction and rollback failures in healthcare AI documentation workflows). Contact: [author email].

## 2. Supporting the competency-assessment concept

The proposed "competency assessment" made of non-clinical benchmarking plus clinical confirmation, with periodic re-benchmarking after market, is the right structure for generative AI documentation and care-coordination devices. We support it and offer one concrete benchmark category for the non-clinical component: **correction failure** — whether a system, after its record becomes wrong, propagates a contradicted claim or dependent action, or recovers correctly.

## 3. What non-clinical benchmarking for correction failures should measure

- **Unsafe persistence**: a contradicted claim stays active, or a dependent action proceeds from it, after an authoritative correction.
- **Propagation completeness**: affected claims reach the evidence-appropriate state, dependent artifacts update or hold, in-flight actions roll back, provenance points to the correction, and the dispute is not falsely closed.
- **Over-deference**: a system blindly accepting a correction that conflicts with stronger evidence, and acting on a claim the correction alone invented.
- **Human burden**: corrections the clinician must repeat and review minutes.

These are measurable in a simulated environment with no real records touched, and they map to standard EHR concepts (entered-in-error, refuted verification status, tasks on hold/cancelled, provenance).

## 4. Suggestions for the assessment framework

1. Define correction/rollback scenarios as a distinct non-clinical competency, alongside accuracy and harm-prevention competencies.
2. Require periodic re-benchmarking of correction performance, since failure rates are instruction-sensitive (a deployed-scribe audit found the verified-error share moved from 9% to 79% when only the review instruction changed).
3. Where benchmarking uses clinician labels, report agreement and set any automated-judge gate relative to clinician-clinician agreement rather than an absolute threshold.
4. Keep holdout cases sealed and require contamination checks (canary tokens, token-overlap screening).

## 5. Conclusion

A non-clinical benchmark for correction failure — as proposed by Fast Harm, Slow Repair — fits the competency-assessment framework and can be run before market, cheaply and without touching real records. We request that correction and rollback scenarios be explicitly included as a competency category, with periodic re-benchmarking after market.

---

*Filed on the docket at https://www.regulations.gov/commenton/FDA-2026-N-7874. Verify the docket number and the paper's proposals before submitting.*