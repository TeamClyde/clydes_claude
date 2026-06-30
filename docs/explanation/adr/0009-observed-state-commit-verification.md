# ADR-0009: Verify observed git state, not the actor's reported commit

## Status

Accepted

## Related

Parent: docs/explanation/features/git-jira-workflow.md

## Supersedes

_(none)_

## Superseded by

_(none)_

## Context

In subagent-driven-development, a fresh implementer subagent does each task's work and self-reports completion (a commit hash) across an untrusted boundary. Trusting that report lets a task be marked ✅ when the work never actually landed — no commit, uncommitted in-scope files, or wrong branch. The orchestrator is the verifier; the implementer is an untrusted reporter.

## Decision

The SDD exit gate verifies **observed git state**, never the implementer's claim. A micro entry gate captures the per-task `BASELINE` SHA (`git rev-parse HEAD`) and the in-scope file list before dispatch; the exit gate then asserts: X5 in-scope files landed (`git log <BASELINE>..HEAD --name-only`), X6 in-scope files are clean (`git status --porcelain` scoped to those paths), X7 the branch matches `claude.expectedBranch` (skipped silently when unset), and X8 optionally corroborates the reported hash within `<BASELINE>..HEAD` (never the basis). On failure the orchestrator re-dispatches the implementer once with the exact discrepancy, then stops to the user — it never silently commits the dirty tree itself, preserving the leaf-commits contract.

## Alternatives Considered

- Trust the implementer's reported commit hash — rejected: a fabricated or stale hash passes a check the orchestrator never independently confirmed.
- Have the orchestrator commit on the implementer's behalf when state is dirty — rejected: defeats the untrusted-boundary verification and breaks the leaf-commits contract.
- Key the "did it land" check on the reported hash rather than the committed file set — rejected: doesn't survive empty/amended commits or pre-commit auto-fixers; keying off `git log <BASELINE>..HEAD --name-only` does.

## Consequences

- **Gained:** A task is ✅ only when the repo actually reflects the work; a generalizable orchestrator-trust principle (verify the effect, not the actor's claim) reusable wherever an untrusted subagent reports completion.
- **Gave up:** A few read-only git queries per task (a sanctioned exception to route-through-git-manager, which governs mutations only) and the entry-gate bookkeeping to hold BASELINE and the in-scope file list.
- **Follow-up required:** Scope is subagent-driven-development only; executing-plans is exempt because the orchestrator is itself the committer there — no untrusted boundary exists.
