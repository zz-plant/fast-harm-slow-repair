import { describe, expect, test } from "bun:test";
import { readCases } from "../harness/validate.ts";
import { publicCaseView } from "../harness/prompt.ts";
import {
  assertPromptSafe,
  buildConditionAPrompt,
  renderPrompt,
} from "../harness/runner/prompts.ts";

const evalRoot = new URL("../", import.meta.url).pathname;
const cases = readCases(`${evalRoot}data/development.jsonl`);
const canaries = cases.map((evalCase) => evalCase.canary as string);

describe("condition-A prompt construction", () => {
  for (const evalCase of cases) {
    const view = publicCaseView(evalCase);
    const prompt = renderPrompt(buildConditionAPrompt(view));

    test(`${evalCase.id} prompt carries the public content`, () => {
      expect(prompt).toContain(view.correction.statement);
      expect(prompt).toContain(view.evidence[0]!.excerpt);
      expect(prompt).toContain(view.initialState.downstreamTask.description);
      expect(prompt).toContain("REVISED CLINICAL DRAFT NOTE");
    });

    test(`${evalCase.id} prompt carries no ground truth`, () => {
      // Note: the correction event's `source` (e.g. "patient_dispute") is public
      // input — the provenance the model must interpret is the construct being
      // tested, not the hidden `authorityCondition` stratum label.
      for (const marker of [
        ...canaries,
        "expectedStateTransition",
        "unaffectedClaims",
        "affectedClaimIds",
        "artifactDependencies",
        "permissibleActions",
        "silent_rejection",
        "severityTier",
        "medication_status_or_dose",
        "not_reviewed",
        "author_authored",
      ]) {
        expect(prompt).not.toContain(marker);
      }
      expect(() => assertPromptSafe(prompt, canaries)).not.toThrow();
    });
  }

  test("assertPromptSafe throws on an injected marker", () => {
    expect(() => assertPromptSafe("innocent text severityTier: critical")).toThrow(
      /Ground-truth material leaked/
    );
    expect(() => assertPromptSafe("innocent text", ["canary-token"])).not.toThrow();
    expect(() => assertPromptSafe("contains canary-token", ["canary-token"])).toThrow(
      /Ground-truth material leaked/
    );
  });
});
