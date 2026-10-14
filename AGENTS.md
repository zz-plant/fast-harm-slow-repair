# AGENTS.md
> Operational guidance and scientific invariants for AI agents working in `fast-harm-slow-repair`.

## 1. Project Objective
`fast-harm-slow-repair` evaluates whether a healthcare AI workflow remains correctable after its record becomes wrong. It provides versioned clinical simulation cases, state schemas, and a deterministic scorer.

## 2. Invariants & Guardrails
- **Prompt Projection Leakage Guard**: Scoring fields (`expectedState`, ground-truth claims, extraction labels) must NEVER be exposed to evaluated models or projected into condition prompts. Tests in `tests/runner-prompts.test.ts` enforce this.
- **Canary Marker Preservation**: All development cases contain a unique canary marker. Holdout cases must never reproduce development canaries.
- **Deterministic Evaluation**: The primary scorer in `harness/scorer.ts` evaluates structural transitions without relying on subjective LLM-as-a-judge scoring.
- **Preregistration Discipline**: `preregistration.json` is a frozen protocol document. Never alter protocol parameters, statistical thresholds, or holdout manifests without an accompanying amendment in `AMENDMENTS.md`.

## 3. Verification Commands
Before submitting any changes, verify all checks pass:
```bash
bun test tests     # Runs complete 184-test verification suite
bun run validate   # Validates all cases and fixtures against JSON Schema
bun run typecheck  # Strict TypeScript compilation check
```
