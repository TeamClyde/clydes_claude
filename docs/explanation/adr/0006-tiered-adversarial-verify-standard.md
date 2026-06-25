# ADR-0006: Tiered-adversarial verify as the repo-wide finding-verification standard

## Status

Accepted (2026-06-25, at the Orchestration & Regulation Campaign close — Wave 5).

## Related

Parent: docs/explanation/features/quality-and-review.md

## Supersedes

_(none)_

## Superseded by

_(none)_

## Context

The campaign gave the workflow one fan-out front-door ([ADR-0005](0005-orchestration-regulation-standard.md)) and one regulated dispatch primitive ([ADR-0004](0004-fail-successfully-fanout-primitive.md)). What it did **not** yet have was one way to *verify the findings a fan-out produces* before they are surfaced. Each verify-bearing consumer had rolled its own: the architect panel ran an adversarial pass, but `adherence-audit`, `requesting-code-review`, SDD's two-lens, `librarian`, and `orchestration-audit` mostly ran **dedup/rank-only** verify — non-adversarial. The 2026-06-24 verify+review session (EXP-A vs EXP-B) reproduced the gap on real diffs: dedup-only verify **shipped false positives**, and false-positive containment fell to the orchestrator's out-of-band knowledge — the campaign's own signature failure mode (a control responsibility left to a non-reproducible human-in-the-loop step).

The supporting research (design Research Appendix): a single batched judge underperforms N independent voters; LLM judges show sycophancy, self-preference (accepts their own prior output), and a verbosity trap; sequential rebuttal framing is ~4× more persuadible than simultaneous side-by-side; what works is 3+ independent voters with distinct prompts, explicit refutation prompting, and a ≥2-of-3 survival rule. The campaign needed **one canonical verify mechanism every consumer shares**, not six reinventions of varying rigor.

## Decision

Adopt a **tiered-adversarial verify protocol** as the repo-wide standard for verifying a fan-out's collected findings before they are surfaced. It has one canonical source of truth and a conformance-guarded implementation:

- **Canonical doc:** `skills/dispatching-parallel-agents/references/verify-protocol.md` (the three tiers + per-consumer profiles + a machine-readable JSON param block).
- **Engine impl:** `scripts/lib/verify.mjs` — dependency-free (`tieredVerify` is pure orchestration over an injected Workflow-signature `agent`; named exports only), bundled into both engine `.workflow.mjs`.
- **Conformance guard:** `verify:check` asserts `VERIFY_PROTOCOL` (impl) deep-equals the doc's param block; wired into `npm test` so doc and code cannot drift.

The protocol's three tiers, cheapest-first:

1. **Tier 1 — batched triage (portable).** One batched call labels each finding `supported` / `uncertain` / `unsupported`; drop `unsupported` (profile-overridable — `web-research` escalates it instead); no new lookups.
2. **Tier 2 — clustered adversarial re-check (task-aware).** Group the escalation set by a cluster key (file portion of `where`, or `subQuestion` for web-research); ONE re-check per cluster re-reads the cited premise and returns a per-member keep/drop. Bounds cost (N findings → ~clusters lookups).
3. **Tier 3 — minority-veto 3-voter consensus on the contested tail only.** Only findings the lower tiers leave contested escalate. Three **structurally-diverse** voters (distinct role framings + evidence ordering; different model family where available) each independently attempt to **refute**; a finding survives iff **≥2 of 3 fail to refute**. The minority-veto rule: `<2` keepers → dropped **and** logged `contested`; `≥2` keepers but ≥1 refutation → KEPT **and** logged `contested`. A lone refuter can't silently out-vote a finding into trace-free survival — it forces escalation to the `contested` log (visibility), guarding agreeableness bias without over-dropping true findings.

**Per-consumer profiles** carry asymmetric cost models: `code-review` = guard-false-positive; `web-research` = guard-unsupported; `plan-review` / `audit` = balanced. **Graceful degradation:** each tier is bounded by an internal deadline; on a tier's failure/timeout it falls back to that tier's input set, stamped `degraded` (never a silent hang or silent loss).

All six fan-out consumers (architect panel, `adherence-audit`, `requesting-code-review`, SDD, `librarian`, `orchestration-audit`) route their verify through this protocol.

## Alternatives Considered

- **Per-skill dedup/rank-only verify** — rejected: non-adversarial; it is precisely the gap that ships false positives and pushes containment onto the orchestrator.
- **Per-finding 3-vote on every finding** — rejected: the vote cost is multiplicative across six consumers (the burned-session lesson — an unpinned per-finding-vote fan-out exhausted a session limit). Tier 3 escalates only the contested tail; the lower tiers are batched/clustered.
- **A single batched LLM judge** — rejected: sycophancy, self-preference, and verbosity bias; it underperforms independent voters and cannot be trusted to refute its own prior output.
- **Plain majority-accept (≥2 keep, drop the rest silently)** — rejected: a lone correct refuter loses with no trace. Minority-veto keeps a surviving-but-contested finding in the `contested` log and forces the false-negative trail.
- **Fold the standard into ADR-0005** — rejected: ADR-0005 is already `Accepted` (immutable), and the verify standard is an independently-citable mechanism with a distinct parent doc (`quality-and-review.md`). A separate record is the honest representation.

## Consequences

- **Gained:** one verify primitive, one canonical doc, one conformance guard; every reviewer's findings get the same adversarial treatment; the false-positive-containment burden moves off the orchestrator into the protocol; the `contested` log provides a standing false-negative trail.
- **Gave up:** verify is a **sampling** pass, not a proof — a real finding can still slip (the recall harness is the smoke signal, not a guarantee); model-family voter diversity is aspirational (only Sonnet is reliably available, so the three role framings + evidence ordering ARE the enforced diversity); under load a tier can degrade to pass-through (stamped `degraded`, never silent).
- **Follow-up:** the blind-canary recall harness (`scripts/recall/`) is the false-negative smoke signal; broadening recall beyond a smoke signal needs 15+ diverse operator families + a held-out real-bug corpus (design Research Appendix). `operating-model` / the front-door remain the home for *when* to fan out; this ADR governs *how the resulting findings are verified*.
