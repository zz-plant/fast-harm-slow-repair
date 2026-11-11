import { readFileSync } from "node:fs";
import { ARTIFACTS, SEVERITY_TIERS, validateReviewForm, type ReviewForm } from "./form.ts";

/**
 * Agreement between two clinicians' review forms (protocol §6):
 *
 *   bun run review:agree <a.json> <b.json> [more pairs...]
 *
 * Each pair is the two reviewers' forms for one case. For every categorical
 * label the report gives raw agreement and Cohen's κ (unweighted); severity
 * also gets linear-weighted agreement and linear-weighted κ over the case
 * schema's order (standard < high < critical). It lists each disagreement, each
 * Part 2 answer of "does not match", and each reviewer's minutes.
 *
 * It reads only the forms it is given and writes nothing: no case file, and no
 * `clinicalValidation` field, is touched. Krippendorff's α is not computed.
 */

/** Below this many items, κ is printed with a plain warning that it means little. */
export const MIN_ITEMS_FOR_KAPPA = 10;

export interface KappaResult {
  n: number;
  /** Observed agreement (weighted, for the weighted κ). */
  observed: number;
  /** Agreement expected by chance from each reviewer's own answer frequencies. */
  expected: number;
  /** null when chance agreement is 1 (both reviewers gave one same answer throughout), where κ is undefined. */
  kappa: number | null;
}

function kappaFrom(observed: number, expected: number, n: number): KappaResult {
  const kappa = n === 0 || 1 - expected < 1e-12 ? null : (observed - expected) / (1 - expected);
  return { n, observed, expected, kappa };
}

function frequencies(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

/** Cohen's κ for two reviewers' answers to the same items, in the same order. */
export function cohensKappa(a: readonly string[], b: readonly string[]): KappaResult {
  if (a.length !== b.length) throw new Error("both reviewers must answer the same items");
  const n = a.length;
  if (n === 0) return kappaFrom(Number.NaN, Number.NaN, 0);
  const observed = a.filter((value, index) => value === b[index]).length / n;
  const countsA = frequencies(a);
  const countsB = frequencies(b);
  let expected = 0;
  for (const [value, count] of countsA) expected += (count / n) * ((countsB.get(value) ?? 0) / n);
  return kappaFrom(observed, expected, n);
}

/**
 * Linear-weighted Cohen's κ over ordered categories: an answer one step away
 * earns weight 1 - 1/(k-1), two steps 1 - 2/(k-1), and so on.
 */
export function linearWeightedKappa(
  a: readonly string[],
  b: readonly string[],
  ordered: readonly string[]
): KappaResult {
  if (a.length !== b.length) throw new Error("both reviewers must answer the same items");
  const n = a.length;
  if (n === 0) return kappaFrom(Number.NaN, Number.NaN, 0);
  const rank = (value: string) => {
    const index = ordered.indexOf(value);
    if (index === -1) throw new Error(`${value} is not one of ${ordered.join(", ")}`);
    return index;
  };
  const steps = ordered.length - 1;
  const weight = (i: number, j: number) => 1 - Math.abs(i - j) / steps;
  const observed = a.reduce((sum, value, index) => sum + weight(rank(value), rank(b[index]!)), 0) / n;
  const countsA = frequencies(a);
  const countsB = frequencies(b);
  let expected = 0;
  for (const [valueA, countA] of countsA) {
    for (const [valueB, countB] of countsB) {
      expected += weight(rank(valueA), rank(valueB)) * (countA / n) * (countB / n);
    }
  }
  return kappaFrom(observed, expected, n);
}

export interface LoadedForm {
  path: string;
  form: ReviewForm;
}

/** Reads and validates each form. Problems are returned, one line each, naming the file. */
export function loadForms(paths: readonly string[]): { forms: LoadedForm[]; problems: string[] } {
  const forms: LoadedForm[] = [];
  const problems: string[] = [];
  for (const path of paths) {
    let value: unknown;
    try {
      value = JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
      problems.push(`${path}: cannot be read as JSON (${error instanceof Error ? error.message : error})`);
      continue;
    }
    const errors = validateReviewForm(value);
    if (errors.length > 0) problems.push(...errors.map((error) => `${path}: ${error}`));
    else forms.push({ path, form: value as ReviewForm });
  }
  return { forms, problems };
}

export interface ReviewPair {
  caseId: string;
  /** Ordered as `reviewers`. */
  forms: [ReviewForm, ReviewForm];
}

const sameKeys = (a: object, b: object) =>
  JSON.stringify(Object.keys(a).sort()) === JSON.stringify(Object.keys(b).sort());

/**
 * Groups consecutive forms into one pair per case and checks the pairs can be
 * compared: same case, same sheet, same claims, two different reviewers, the
 * same two reviewers in every pair (Cohen's κ compares one fixed pair of
 * raters), and no case twice.
 */
export function pairForms(forms: readonly LoadedForm[]): {
  pairs: ReviewPair[];
  reviewers: [string, string] | null;
  problems: string[];
} {
  const problems: string[] = [];
  if (forms.length === 0 || forms.length % 2 !== 0) {
    return {
      pairs: [],
      reviewers: null,
      problems: [`expected forms in pairs, one pair per case; got ${forms.length} form(s)`],
    };
  }
  const first = forms[0]!.form;
  const second = forms[1]!.form;
  const reviewers: [string, string] = [first.reviewerInitials, second.reviewerInitials];
  const pairs: ReviewPair[] = [];
  const seenCases = new Set<string>();
  for (let index = 0; index < forms.length; index += 2) {
    const a = forms[index]!;
    const b = forms[index + 1]!;
    const label = `${a.path} and ${b.path}`;
    const before = problems.length;
    if (a.form.caseId !== b.form.caseId) {
      problems.push(`${label}: forms are for different cases (${a.form.caseId}, ${b.form.caseId})`);
    }
    if (a.form.sheetSha256 !== b.form.sheetSha256) {
      problems.push(`${label}: forms come from different versions of the sheet (sheetSha256 differs)`);
    }
    if (a.form.reviewerInitials === b.form.reviewerInitials) {
      problems.push(`${label}: both forms carry the initials ${a.form.reviewerInitials}`);
    }
    if (!sameKeys(a.form.part1.claimTransitions, b.form.part1.claimTransitions)) {
      problems.push(`${label}: forms name different claims`);
    }
    const initials = [a.form.reviewerInitials, b.form.reviewerInitials].sort().join(",");
    if (initials !== [...reviewers].sort().join(",")) {
      problems.push(
        `${label}: reviewers ${a.form.reviewerInitials} and ${b.form.reviewerInitials} differ from the first pair's ${reviewers.join(" and ")}; Cohen's κ compares the same two reviewers on every item`
      );
    }
    if (seenCases.has(a.form.caseId)) {
      problems.push(`${label}: case ${a.form.caseId} appears in more than one pair`);
    }
    seenCases.add(a.form.caseId);
    if (problems.length > before) continue;
    const ordered: [ReviewForm, ReviewForm] =
      a.form.reviewerInitials === reviewers[0] ? [a.form, b.form] : [b.form, a.form];
    pairs.push({ caseId: a.form.caseId, forms: ordered });
  }
  return { pairs, reviewers: problems.length > 0 ? null : reviewers, problems };
}

interface Item {
  id: string;
  answers: [string, string];
}

export interface LabelAgreement {
  part: 1 | 2;
  label: string;
  unit: string;
  items: Item[];
  unweighted: KappaResult;
  weighted?: KappaResult;
}

export interface AgreementReport {
  reviewers: [string, string];
  caseIds: string[];
  labels: LabelAgreement[];
  newClaims: Array<{ caseId: string; reviewer: string; text: string; replacesClaimId: string | null }>;
  notMatching: Array<{ caseId: string; reviewer: string; field: string; note: string }>;
  minutes: Array<{ reviewer: string; perCase: Array<{ caseId: string; minutes: number }>; total: number }>;
}

const yesNo = (value: boolean) => (value ? "yes" : "no");

export function agreementReport(pairs: readonly ReviewPair[], reviewers: [string, string]): AgreementReport {
  const label = (
    part: 1 | 2,
    name: string,
    unit: string,
    collect: (form: ReviewForm, caseId: string) => Array<[string, string]>,
    ordered?: readonly string[]
  ): LabelAgreement => {
    const items: Item[] = [];
    for (const pair of pairs) {
      const answersA = new Map(collect(pair.forms[0], pair.caseId));
      for (const [id, answerB] of collect(pair.forms[1], pair.caseId)) {
        items.push({ id, answers: [answersA.get(id)!, answerB] });
      }
    }
    const a = items.map((item) => item.answers[0]);
    const b = items.map((item) => item.answers[1]);
    return {
      part,
      label: name,
      unit,
      items,
      unweighted: cohensKappa(a, b),
      ...(ordered ? { weighted: linearWeightedKappa(a, b, ordered) } : {}),
    };
  };
  const perCase = (pick: (form: ReviewForm) => string) => (form: ReviewForm, caseId: string) =>
    [[caseId, pick(form)]] as Array<[string, string]>;

  const labels: LabelAgreement[] = [
    label(1, "Correction unambiguous", "case", perCase((f) => yesNo(f.part1.correctionUnambiguous))),
    label(1, "Claim status after the correction", "claim", (f, caseId) =>
      Object.entries(f.part1.claimTransitions).map(([claimId, status]) => [`${caseId} ${claimId}`, status])
    ),
    label(1, "New claim needed", "case", perCase((f) => yesNo(f.part1.newClaims.length > 0))),
    label(1, "Artifact must change", "artifact", (f, caseId) =>
      ARTIFACTS.map((artifact) => [`${caseId} ${artifact}`, yesNo(f.part1.artifactMustChange[artifact])])
    ),
    label(1, "Downstream task status (hold)", "case", perCase((f) => f.part1.downstreamTaskStatus)),
    label(1, "Action status (escalation)", "case", perCase((f) => f.part1.actionStatus)),
    label(1, "Dispute status", "case", perCase((f) => f.part1.expectedDisputeStatus)),
    label(1, "Severity tier", "case", perCase((f) => f.part1.severityTier), SEVERITY_TIERS),
    label(2, "Artifact dependency list matches evidence", "artifact", (f, caseId) =>
      ARTIFACTS.map((artifact) => [
        `${caseId} ${artifact}`,
        yesNo(f.part2.artifactDependencies[artifact].matchesEvidence),
      ])
    ),
    label(2, "Unaffected-claim listing matches evidence", "claim", (f, caseId) =>
      Object.entries(f.part2.unaffectedClaimListing).map(([claimId, check]) => [
        `${caseId} ${claimId}`,
        yesNo(check.matchesEvidence),
      ])
    ),
  ];

  const newClaims: AgreementReport["newClaims"] = [];
  const notMatching: AgreementReport["notMatching"] = [];
  for (const pair of pairs) {
    for (const form of pair.forms) {
      for (const claim of form.part1.newClaims) {
        newClaims.push({ caseId: pair.caseId, reviewer: form.reviewerInitials, ...claim });
      }
      const checks = [
        ...Object.entries(form.part2.artifactDependencies).map(
          ([name, check]) => [`artifactDependencies.${name}`, check] as const
        ),
        ...Object.entries(form.part2.unaffectedClaimListing).map(
          ([name, check]) => [`unaffectedClaimListing.${name}`, check] as const
        ),
      ];
      for (const [field, check] of checks) {
        if (!check.matchesEvidence) {
          notMatching.push({ caseId: pair.caseId, reviewer: form.reviewerInitials, field, note: check.note });
        }
      }
    }
  }

  const minutes = reviewers.map((reviewer, index) => {
    const perCaseMinutes = pairs.map((pair) => ({ caseId: pair.caseId, minutes: pair.forms[index]!.minutesSpent }));
    return { reviewer, perCase: perCaseMinutes, total: perCaseMinutes.reduce((sum, entry) => sum + entry.minutes, 0) };
  });

  return { reviewers, caseIds: pairs.map((pair) => pair.caseId), labels, newClaims, notMatching, minutes };
}

const fixed = (value: number) => value.toFixed(2);
const kappaText = (result: KappaResult) => {
  if (result.kappa === null) return "undefined: both reviewers gave one same answer to every item";
  const warning = result.n < MIN_ITEMS_FOR_KAPPA ? `  (only ${result.n} items: means little)` : "";
  return `${fixed(result.kappa)}${warning}`;
};

export function renderReport(report: AgreementReport): string {
  const [first, second] = report.reviewers;
  const lines: string[] = [
    "Clinician review agreement (protocol §6)",
    "",
    `Cases: ${report.caseIds.length} (${report.caseIds.join(", ")})`,
    `Reviewers: ${first} and ${second}`,
    "",
    "Raw agreement is the share of items both reviewers answered the same. Cohen's κ is unweighted;",
    "severity also gets linear-weighted agreement and κ (an answer one step away, such as high",
    "against critical, counts half). Items from one case are pooled with the other cases' and are",
    "not independent of each other. When nearly every answer is the same, κ can be near 0 even",
    "though raw agreement is high; that is how κ behaves, not a disagreement.",
  ];
  if (report.caseIds.length < MIN_ITEMS_FOR_KAPPA) {
    lines.push(
      "",
      `With ${report.caseIds.length} case(s), every per-case label has fewer than ${MIN_ITEMS_FOR_KAPPA} items. κ is printed`,
      "but one changed answer moves it a long way; read the disagreements below instead."
    );
  }
  for (const part of [1, 2] as const) {
    lines.push(
      "",
      part === 1 ? "Part 1: each reviewer's own answers" : "Part 2: does the author's annotation match the evidence?"
    );
    for (const entry of report.labels.filter((candidate) => candidate.part === part)) {
      const agreed = entry.items.filter((item) => item.answers[0] === item.answers[1]).length;
      lines.push(
        `- ${entry.label} (one item per ${entry.unit}): ${agreed} of ${entry.items.length} agree, raw ${fixed(entry.unweighted.observed)}, κ ${kappaText(entry.unweighted)}`
      );
      if (entry.weighted) {
        lines.push(
          `  linear-weighted: agreement ${fixed(entry.weighted.observed)}, κ ${kappaText(entry.weighted)}`
        );
      }
    }
  }

  const disagreements = report.labels.flatMap((entry) =>
    entry.items
      .filter((item) => item.answers[0] !== item.answers[1])
      .map((item) => `- ${entry.label}, ${item.id}: ${first} ${item.answers[0]}, ${second} ${item.answers[1]}`)
  );
  lines.push("", "Disagreements, for adjudication:", ...(disagreements.length > 0 ? disagreements : ["- none"]));

  lines.push("", "New claims proposed (free text, not compared):");
  lines.push(
    ...(report.newClaims.length > 0
      ? report.newClaims.map(
          (claim) =>
            `- ${claim.caseId}, ${claim.reviewer}: "${claim.text}"${claim.replacesClaimId ? ` in place of ${claim.replacesClaimId}` : ""}`
        )
      : ["- none"])
  );

  lines.push("", "Part 2 answers of \"does not match\", for the case author:");
  lines.push(
    ...(report.notMatching.length > 0
      ? report.notMatching.map((entry) => `- ${entry.caseId}, ${entry.reviewer}, ${entry.field}: ${entry.note}`)
      : ["- none"])
  );

  lines.push("", "Minutes spent:");
  for (const reviewer of report.minutes) {
    const perCase = reviewer.perCase.map((entry) => `${entry.caseId} ${entry.minutes}`).join(", ");
    lines.push(
      `- ${reviewer.reviewer}: ${perCase}; total ${reviewer.total}, mean ${fixed(reviewer.total / reviewer.perCase.length)} per case`
    );
  }
  const total = report.minutes.reduce((sum, reviewer) => sum + reviewer.total, 0);
  lines.push(`- Both reviewers: total ${total} over ${report.caseIds.length * 2} reviews`);
  return lines.join("\n");
}

if (import.meta.main) {
  const paths = Bun.argv.slice(2);
  if (paths.length === 0) {
    console.error("Usage: bun run review:agree <a.json> <b.json> [more pairs...]   (one pair of forms per case)");
    process.exit(1);
  }
  const { forms, problems: loadProblems } = loadForms(paths);
  if (loadProblems.length > 0) {
    console.error(loadProblems.join("\n"));
    process.exit(1);
  }
  const { pairs, reviewers, problems } = pairForms(forms);
  if (problems.length > 0 || reviewers === null) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log(renderReport(agreementReport(pairs, reviewers)));
}
