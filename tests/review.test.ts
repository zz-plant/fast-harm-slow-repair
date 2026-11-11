import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { caseSchema, type EvalCase } from "../schemas/types.ts";
import { readCases } from "../harness/validate.ts";
import {
  ACTION_STATUSES,
  ARTIFACTS,
  DISPUTE_STATUSES,
  SEVERITY_TIERS,
  TASK_STATUSES,
  validateReviewForm,
  type ReviewForm,
} from "../harness/review/form.ts";
import {
  PART_2_HEADING,
  SEVERITY_RUBRIC,
  blankForm,
  renderPart1,
  renderPart2,
  renderSheet,
  writeReviewFiles,
} from "../harness/review/sheet.ts";
import {
  agreementReport,
  cohensKappa,
  linearWeightedKappa,
  pairForms,
  type LoadedForm,
} from "../harness/review/agree.ts";

const path = (relative: string) => fileURLToPath(new URL(`../${relative}`, import.meta.url));
const cases = readCases(path("data/development.jsonl"));
const caseById = (id: string) => cases.find((evalCase) => evalCase.id === id)!;

const other = <T>(values: readonly T[], current: T | undefined): T =>
  values.find((value) => value !== current)!;

/**
 * The same case with every author answer changed: everything the review
 * sheet's Part 1 must not depend on. Part 1 is blind only if it reads the
 * same either way.
 */
function withOtherAuthorAnswers(evalCase: EvalCase): EvalCase {
  const changed = structuredClone(evalCase) as Record<string, any>;
  const claimIds = evalCase.initialReferenceState.claims.map((claim) => claim.id);
  const flipped = claimIds.filter((id) => !evalCase.affectedClaims.includes(id));
  const transition = evalCase.expectedStateTransition;
  changed.severityTier = other(SEVERITY_TIERS, evalCase.severityTier);
  changed.expectedDisputeStatus = other(DISPUTE_STATUSES, evalCase.expectedDisputeStatus);
  changed.affectedClaims = flipped;
  changed.correctionEvent.affectedClaimIds = flipped;
  changed.unaffectedClaims = [...evalCase.affectedClaims];
  changed.artifactDependencies = ARTIFACTS.map((artifact) => ({ artifact, dependsOnClaimIds: flipped }));
  changed.expectedStateTransition = {
    claimTransitions: [
      ...claimIds.map((claimId) => ({ claimId, status: "disputed" })),
      { claimId: "claim-mutated-replacement", status: "active" },
    ],
    retractedClaimIds: [],
    updatedArtifacts: [],
    downstreamTaskStatus: other(TASK_STATUSES, transition.downstreamTaskStatus),
    actionStatus: other(ACTION_STATUSES, transition.actionStatus),
    requiredAuditEventTypes: ["mutated_event"],
  };
  changed.sourceEvidenceSpans = evalCase.sourceEvidenceSpans.map((span) => ({
    ...span,
    purpose: "Mutated purpose note.",
  }));
  changed.constructionStatus = "mutated_construction";
  changed.authorityCondition = other(caseSchema.properties.authorityCondition.enum, evalCase.authorityCondition);
  changed.contentFamily = other(caseSchema.properties.contentFamily.enum, evalCase.contentFamily);
  changed.permissibleActions = ["proceed_after_update"];
  changed.forbiddenActions = [];
  changed.maxRecourseTurnBudget = 9;
  changed.canary = "mutated-canary";
  changed.evidenceLabels = ["mutated"];
  changed.clinicalValidation = { status: "adjudicated", reviewerCount: 2, note: "Mutated." };
  return changed as EvalCase;
}

/** Everything a reviewer can read before Part 2, with the sheet fingerprint masked. */
const beforePart2 = (sheet: string) => {
  const end = sheet.indexOf(PART_2_HEADING);
  expect(end).toBeGreaterThan(0);
  return sheet.slice(0, end).replace(/[a-f0-9]{64}/g, "<fingerprint>");
};

/** A form filled with neutral test values (not clinical answers). */
function filledForm(evalCase: EvalCase, initials: string, edit?: (form: ReviewForm) => void): ReviewForm {
  const { sheetSha256 } = renderSheet(evalCase);
  const form = structuredClone(blankForm(evalCase, sheetSha256)) as unknown as ReviewForm;
  form.reviewerInitials = initials;
  form.licenceType = "MD";
  form.minutesSpent = 10;
  form.part1.correctionUnambiguous = true;
  for (const claimId of Object.keys(form.part1.claimTransitions)) {
    form.part1.claimTransitions[claimId] = "active";
  }
  for (const artifact of ARTIFACTS) {
    form.part1.artifactMustChange[artifact] = false;
    form.part2.artifactDependencies[artifact].matchesEvidence = true;
  }
  for (const check of Object.values(form.part2.unaffectedClaimListing)) check.matchesEvidence = true;
  form.part1.downstreamTaskStatus = "pending";
  form.part1.actionStatus = "pending";
  form.part1.expectedDisputeStatus = "under_review";
  form.part1.severityTier = "standard";
  edit?.(form);
  return form;
}

describe("review sheet: Part 1 is blind to the author's answers", () => {
  for (const evalCase of cases) {
    const changed = withOtherAuthorAnswers(evalCase);

    test(`${evalCase.id}: Part 1 and the blank form read the same when every author answer changes`, () => {
      expect(renderPart1(changed)).toBe(renderPart1(evalCase));
      expect(beforePart2(renderSheet(changed).text)).toBe(beforePart2(renderSheet(evalCase).text));
      expect(blankForm(changed, "fingerprint")).toEqual(blankForm(evalCase, "fingerprint"));
      // The change is real: Part 2, which shows the author's annotations, moves.
      expect(renderPart2(changed)).not.toBe(renderPart2(evalCase));
    });

    test(`${evalCase.id}: the sheet and form carry none of the author's distinctive values`, () => {
      const { text, sheetSha256 } = renderSheet(evalCase);
      const formText = JSON.stringify(blankForm(evalCase, sheetSha256));
      const initialIds = new Set(evalCase.initialReferenceState.claims.map((claim) => claim.id));
      const markers = [
        evalCase.canary ?? "",
        evalCase.constructionStatus ?? "",
        evalCase.contentFamily,
        ...evalCase.sourceEvidenceSpans.map((span) => span.purpose),
        ...evalCase.expectedStateTransition.claimTransitions
          .map((transition) => transition.claimId)
          .filter((claimId) => !initialIds.has(claimId)),
        ...(evalCase.expectedStateTransition.requiredAuditEventTypes ?? []),
        ...evalCase.forbiddenActions,
        "expectedStateTransition",
        "affectedClaims",
        "affectedClaimIds",
      ].filter((marker) => marker !== "");
      // Values shared with visible text (claim statuses, severity words, initial
      // claim IDs, a correction source that names its authority) cannot be
      // checked as substrings; the invariance test above covers them.
      for (const marker of markers) {
        expect(text).not.toContain(marker);
        expect(formText).not.toContain(marker);
      }
    });
  }

  test("Part 1 does change when what the reviewer must see changes", () => {
    const evalCase = cases[0]!;
    const part1 = renderPart1(evalCase);
    expect(part1).toContain(evalCase.correctionEvent.statement);
    expect(part1).toContain(evalCase.sourceEvidenceSpans[0]!.excerpt);
    expect(part1).toContain(evalCase.initialReferenceState.clinicalDraftNote);
    expect(part1).toContain(evalCase.initialReferenceState.downstreamTask.description);
    for (const claim of evalCase.initialReferenceState.claims) expect(part1).toContain(claim.text);

    const edited = structuredClone(evalCase);
    edited.correctionEvent.statement = "A different correction statement.";
    expect(renderPart1(edited)).not.toBe(part1);
    expect(renderSheet(edited).sheetSha256).not.toBe(renderSheet(evalCase).sheetSha256);
  });

  test("Part 2 shows the author's dependency lists and unaffected claims", () => {
    const evalCase = caseById("aci-dev-001");
    const part2 = renderPart2(evalCase);
    expect(part2).toContain("- `currentRecord` relies on: `claim-lisinopril-40mg`");
    expect(part2).toContain("- `claim-metformin-500`: listed as unaffected");
    expect(part2).toContain("- `claim-lisinopril-40mg`: not listed as unaffected");
  });

  test("the severity rubric is the protocol's text, verbatim", () => {
    expect(readFileSync(path("protocol.md"), "utf8")).toContain(SEVERITY_RUBRIC);
    expect(renderSheet(cases[0]!).text).toContain(SEVERITY_RUBRIC);
  });
});

describe("review form", () => {
  test("value sets are the case schema's, severity in rubric order", () => {
    const schema = JSON.parse(readFileSync(path("harness/review/schema.json"), "utf8"));
    expect([...SEVERITY_TIERS]).toEqual(["standard", "high", "critical"]);
    expect(schema.properties.part1.properties.artifactMustChange.required).toEqual([...ARTIFACTS]);
    expect(schema.properties.part2.properties.artifactDependencies.required).toEqual([...ARTIFACTS]);
  });

  for (const evalCase of cases) {
    test(`${evalCase.id}: a filled form survives a JSON round trip and passes the schema`, () => {
      const form = filledForm(evalCase, "AB", (f) => {
        const firstClaim = Object.keys(f.part1.claimTransitions)[0]!;
        f.part1.newClaims = [{ text: "A new claim.", replacesClaimId: firstClaim }];
        f.part2.artifactDependencies.currentRecord = { matchesEvidence: false, note: "Does not match." };
      });
      const parsed = JSON.parse(JSON.stringify(form, null, 2));
      expect(parsed).toEqual(form);
      expect(validateReviewForm(parsed)).toEqual([]);
    });
  }

  test("a blank form lists the answers still missing", () => {
    const evalCase = cases[0]!;
    const errors = validateReviewForm(blankForm(evalCase, renderSheet(evalCase).sheetSha256));
    expect(errors).toContain("part1.severityTier has no answer");
    expect(errors).toContain("minutesSpent has no answer");
    expect(errors).toContain("part1.claimTransitions.claim-lisinopril-40mg has no answer");
  });

  test("rejects values, fields and details outside the form", () => {
    const evalCase = cases[0]!;
    const check = (edit: (form: any) => void) => validateReviewForm(filledForm(evalCase, "AB", edit));
    expect(check((f) => (f.part1.severityTier = "moderate"))).toContain(
      "/part1/severityTier must be equal to one of the allowed values: standard, high, critical"
    );
    expect(check((f) => (f.part1.claimTransitions["claim-metformin-500"] = "removed"))).toContain(
      "/part1/claimTransitions/claim-metformin-500 must be equal to one of the allowed values: active, disputed, retracted, replaced"
    );
    expect(check((f) => (f.part1.artifactMustChange.chart = true))).toContain(
      "/part1/artifactMustChange property name must be valid"
    );
    expect(check((f) => (f.reviewerInitials = "Jane Smith"))).toContain(
      '/reviewerInitials must match pattern "^[A-Z]{2,4}$"'
    );
    expect(check((f) => (f.licenceType = "MD 123456"))).toContain('/licenceType must match pattern "^[^@0-9]+$"');
    expect(check((f) => (f.email = "someone@example.org"))).toContain("(root) must NOT have additional properties");
    expect(check((f) => (f.minutesSpent = 0))).toContain("/minutesSpent must be > 0");
    expect(check((f) => (f.part2.unaffectedClaimListing.currentRecord = { matchesEvidence: false, note: "" }))).toEqual([
      "part1.claimTransitions and part2.unaffectedClaimListing must name the same claims",
      "part2.unaffectedClaimListing.currentRecord is marked as not matching the evidence but has no note saying why",
    ]);
    expect(check((f) => (f.part1.newClaims = [{ text: "New.", replacesClaimId: "claim-elsewhere" }]))).toEqual([
      "part1.newClaims[0].replacesClaimId claim-elsewhere is not a claim in this case",
    ]);
  });
});

describe("agreement statistics", () => {
  test("perfect agreement gives κ = 1, weighted or not", () => {
    const answers = ["standard", "high", "critical", "high"];
    expect(cohensKappa(answers, answers).kappa).toBe(1);
    expect(linearWeightedKappa(answers, answers, SEVERITY_TIERS).kappa).toBe(1);
  });

  test("chance-level agreement gives κ = 0", () => {
    // Each reviewer says yes half the time, independently: half the items
    // agree, which is exactly what chance predicts.
    const result = cohensKappa(["yes", "yes", "no", "no"], ["yes", "no", "yes", "no"]);
    expect(result.observed).toBe(0.5);
    expect(result.expected).toBe(0.5);
    expect(result.kappa).toBe(0);
  });

  test("a 2x2 table computed by hand: κ = 0.4", () => {
    // 50 items: 20 yes/yes, 5 yes/no, 10 no/yes, 15 no/no. Observed 0.70;
    // chance 0.5 x 0.6 + 0.5 x 0.4 = 0.50; κ = (0.70 - 0.50) / 0.50 = 0.40.
    const a = [...Array(25).fill("yes"), ...Array(25).fill("no")];
    const b = [...Array(20).fill("yes"), ...Array(5).fill("no"), ...Array(10).fill("yes"), ...Array(15).fill("no")];
    const result = cohensKappa(a, b);
    expect(result.observed).toBeCloseTo(0.7, 12);
    expect(result.expected).toBeCloseTo(0.5, 12);
    expect(result.kappa).toBeCloseTo(0.4, 12);
  });

  test("linear weighting gives half credit one step away: 0.40 weighted against 0.25 unweighted", () => {
    // Six items. Weighted observed (1 + .5 + 1 + .5 + 1 + .5) / 6 = 3/4.
    // Reviewer A uses each tier twice; B uses standard 1, high 3, critical 2.
    // Weighted chance = 1/3 x (1/6 x 1.5 + 3/6 x 2 + 2/6 x 1.5) = 7/12,
    // so weighted κ = (3/4 - 7/12) / (5/12) = 2/5. Unweighted: observed 1/2,
    // chance 1/3, κ = 1/4.
    const a = ["standard", "standard", "high", "high", "critical", "critical"];
    const b = ["standard", "high", "high", "critical", "critical", "high"];
    const weighted = linearWeightedKappa(a, b, SEVERITY_TIERS);
    expect(weighted.observed).toBeCloseTo(3 / 4, 12);
    expect(weighted.expected).toBeCloseTo(7 / 12, 12);
    expect(weighted.kappa).toBeCloseTo(0.4, 12);
    expect(cohensKappa(a, b).kappa).toBeCloseTo(0.25, 12);
  });

  test("κ is undefined, not 1 or 0, when both reviewers give one same answer throughout", () => {
    const result = cohensKappa(["yes", "yes", "yes"], ["yes", "yes", "yes"]);
    expect(result.observed).toBe(1);
    expect(result.kappa).toBeNull();
  });

  test("the report pairs forms by reviewer, whatever order each pair is given in", () => {
    // Severity: AB standard, high, critical; CD standard, critical, critical.
    // Observed 2/3, chance 1/3, κ = 0.5. Weighted observed 5/6, chance 1/2,
    // weighted κ = 2/3. The second pair is passed CD first.
    const severities: Array<[string, ReviewForm["part1"]["severityTier"], ReviewForm["part1"]["severityTier"]]> = [
      ["aci-dev-001", "standard", "standard"],
      ["aci-dev-002", "high", "critical"],
      ["aci-dev-003", "critical", "critical"],
    ];
    const loaded: LoadedForm[] = [];
    severities.forEach(([caseId, ab, cd], index) => {
      const formAB = filledForm(caseById(caseId), "AB", (f) => {
        f.part1.severityTier = ab;
        f.minutesSpent = 10 + index;
      });
      const formCD = filledForm(caseById(caseId), "CD", (f) => {
        f.part1.severityTier = cd;
        f.minutesSpent = 20;
      });
      const pair = [
        { path: `${caseId}-AB.json`, form: formAB },
        { path: `${caseId}-CD.json`, form: formCD },
      ];
      loaded.push(...(index === 1 ? pair.reverse() : pair));
    });
    const { pairs, reviewers, problems } = pairForms(loaded);
    expect(problems).toEqual([]);
    const report = agreementReport(pairs, reviewers!);
    const severity = report.labels.find((entry) => entry.label === "Severity tier")!;
    expect(severity.items.map((item) => item.answers)).toEqual([
      ["standard", "standard"],
      ["high", "critical"],
      ["critical", "critical"],
    ]);
    expect(severity.unweighted.kappa).toBeCloseTo(0.5, 12);
    expect(severity.weighted!.observed).toBeCloseTo(5 / 6, 12);
    expect(severity.weighted!.kappa).toBeCloseTo(2 / 3, 12);
    expect(report.labels.find((entry) => entry.label === "Artifact must change")!.items).toHaveLength(12);
    expect(report.minutes).toEqual([
      {
        reviewer: "AB",
        perCase: [
          { caseId: "aci-dev-001", minutes: 10 },
          { caseId: "aci-dev-002", minutes: 11 },
          { caseId: "aci-dev-003", minutes: 12 },
        ],
        total: 33,
      },
      {
        reviewer: "CD",
        perCase: [
          { caseId: "aci-dev-001", minutes: 20 },
          { caseId: "aci-dev-002", minutes: 20 },
          { caseId: "aci-dev-003", minutes: 20 },
        ],
        total: 60,
      },
    ]);
  });
});

describe("review commands", () => {
  const agree = (paths: string[]) => Bun.spawnSync(["bun", "run", path("harness/review/agree.ts"), ...paths]);

  function withForms(forms: Record<string, unknown>, run: (paths: Record<string, string>) => void) {
    const dir = mkdtempSync(join(tmpdir(), "fhsr-review-"));
    try {
      const paths: Record<string, string> = {};
      for (const [name, content] of Object.entries(forms)) {
        paths[name] = join(dir, name);
        writeFileSync(paths[name]!, typeof content === "string" ? content : JSON.stringify(content));
      }
      run(paths);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  test("review:agree reports agreement, says when n is too small, and leaves the cases alone", () => {
    const before = readFileSync(path("data/development.jsonl"), "utf8");
    const evalCase = cases[0]!;
    withForms({ "a.json": filledForm(evalCase, "AB"), "b.json": filledForm(evalCase, "CD") }, (p) => {
      const result = agree([p["a.json"]!, p["b.json"]!]);
      expect(result.stderr.toString()).toBe("");
      expect(result.exitCode).toBe(0);
      const out = result.stdout.toString();
      expect(out).toContain("Cohen's κ is unweighted");
      expect(out).toContain("every per-case label has fewer than 10 items");
      expect(out).toContain("Severity tier (one item per case): 1 of 1 agree");
      expect(out).toContain("- Both reviewers: total 20 over 2 reviews");
    });
    expect(readFileSync(path("data/development.jsonl"), "utf8")).toBe(before);
  });

  test("review:agree rejects a malformed form and prints no report", () => {
    const evalCase = cases[0]!;
    const malformed = filledForm(evalCase, "CD", (f) => {
      (f.part1 as any).severityTier = "moderate";
    });
    withForms({ "a.json": filledForm(evalCase, "AB"), "b.json": malformed, "c.json": "{ not json" }, (p) => {
      const result = agree([p["a.json"]!, p["b.json"]!]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain("/part1/severityTier must be equal to one of the allowed values");
      expect(result.stdout.toString()).toBe("");

      const unreadable = agree([p["a.json"]!, p["c.json"]!]);
      expect(unreadable.exitCode).toBe(1);
      expect(unreadable.stderr.toString()).toContain("cannot be read as JSON");
    });
  });

  test("review:agree rejects forms that cannot be compared", () => {
    const first = caseById("aci-dev-001");
    const second = caseById("aci-dev-002");
    withForms(
      {
        "ab1.json": filledForm(first, "AB"),
        "cd1.json": filledForm(first, "CD"),
        "ab2.json": filledForm(second, "AB"),
        "ef2.json": filledForm(second, "EF"),
        "ab1-again.json": filledForm(first, "AB"),
        "stale.json": { ...filledForm(first, "CD"), sheetSha256: "0".repeat(64) },
      },
      (p) => {
        const odd = agree([p["ab1.json"]!]);
        expect(odd.exitCode).toBe(1);
        expect(odd.stderr.toString()).toContain("expected forms in pairs");

        const third = agree([p["ab1.json"]!, p["cd1.json"]!, p["ab2.json"]!, p["ef2.json"]!]);
        expect(third.exitCode).toBe(1);
        expect(third.stderr.toString()).toContain("Cohen's κ compares the same two reviewers on every item");

        const same = agree([p["ab1.json"]!, p["ab1-again.json"]!]);
        expect(same.exitCode).toBe(1);
        expect(same.stderr.toString()).toContain("both forms carry the initials AB");

        const stale = agree([p["ab1.json"]!, p["stale.json"]!]);
        expect(stale.exitCode).toBe(1);
        expect(stale.stderr.toString()).toContain("different versions of the sheet");
      }
    );
  });

  test("review:sheet writes the sheet and blank form, and will not overwrite them", () => {
    const dir = mkdtempSync(join(tmpdir(), "fhsr-sheet-"));
    try {
      const evalCase = caseById("aci-dev-002");
      const result = Bun.spawnSync(["bun", "run", path("harness/review/sheet.ts"), evalCase.id, "--out", dir]);
      expect(result.stderr.toString()).toBe("");
      expect(result.exitCode).toBe(0);
      const { text, sheetSha256 } = renderSheet(evalCase);
      expect(readFileSync(join(dir, `${evalCase.id}-sheet.md`), "utf8")).toBe(text);
      expect(JSON.parse(readFileSync(join(dir, `${evalCase.id}-form.json`), "utf8"))).toEqual(
        blankForm(evalCase, sheetSha256)
      );

      expect(() => writeReviewFiles(evalCase.id, dir)).toThrow(/already exists/);
      expect(() => writeReviewFiles("aci-dev-999", dir)).toThrow(/No development case aci-dev-999/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
