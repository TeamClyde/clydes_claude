# Delivery Cadence — PR Sizing and Branch Lifecycle

Short-lived branches, frequent pushes, trunk stays deployable. This rule covers how to size PRs and slice work so that principle holds in practice.

## Thresholds

| Signal | Value |
|--------|-------|
| Target | ~200 LOC logical change |
| Ceiling | ~400 LOC logical change |

**These are soft bounds, not hard gates.** The real measure is **logical change + file count + intent** — not raw line count. Raw-LOC gates get gamed: comment padding, whitespace splits, and mechanical reformats inflate the number without reducing review burden. When assessing size, ask "how much new behavior or structure was introduced?" not "how many lines changed?"

File count and intent matter independently of LOC. A 150-line migration that touches 12 files across three layers is large. A 500-line generated scaffold with one decision point is small.

## Slicing Patterns

| Pattern | When to use |
|---------|-------------|
| **Vertical slice** (primary) | Default. Deliver a thin end-to-end path through all layers — adds visible value that can be reviewed as a whole. |
| **Branch-by-abstraction** | Fits adapter-style or interface-swap work where both old and new implementations coexist temporarily. |
| **Keystone commit / feature-flag** | Use when a complete increment is not yet safe to expose — merge dark, flip the flag later. |

Prefer vertical slice first. Reach for the others only when a vertical cut is genuinely not possible.

## Cadence

Branches live less than one to two days. Push approximately daily. Trunk must remain deployable at all times.

Two increment types, defined precisely:

- **Pushable increment** — local tests pass, build is green, safe to run. Push to remote; do not merge yet.
- **Mergeable increment** — review approved, CI green, and either revert-safe or flagged off via feature flag. Merge to trunk.

Every commit on a feature branch should be a pushable increment. Every PR merge should be a mergeable increment.

## New Repo vs Ongoing Posture

The `project.json` `git.pr-sizing` field carries the repo's posture (`new` or `ongoing`) and the `target-loc` / `ceiling-loc` thresholds that consumers read.

| Posture | Behavior |
|---------|----------|
| `new` | Sizing conventions applied from day one. Every PR is expected to fit the thresholds. |
| `ongoing` | Advisory ratchet only. **Never hard-block.** Warn and guide; the team adopts incrementally. |

**Warning for ongoing repos:** do not impose punitive day-one size limits on legacy code. A large refactor on a codebase that has never had these conventions is not a violation — it is a starting point. Establish safety and shared norms first; then use the strangler-fig pattern to tighten thresholds over successive PRs.

## Cross-References

These consumers read or enforce this policy — refer to them by behavior, not by task number:

- **`project.json` `git.pr-sizing`** — carries the posture and the `target-loc`/`ceiling-loc` thresholds that all consumers read.
- **`plan-gate`** — surfaces oversized tasks to the architect at plan time, before any code is written.
- **`git-manager`** (`publish` / `finish` flows) — soft-warns when a branch diff exceeds the ceiling at push/PR time.
- **`architect` agent** — has a slicing lens that flags oversized tasks as `warning`-severity during plan and implementation review.

## Pitfalls

- **Feature-flag debt** — flags merged dark accumulate if not tracked. Add a cleanup task when the flag goes in.
- **Stacked-PR rebase pain** — stacked branches require rebasing every dependent branch when the base changes. Keep stacks shallow (two levels max).
- **Size-gate gaming** — splitting a logical change across multiple PRs to satisfy a threshold produces the same review burden with added coordination cost. Measure intent, not count.
- **Long-lived support branches** — branches that outlive their sprint become merge-conflict sinks. If a branch cannot merge within two days, surface the blocker rather than letting it age.
