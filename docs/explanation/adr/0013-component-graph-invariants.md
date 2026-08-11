# ADR-0013: Component-graph invariants — declare-and-resolve over the citation graph, not detect-and-flag

## Status

Accepted (2026-08-11, `component-reference-integrity` / `graph-integrity` slice 2b).

## Related

Parent: docs/explanation/features/tool-authoring.md

## Supersedes

_(none)_

## Superseded by

_(none)_

## Context

Slice 1 made `docs/reference/gate-map.json` a checked contract: a citation that resolves to
nothing fails `npm test` (`scripts/reference-integrity.test.mjs`). Slice 2a corrected the
extractor so path-form and slash-command citations are readable, and added citation-shape
coverage (`scripts/harvest-components.shape-coverage.test.mjs`) as the recall counterpart to
precision — is a component cited in a shape the extractor cannot read. Both checks are
edge-local: each answers a question about one citation at a time.

Neither can see a property that exists only across the whole graph. A node with no citer, a
component nobody has written a paragraph about, or a skill pair a reader could plausibly confuse
are all properties of the graph's *shape*, invisible to a check that only ever looks at one edge.
Slice 2b adds three such invariants, two in `scripts/graph-integrity.test.mjs` and one in
`scripts/graph-integrity.overlap.test.mjs`:

1. **Inbound degree** — is every zero-inbound-edge node an entry point, declared on purpose?
2. **Documentation coverage** — is every component actually documented, implementing the
   already-Accepted [ADR-0003](0003-generated-inventory-completeness-oracle.md)?
3. **Overlap triage** — is every lexically-confusable skill pair either disambiguated or
   explicitly triaged?

The third of these required resolving a design question the plan initially got wrong: could a
similarity threshold detect confusable skill pairs automatically, in place of a manual per-pair
judgment? Measurement over the live corpus falsified that design — see Alternatives Considered.
This ADR also records the two citation-shape decisions the whole reference-integrity contract
(precision, coverage, and now these invariants) sits on top of, since both were *measured*, not
assumed, and both are the kind of decision a later reader will try to "simplify."

## Decision

Ship three invariants, each following the shape the `references` exemption block established in
slice 1: a declared list in `docs/reference/skill-surface-policy.json`, keyed by the exempted
thing (or pair) and valued by a reason, checked in **both directions** — a stale declaration
fails exactly as loudly as a missing one.

### Inbound degree

A node with no inbound edge is either a defect — something should cite it and doesn't — or an
entry point by design: a hook the harness dispatches, a skill the user types directly. The graph
cannot tell those apart on its own, so `entryPoints` declares the second set, grouped by
invocation source (`harnessInvoked`, `userInvoked`). Measured 2026-08-11: 14 nodes with zero
inbound edges, 14 declared across the two groups.

This is **local in-degree, not transitive reachability**. A cluster of components citing only
each other, with no path in from any real entry point, has in-degree ≥ 1 throughout and would
pass silently. Reciprocal citation is common in this corpus: 35 two-cycle pairs exist in the live
edge set (measured 2026-08-11), one of them `install-vetting` ↔ `vet-security`. A BFS seeded from
(declared entry points ∪ zero-in-degree nodes) reaches all 79 of 79 nodes today (also measured
2026-08-11), so no island exists yet — but a true traversal check is a **known, deliberate
deferral**, not an oversight. `entryPoints` is keyed to in-degree semantics — its entries *are*
the zero-in-degree set — and the staleness assertion is inherently an in-degree property too;
upgrading only the forward direction to "reachable from a declared entry point" would leave the
two halves of one policy block asserting different things about what an entry point means.
Redefining a declared entry point from "nothing cites it" to "root of a reachable region" is a
plan change, not a review fix — see Alternatives Considered.

### Documentation coverage

Implements [ADR-0003](0003-generated-inventory-completeness-oracle.md), previously a
point-in-time narrative audit (`docs/_coverage-audit.md`, written at 76 components); this makes
the same check re-runnable and blocking. Every node must be named (word-boundary matched) in at
least one committed `docs/explanation/**/*.md` file, or declared `catalogOnly` with a reason.
Measured 2026-08-11: 78 of 79 nodes documented; the sole `catalogOnly` entry is a self-contained
spellcheck-hygiene rule, named in `skill-surface-policy.json` rather than here — spelling it out
in this prose would itself satisfy the coverage matcher and silently invalidate its own
exemption.

### Overlap triage is declare-and-resolve, not detect-and-flag

Every skill pair whose deduped, stop-worded description tokens exceed a declared Jaccard
threshold (0.125) forms a *candidate band*. Band membership is not itself a defect — it means two
descriptions are lexically similar enough that a reader could plausibly confuse them. What fails
is a band member carrying no recorded verdict in `overlapVerdicts`. Measured 2026-08-11: 14 pairs
in the band, all 14 carrying a recorded verdict — 13 `boundary` (one description names the other
skill, or both name a common router; the gate re-verifies this against the description text, so
the text is the proof and there is no separate evidence field to trust) and 1 `distinct` (lexical
coincidence, resolved by no textual clause).

**The governing principle: overlapping outputs are legitimate; overlapping triggers are not,
because the trigger is where routing happens.** Two skills can produce similar-shaped artifacts
without being confusable — what the graph gates is whether a reader would pick the wrong one
*before either skill runs*, not whether their outputs later resemble each other. This is why the
invariant is scoped to skill descriptions (the trigger-selection surface) and never to a skill's
output shape, and it is the reason a duplicate-*ownership* detector (considered and cut earlier
in this slice) is a different, narrower question than duplicate triggers.

### The citation-shape contract underneath all three invariants

All three invariants sit on top of the citation graph that precision and citation-shape coverage
maintain. Two of the shape decisions inside `scripts/lib/component-refs.mjs` that make that graph
correct were measured against the full corpus, not assumed, and are recorded here because both
are exactly the kind of thing a later reader will try to tidy away:

1. **The `.claude/` container guard.** A blanket "reject any `.claude/` path" rule is wrong:
   `` `.claude/hooks/preToolUse/subagent-prefix-prepend.mjs` `` is a required edge, while
   `` `.claude/integration-test-constraints.md` `` is a false positive — it shares a basename with
   the real rule at `rules/integration-test-constraints.md` but points at a different,
   repo-level config file. The discriminator is not what the span starts with, it is whether the
   matched candidate sits directly under a real container: `.mjs` spans skip the check entirely
   (hooks are the only `.mjs` node type and are legitimately cited from several roots); `.md` and
   extensionless spans resolve only when the segment immediately before the match is `rules`,
   `skills`, or `agents`, or the match starts the span at position zero (the bare `/<name>`
   slash-command form).
2. **Whitespace is not a suffixed separator** — the class is `[.#§]` only. Permitting `\s`
   resolves 12 additional spans, and every one of them is prose or console-output text (for
   example `"architect skipped"`, `"git-manager clean-gone"`), zero of them true citations.

Also part of this slice: two exemption classes that answer **different questions** about the same
node and are not interchangeable. `entryPoints` says *nothing cites this in the graph, by
design* — harness-dispatched hooks and user-invoked skills. `catalogOnly` says *no
`docs/explanation/` doc describes this, by design*. A component can legitimately sit in one,
both, or neither.

## Alternatives Considered

- **Detect confusable skill pairs by a description-similarity threshold.** Rejected — the signal
  **anti-correlates** with the target set, for a structural reason rather than a tuning one: a
  pair acquires a `boundary` clause precisely *because* someone already noticed it was confusable,
  and that clause names the sibling, which **adds shared vocabulary**. A pair therefore gets
  *more* similar, not less, at the moment it stops needing disambiguation. Verified independently
  on the current corpus (2026-08-11) over all 861 skill pairs, three metrics:

  | Metric | Worst control rank | Best target rank | Ranges overlap? |
  |---|---|---|---|
  | Jaccard | 8 | 12 | No |
  | Overlap coefficient | 9 | 14 | No |
  | IDF-weighted cosine | 7 | 13 | No |

  ("Control" = the two pairs already disambiguated before this invariant existed
  (`executing-plans`/`subagent-driven-development`, `receiving-code-review`/`requesting-code-review`);
  "target" = the six pairs across the four originally-confusable skill groups this work set out to
  fix (the `git-manager` / `using-git-worktrees` / `finishing-a-development-branch` trio,
  `librarian`/`dispatching-parallel-agents`, `project-setup`/`infra-init`,
  `adherence-audit`/`review-workflow`). Rank 1 = most similar of all 861 pairs.) The two control
  pairs outrank **every** target pair under all three metrics, with no overlap between the rank
  ranges. Any cutoff that reddens the targets reddens the already-fixed pairs first. This is why
  the design is declare-and-resolve rather than detect-and-flag: band membership is not a defect;
  a band member with no recorded verdict is. It also rules out a local re-derivation of the
  two-stage detector some published tool-selection literature uses (embedding similarity to
  produce candidates, then an LLM judge to confirm) for a separate, purely local reason: CI here
  is stdlib-only Node, offline, with no lockfile, so neither an embedding model nor an LLM judge
  can run in it — the judgment is made once, in-session, with the corpus open, and is *recorded*;
  CI is left a cheap deterministic check over that record.
- **Upgrade inbound degree to full transitive reachability now.** Deferred, not rejected — see
  Inbound Degree above for why upgrading only the forward direction would leave `entryPoints`
  asserting two different definitions of "entry point" within one policy block. The measured gap
  (35 two-cycle pairs, 0 islands today) is a real follow-up, tracked as a known deferral rather
  than silently dropped.
- **A third `overlapVerdicts` state, `merge-candidate`.** Considered and dropped before shipping —
  it would have carried a real extra requirement (a link to a remediation finding), but zero band
  members would use it today. Building and testing a branch against no live data is speculative;
  add it when a real instance first needs it.

## Consequences

- **Gained:** three checks that catch graph-shape defects precision and citation-shape coverage
  are structurally blind to — an orphaned node with no declared reason, an undocumented
  component, and a newly-confusable skill pair — each failing loudly and each self-correcting
  when the declaration it depends on goes stale.
- **Gave up / accepted risks** — stated, not overlooked:
  1. **Transitive reachability is deferred.** Inbound degree cannot see an island formed entirely
     of nodes with in-degree ≥ 1. The gap is measured (0 islands today, 35 two-cycle pairs that
     could each seed one) rather than hand-waved, but it is a real blind spot until a future
     traversal-based check ships.
  2. **The overlap band's threshold (0.125) is a declared judgment call, not a derived constant.**
     It is documented and re-measured at each change, but a different corpus of skill
     descriptions could require re-tuning it.
- **Blast radius:** confined to `scripts/graph-integrity.test.mjs`,
  `scripts/graph-integrity.overlap.test.mjs`, and the `entryPoints` / `catalogOnly` /
  `overlapVerdicts` blocks of `docs/reference/skill-surface-policy.json`. No runtime behavior
  changes; all three checks run under `npm test` only.
- **Follow-up:** a transitive-reachability check over `dependenciesOf` / the raw edge list is real
  future work, to be taken up as its own slice rather than folded into `entryPoints`'s current
  in-degree semantics.
