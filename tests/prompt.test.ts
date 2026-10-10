import { describe, expect, test } from "bun:test";
import { readCases } from "../harness/validate.ts";
import {
  auditPromptLeakage,
  findExcludedKeys,
  flagCorrectionStatement,
  publicCaseView,
} from "../harness/prompt.ts";

const evalRoot = new URL("../", import.meta.url).pathname;
const cases = readCases(`${evalRoot}data/development.jsonl`);

type Json = Record<string, any>;

/**
 * Ground-truth mutations. If the prompt view is truly isolated, changing any
 * of these must not change what the model sees.
 */
const groundTruthMutations: Array<{ name: string; mutate: (kase: Json) => Json }> = [
  {
    name: "flipped expected claim transitions",
    mutate: (kase) => ({
      ...kase,
      expectedStateTransition: {
        ...kase.expectedStateTransition,
        claimTransitions: kase.expectedStateTransition.claimTransitions.map((t: Json) => ({
          ...t,
          status: t.status === "active" ? "disputed" : "active",
        })),
      },
    }),
  },
  { name: "emptied affected claims", mutate: (kase) => ({ ...kase, affectedClaims: [] }) },
  { name: "emptied unaffected claims", mutate: (kase) => ({ ...kase, unaffectedClaims: [] }) },
  { name: "emptied artifact dependencies", mutate: (kase) => ({ ...kase, artifactDependencies: [] }) },
  {
    name: "emptied permissible and forbidden actions",
    mutate: (kase) => ({ ...kase, permissibleActions: [], forbiddenActions: [] }),
  },
  { name: "raised severity", mutate: (kase) => ({ ...kase, severityTier: "critical" }) },
  { name: "changed authority", mutate: (kase) => ({ ...kase, authorityCondition: "patient_dispute" }) },
  {
    name: "changed content family",
    mutate: (kase) => ({ ...kase, contentFamily: "medication_status_or_dose" }),
  },
  { name: "changed turn budget", mutate: (kase) => ({ ...kase, maxRecourseTurnBudget: 99 }) },
  { name: "changed canary", mutate: (kase) => ({ ...kase, canary: "leak-test-canary" }) },
  {
    name: "rewritten authoring purpose notes",
    mutate: (kase) => ({
      ...kase,
      sourceEvidenceSpans: kase.sourceEvidenceSpans.map((s: Json) => ({
        ...s,
        purpose: "MUST NOT PROPAGATE - GROUND TRUTH",
      })),
    }),
  },
  {
    name: "changed validation and construction metadata",
    mutate: (kase) => ({
      ...kase,
      constructionStatus: "ground_truth_injection",
      evidenceLabels: ["ground_truth"],
    }),
  },
];

describe("prompt-isolation contract (ABC T.5)", () => {
  for (const evalCase of cases) {
    test(`${evalCase.id} exposes no scoring field to the model`, () => {
      const view = publicCaseView(evalCase);
      expect(findExcludedKeys(view)).toEqual([]);

      const text = JSON.stringify(view);
      // Ground-truth values must not survive serialization either.
      expect(text).not.toContain("expectedStateTransition");
      expect(text).not.toContain("affectedClaimIds");
      expect(text).not.toContain("unaffectedClaims");
      for (const forbiddenAction of [
        "silent_rejection",
        "unqualified_proceed",
        "false_closure",
        "fabricated_evidence",
      ]) {
        expect(text).not.toContain(forbiddenAction);
      }
      // The authoring `purpose` field states the correct handling; only excerpts remain.
      for (const span of view.evidence) {
        expect("purpose" in span).toBe(false);
      }
      expect(text).not.toContain("Negative-control");
      expect(text).not.toContain("Wrong-correction");
    });
  }

  test("recursive scan finds nested scoring fields", () => {
    const leaked = { initialState: { claims: [{ expectedStateTransition: {} }] } };
    expect(findExcludedKeys(leaked)).toContain("expectedStateTransition");
  });

  test("flags a correction statement that states the handling", () => {
    const terms = flagCorrectionStatement(
      "This requires review rather than automatic retraction; do not propagate."
    );
    expect(terms).toContain("requires review");
    expect(terms).toContain("do not ");
  });

  test("audits every committed case and returns one record per case", () => {
    const records = auditPromptLeakage(cases);
    expect(records).toHaveLength(cases.length);
    for (const record of records) {
      expect(record.excludedKeysFound).toEqual([]);
    }
  });

  describe("counterfactual invariance", () => {
    for (const evalCase of cases) {
      const original = publicCaseView(evalCase);
      for (const mutation of groundTruthMutations) {
        test(`${evalCase.id}: ${mutation.name} does not change the prompt view`, () => {
          expect(publicCaseView(mutation.mutate(evalCase))).toEqual(original);
        });
      }
    }
  });
});
