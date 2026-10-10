import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { readCases } from "../validate.ts";
import { publicCaseView } from "../prompt.ts";
import { readTrajectories } from "./report.ts";
import { buildPreferencePairs, categorizeFlag, cleanRuns } from "./learning.ts";
import { buildConditionAPrompt } from "./prompts.ts";

// Corrective-feedback export from a saved pilot run — no model calls. Usage:
//   bun run export-sft <results/dev-pilot/<timestamp>>
//
// Writes sft.jsonl (prompt -> scored output per trajectory) and
// preferences.jsonl (chosen clean output vs rejected failing outputs per case).
// The labels are the deterministic scorer's, NOT clinician-validated: these are
// model-feedback pairs, not human preference data (see export-README.md).
const [dir] = Bun.argv.slice(2);
if (!dir) {
  console.error("Usage: bun run export-sft <results/dev-pilot/<timestamp>>");
  process.exit(1);
}

const root = new URL("../../", import.meta.url).pathname;
const records = readTrajectories(join(root, dir, "trajectories.jsonl"));
const cases = readCases(join(root, "data/development.jsonl"));

const messagesByCase = new Map<string, ReturnType<typeof buildConditionAPrompt>>();
for (const evalCase of cases) {
  messagesByCase.set(evalCase.id, buildConditionAPrompt(publicCaseView(evalCase)));
}

const sftLines = records
  .sort((a, b) => a.caseId.localeCompare(b.caseId) || a.model.localeCompare(b.model) || a.runIndex - b.runIndex)
  .map((record) =>
    JSON.stringify({
      caseId: record.caseId,
      model: record.model,
      run: record.runIndex,
      messages: messagesByCase.get(record.caseId),
      output: record.rawOutput.content || record.rawOutput.reasoning || "",
      extractedState: record.extractedState,
      clean: record.extraction.ok &&
        !record.score.primary.unsafePersistence &&
        record.score.primary.completeCorrectionPropagation &&
        record.score.primary.successfulRecoveryWithinTurnBudget,
      flags: record.score.failureFlags.map(categorizeFlag).filter((f): f is string => f !== null),
    })
  );

const pairs = buildPreferencePairs(records).map((pair) => ({
  ...pair,
  messages: messagesByCase.get(pair.caseId),
}));

const sftPath = join(root, dir, "sft.jsonl");
const prefPath = join(root, dir, "preferences.jsonl");
writeFileSync(sftPath, sftLines.join("\n") + "\n");
writeFileSync(prefPath, pairs.map((pair) => JSON.stringify(pair)).join("\n") + "\n");
writeFileSync(
  join(root, dir, "export-README.md"),
  [
    "# SFT / preference export",
    "",
    "Derived from this run's trajectories by the deterministic scorer. The labels are model-feedback, not human preference:",
    "- `clean = true` means the scorer rated unsafe-persistence false, complete propagation true, and recovery true.",
    "- The extractor and scorer are NOT clinician-validated, so a `clean` label is a structural pass, not a clinical correctness verdict.",
    "- Use as corrective-feedback pairs for a documentation agent, not as ground truth.",
    "",
    `Files: sft.jsonl (${sftLines.length} trajectories), preferences.jsonl (${pairs.length} chosen-vs-rejected pairs).`,
  ].join("\n") + "\n"
);

console.log(`Wrote ${sftPath} (${sftLines.length} trajectories, ${cleanRuns(records).length} clean)`);
console.log(`Wrote ${prefPath} (${pairs.length} preference pairs)`);