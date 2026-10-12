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
const canaries = cases.map((evalCase) => evalCase.canary ?? "");

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
      expect(() => assertPromptSafe(view, prompt, canaries)).not.toThrow();
    });
  }

  test("ordinary clinical prose does not trip the guard", () => {
    // The P2 from the PR-5 review: "split", "purpose", and "canary" are
    // ordinary English words. They are checked as object keys in the projected
    // view, never as raw text substrings, so prose like this cannot abort a
    // pilot run.
    const view = publicCaseView(cases[0]!);
    const prose =
      "the purpose of this medication is symptom control; split the dose; a canary in a coal mine; the plan's split into two visits";
    expect(() => assertPromptSafe(view, prose)).not.toThrow();
  });

  test("a forbidden key anywhere in the projected view throws", () => {
    const leaked = {
      ...publicCaseView(cases[0]!),
      initialState: {
        ...publicCaseView(cases[0]!).initialState,
        authorityCondition: "clinician_correction",
      },
    } as never;
    expect(() => assertPromptSafe(leaked, "innocent text")).toThrow(/authorityCondition/);
  });

  test("assertPromptSafe throws on an injected distinctive marker", () => {
    const view = publicCaseView(cases[0]!);
    expect(() => assertPromptSafe(view, "innocent text severityTier: critical")).toThrow(
      /Ground-truth material leaked/
    );
    expect(() => assertPromptSafe(view, "innocent text", ["canary-token"])).not.toThrow();
    expect(() => assertPromptSafe(view, "contains canary-token", ["canary-token"])).toThrow(
      /Ground-truth material leaked/
    );
  });
});
