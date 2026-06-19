# ADR-0003: Generated inventory as documentation completeness oracle

## Status

Accepted (2026-06-19, at the phase-1b-docs sub-plan close).

## Related

Parent: docs/explanation/features/doc-tools.md

## Supersedes

_(none)_

## Superseded by

_(none)_

## Context

"Is every component documented?" was previously a manual-review judgment. As skills, agents, rules, and hooks are added and removed, any hand-maintained list of "what exists" drifts out of sync with reality, and manual review relies on memory — so coverage gaps appear silently. Phase 1A already produces a generated, drift-checked **component inventory** (`docs/reference/component-inventory.{json,md}`) and **gate-map** from the actual component frontmatter. The question was whether documentation completeness should be governed by that generated artifact or by human review.

## Decision

Make the generated `component-inventory.json` the **completeness oracle**: documentation completeness is enforced by cross-referencing every component name in the inventory against the Explanation layer. Each component must be **named in ≥1 `docs/explanation/` doc** or explicitly recorded **catalog-only** (present in the Reference inventory, with a stated reason for having no narrative home). The check is **re-runnable** — regenerate the inventory (`npm run harvest`) and re-run the cross-reference any time components change — making "the whole workflow is documented" a drift-resistant invariant rather than a point-in-time human judgment.

## Alternatives Considered

- **Manual review** ("read the docs and decide if anything's missing") — rejected: relies on memory, does not scale, and drifts the moment a component is added without a doc.
- **A hand-maintained doc index / checklist** — rejected: it is itself the thing that drifts; it duplicates the generated inventory and the two diverge.
- **No completeness guarantee at all** — rejected: defeats the Phase 1B goal of documenting the entire workflow (spine and one-off skills alike), not just the parts someone remembered.

## Consequences

- **Gained:** a re-runnable, drift-resistant completeness invariant (the closing coverage audit: 75/76 documented + 1 catalog-only, 0 un-triaged misses); completeness becomes a mechanical check, not a subjective one.
- **Gave up:** essentially nothing material — the inventory is already generated and drift-checked; the oracle reuses it.
- **Follow-up:** re-run the cross-reference whenever components are added/removed; a new component that is neither named in an explanation doc nor recorded catalog-only is a coverage miss to resolve. The mechanism lives in the `doc-tools` feature doc + `docs/_coverage-audit.md`.
