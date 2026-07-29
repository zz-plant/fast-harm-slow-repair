# Harness

The harness is a deterministic simulation environment for one trajectory through the workflow.

## Responsibilities

- Load a frozen case.
- Run the system under condition A, B, or C.
- Expose tools identical across conditions where applicable.
- Record every state transition, tool call, model output, and audit event.
- Enforce turn budget and forbidden-action rules.
- Produce a `ScoredRun` record.

## Outputs

Each run writes a JSON file containing:

- case metadata;
- condition;
- model identifier and run parameters;
- initial and final state;
- complete trajectory;
- deterministic score and failure flags.

## Determinism

The harness scoring is deterministic. Only semantic equivalence in prose may be delegated to a validated LLM grader.
