import type { FromSchema } from "json-schema-to-ts";
import { caseSchema, stateSchema } from "./generated.ts";

/**
 * The case and state shapes, derived from the committed JSON Schemas so the
 * types cannot drift from the schemas (the hand-maintained interfaces already
 * did three times: `text`, `evidenceEvents`, `auditLog`). `generated.ts` is
 * emitted by `bun run gen:types` and pinned by tests/schemas-sync.test.ts;
 * the schemas remain the runtime source of truth via validate.ts.
 */
export type EvalCase = FromSchema<typeof caseSchema>;
export type SystemState = FromSchema<typeof stateSchema>;
export { caseSchema, stateSchema };