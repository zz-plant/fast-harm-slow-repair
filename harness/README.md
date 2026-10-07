# Harness

The harness is being built as a deterministic simulation environment for one trajectory through the workflow.

## Current implementation

- `scorer.ts` computes the three primary measures separately and emits component-level failure flags.
- `score-fixture.ts` scores an inspectable final-state fixture against its matching JSONL case.
- `fixtures/dev-001-recovered.json` demonstrates complete correction propagation.
- `fixtures/dev-001-unsafe-persistence.json` demonstrates a contradicted claim and dependent action persisting after correction.

Run either fixture:

```bash
bun run harness/score-fixture.ts \
  data/development.jsonl \
  harness/fixtures/dev-001-recovered.json
```

These are authored development fixtures, not model outputs.

## Responsibilities

- Load a frozen case.
- Run the system under condition A, B, or C.
- Expose tools identical across conditions where applicable.
- Record every state transition, tool call, model output, and audit event.
- Enforce turn budget and forbidden-action rules.
- Produce a `ScoredRun` record.

## Outputs

The planned model harness will write a JSON file containing:

- case metadata;
- condition;
- model identifier and run parameters;
- initial and final state;
- complete trajectory;
- deterministic score and failure flags.

## Determinism

The harness scoring is deterministic. Only semantic equivalence in prose may be delegated to a validated LLM grader.
