# ADR-0010: Establish the working branch at brainstorming start

## Status

Accepted

## Related

Parent: docs/explanation/features/git-jira-workflow.md

## Supersedes

_(none)_

## Superseded by

_(none)_

## Context

A recurring friction was work landing on the wrong branch — design and early commits would accumulate on the previous epic's branch because the feature branch was created too late (only at start-work, after planning was complete). Branch context needs to be established before any design or early work begins, and it must be detectable later when HEAD drifts away from the intended branch.

## Decision

Establish a fresh branch at brainstorming start (a "macro entry-gate"): when new top-level design work begins, brainstorming branches off fresh `main` as a provisional `wip/<slug>` and records the expected branch via a per-worktree binding (`claude.expectedBranch` in native git worktree config). The binding is the "micro" counterpart's anchor — downstream soft-warns (commit-time, session-start) compare `git branch --show-current` against it and fail soft. `writing-plans` later renames `wip/<slug>` to the canonical `<type>/<slug>` and rebinds.

## Alternatives Considered

- Create the branch at start-work (status quo) — rejected: design and early work has already landed on the prior branch by then, so the isolation benefit is lost.
- Full git-town-style perennial-vs-feature parent tracking — rejected: overkill without adopting its whole sync model; the lightweight "record expected branch + compare + fail fast" path suffices.
- Store the expected branch in a shared `.claude` sidecar file — rejected: a shared file mis-warns across worktrees and does not cover the main worktree; native per-worktree git config (`--worktree`) scopes automatically (requires git ≥ 2.20, degrades to no-binding below that version).

## Consequences

- **Gained:** Design and early work start on an isolated branch from the first commit; a per-worktree expected-branch binding that powers non-blocking drift soft-warns at commit and session-start.
- **Gave up:** A brainstorming-time branch step plus one provisional-to-canonical rename (`wip/<slug>` → `<type>/<slug>`), and a small accepted pitfall where a renamed or rebased branch stales the binding and yields one ignorable soft-warn until the next branch operation refreshes it.
- **Follow-up required:** The binding is refreshed by start-work, the `writing-plans` rename, and `git-manager switch`; no additional migration needed once those hooks are in place.
