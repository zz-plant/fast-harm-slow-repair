import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const evalRoot = new URL("../", import.meta.url).pathname;

describe("schema type generation stays in sync", () => {
  test("regenerating the types produces the committed file", () => {
    // Regenerate into a temp copy and compare: if the schemas changed and
    // schemas/generated.ts was not regenerated, the types silently drifted.
    const before = readFileSync(join(evalRoot, "schemas/generated.ts"), "utf8");
    const temp = join(evalRoot, "schemas/generated.ts.tmp");
    execFileSync("bun", ["run", "scripts/gen-types.ts", "--out", temp], { stdio: "pipe" });
    try {
      const after = readFileSync(temp, "utf8");
      expect(after).toBe(before);
    } finally {
      execFileSync("rm", ["-f", temp]);
    }
  });

  test("generated file parses and exposes the exported types", () => {
    const text = readFileSync(join(evalRoot, "schemas/generated.ts"), "utf8");
    expect(text).toContain("export type EvalCase = FromSchema<typeof caseSchema>;");
    expect(text).toContain("export type SystemState = FromSchema<typeof stateSchema>;");
    // The tightened claim-typing from the schema must survive generation.
    expect(text).toContain('"evidenceIds"');
    expect(text).toContain('"replacementId"');
  });
});