# Prompts

This directory contains frozen prompts for the three evaluation conditions.

## Condition A — Stateless rewrite

No tools. The model receives the conversation, the later correction, and any previous assistant message, then returns revised prose.

## Condition B — Stateful agent

Tool-enabled, but no correction protocol. The model receives the same information plus tools for reading evidence, marking disputes, retracting claims, updating artifacts, holding/rolling back tasks, requesting clarification, escalating, and appending audit events.

## Condition C — Correction-aware control plane

Tool-enabled with explicit correction protocol:

- immutable evidence events;
- explicit claim dependency graph;
- dispute state tracked separately from record state;
- hold/rollback as default for uncertain consequential actions;
- bounded authority — named escalation roles for over-threshold cases;
- audit events required for every claim status change and artifact update.

## Condition D — Protocol-prompt ablation

Same tools and information as condition B, with the written correction protocol added to the prompt (the recognition, retraction, hold/rollback, escalation, and audit steps) but none of condition C's enforced guarantees: no immutable events, no enforced dependency graph, no required audit events. Isolates whether the protocol instructions alone explain any difference between B and C.

## Prompt variants

Each condition runs at least two prompt variants so instruction sensitivity is bounded, per the preregistered sensitivity analysis. Variants are versioned alongside the frozen prompt.

## Freezing

Prompts are versioned. Once the development phase is complete and holdout is sealed, prompt files are hashed and referenced in `../preregistration.json`.
