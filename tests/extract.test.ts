import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readCases } from "../harness/validate.ts";
import { publicCaseView } from "../harness/prompt.ts";
import { goldCaseFromJson, toEvalCaseInput } from "../harness/gold.ts";
import { scoreRun } from "../harness/scorer.ts";
import {
  extractFinalState,
  parseJsonObject,
  type ExtractorChat,
} from "../harness/extract.ts";

const evalRoot = new URL("../", import.meta.url).pathname;
const cases = readCases(`${evalRoot}data/development.jsonl`);
const dev001 = cases.find((c) => c.id === "aci-dev-001")!;
const view = publicCaseView(dev001);
const goldCase = goldCaseFromJson(dev001);
const evalInput = toEvalCaseInput(goldCase);

/** A perfect dev-001 extraction, derived from the published recovered-A fixture. */
const fixture = JSON.parse(
  readFileSync(join(evalRoot, "harness/fixtures/dev-001-recovered-A.json"), "utf8")
);
const perfectExtraction = {
  correctionAcknowledged: fixture.correctionAcknowledged,
  claims: fixture.currentRecord.claims,
  clinicalDraftNote: fixture.clinicalDraftNote,
  patientFacingSummary: fixture.patientFacingSummary,
  downstreamTask: {
    status: fixture.downstreamTask.status,
    derivedFromClaimIds: fixture.downstreamTask.derivedFromClaimIds,
  },
  actionStatus: fixture.actionStatus,
  dispute: fixture.dispute,
};

function mockChat(text: string): ExtractorChat {
  return async () => ({
    model: "mock",
    text,
    rawContent: text,
    reasoningText: null,
    channel: "content" as const,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    neurons: 0,
  });
}

const deps = (text: string) => ({ chat: mockChat(text), extractorModel: "mock" });

describe("extraction step", () => {
  test("a faithful extraction of a recovered rewrite scores as complete propagation", async () => {
    const outcome = await extractFinalState(deps(JSON.stringify(perfectExtraction)), {
      caseId: "aci-dev-001",
      condition: "A",
      view,
      raw: { kind: "prose", text: "REVISED CLINICAL DRAFT NOTE: Continue the prior dose..." },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const score = scoreRun(evalInput, outcome.state);
    expect(score.primary.unsafePersistence).toBe(false);
    expect(score.primary.completeCorrectionPropagation).toBe(true);
    expect(score.primary.successfulRecoveryWithinTurnBudget).toBe(true);
    // The assembled state must score identically to the published fixture.
    expect(score).toEqual(scoreRun(evalInput, fixture));
  });

  test("markdown-fenced JSON is tolerated", async () => {
    const fenced = "```json\n" + JSON.stringify(perfectExtraction, null, 2) + "\n```";
    const outcome = await extractFinalState(deps(fenced), {
      caseId: "aci-dev-001",
      condition: "A",
      view,
      raw: { kind: "prose", text: "..." },
    });
    expect(outcome.ok).toBe(true);
  });

  test("unparseable extractor output is a recorded failure, never a bypass", async () => {
    const outcome = await extractFinalState(deps("I cannot produce that."), {
      caseId: "aci-dev-001",
      condition: "A",
      view,
      raw: { kind: "prose", text: "..." },
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toContain("unparseable");
  });

  test("an extracted state that violates the schema is rejected", async () => {
    const broken = { ...perfectExtraction, claims: [{ ...perfectExtraction.claims[0], replacementId: "claim-not-in-record" }] };
    const outcome = await extractFinalState(deps(JSON.stringify(broken)), {
      caseId: "aci-dev-001",
      condition: "A",
      view,
      raw: { kind: "prose", text: "..." },
    });
    expect(outcome.ok).toBe(false);
  });

  test("trace output passes through after validation", async () => {
    const outcome = await extractFinalState(deps("unused"), {
      caseId: "aci-dev-001",
      condition: "A",
      view,
      raw: { kind: "trace", state: fixture },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.state).toEqual(fixture);
  });

  test("parseJsonObject finds JSON in noisy text", () => {
    expect(parseJsonObject('prefix {"a": 1} suffix')).toEqual({ a: 1 });
    expect(parseJsonObject("```json\n{\"a\": [1]}\n```")).toEqual({ a: [1] });
    expect(parseJsonObject("no json here")).toBeNull();
  });

  test("parseJsonObject rescues thinking-then-answer replies", () => {
    const thinking =
      "Let me analyze the system output carefully. The record has two claims and the note was revised. " +
      'I will structure the JSON as {"a": "template"} and then produce the final answer. ' +
      'Final answer: {"correctionAcknowledged": true, "claims": []}';
    expect(parseJsonObject(thinking)).toEqual({ correctionAcknowledged: true, claims: [] });
  });

  test("parseJsonObject takes the last balanced object when prose spans multiple", () => {
    expect(parseJsonObject('first {"x": 1} then more prose {"y": 2}')).toEqual({ y: 2 });
  });

  test("backwards replacement linkage is sanctioned in both directions", async () => {
    // The extractor may hang replacementId on the new claim pointing back at
    // the superseded one; the scorer must still sanction it (pilot finding:
    // this coin flip flipped complete propagation on identical model output).
    const backwards = JSON.parse(JSON.stringify(perfectExtraction));
    const retracted = backwards.claims.find(
      (c: any) => c.id === "claim-lisinopril-40mg"
    );
    const replacement = backwards.claims.find(
      (c: any) => c.id === "claim-lisinopril-prior-dose"
    );
    delete retracted.replacementId;
    replacement.replacementId = "claim-lisinopril-40mg";
    const outcome = await extractFinalState(deps(JSON.stringify(backwards)), {
      caseId: "aci-dev-001",
      condition: "A",
      view,
      raw: { kind: "prose", text: "..." },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const score = scoreRun(evalInput, outcome.state);
    expect(score.primary.completeCorrectionPropagation).toBe(true);
  });

  test("parseJsonObject handles braces inside string values", () => {
    expect(parseJsonObject('note: "use } carefully" {"a": {"b": 1}}')).toEqual({
      a: { b: 1 },
    });
  });

  test("a failed primary extraction is recovered by the fallback model", async () => {
    const calls: string[] = [];
    const chat: ExtractorChat = async (model) => {
      calls.push(model);
      const text =
        model === "primary-thinking"
          ? "Let me analyze the system output carefully... (never emits JSON)"
          : JSON.stringify(perfectExtraction);
      return {
        model,
        text,
        rawContent: text,
        reasoningText: null,
        channel: "content" as const,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        neurons: 0,
      };
    };
    const outcome = await extractFinalState(
      { chat, extractorModel: "primary-thinking", fallbackExtractorModel: "fallback-plain" },
      { caseId: "aci-dev-001", condition: "A", view, raw: { kind: "prose", text: "..." } }
    );
    expect(calls).toEqual(["primary-thinking", "fallback-plain"]);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.notes.join(" ")).toContain("recovered by fallback");
    const score = scoreRun(evalInput, outcome.state);
    expect(score.primary.completeCorrectionPropagation).toBe(true);
  });

  test("both extractors failing reports both reasons", async () => {
    const outcome = await extractFinalState(
      { chat: mockChat("garbage"), extractorModel: "primary-thinking", fallbackExtractorModel: "fallback-plain" },
      { caseId: "aci-dev-001", condition: "A", view, raw: { kind: "prose", text: "..." } }
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toContain("primary");
    expect(outcome.reason).toContain("fallback");
  });

  test("a schema-invalid fallback output gets one validation-repair pass", async () => {
    let calls = 0;
    const chat: ExtractorChat = async (model) => {
      calls += 1;
      const text =
        model === "primary-thinking"
          ? "thinking prose, never emits JSON"
          : calls === 2
            ? JSON.stringify({
                ...perfectExtraction,
                downstreamTask: { ...perfectExtraction.downstreamTask, status: "on_hold" },
              })
            : JSON.stringify(perfectExtraction);
      return {
        model,
        text,
        rawContent: text,
        reasoningText: null,
        channel: "content" as const,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        neurons: 0,
      };
    };
    const outcome = await extractFinalState(
      { chat, extractorModel: "primary-thinking", fallbackExtractorModel: "fallback-plain" },
      { caseId: "aci-dev-001", condition: "A", view, raw: { kind: "prose", text: "..." } }
    );
    expect(calls).toBe(3); // primary, fallback, fallback repair
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.notes.join(" ")).toContain("validation-repair");
  });
});
