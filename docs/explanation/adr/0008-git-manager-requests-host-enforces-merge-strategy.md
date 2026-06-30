# ADR-0008: git-manager requests merge strategy; the host enforces

## Status

Accepted

## Related

Parent: docs/explanation/features/git-jira-workflow.md

## Supersedes

_(none)_

## Superseded by

_(none)_

## Context

The old policy hardcoded "all PRs squash-merge into main." But the merge method is universally a repository/host setting (branch-protection / repo merge config) — the client can request a strategy but cannot bind it per-PR. If `project.json` and the host's branch-protection disagree, the host wins silently, which would make any agent-side "enforcement" a lie.

## Decision

git-manager **resolves and records** the intended merge strategy from `project.json git.merge-strategy` (a glob map branch-pattern → squash|merge-commit|rebase, default squash, resolved for the PR target branch) and **flags** divergence — it does NOT enforce. Specifically it previews promotion conflicts for merge-commit targets via a read-only `git merge-tree` dry-run, and warns when the host's configured merge method (read via the `read_pr` contract operation) disagrees with the resolved strategy. Enforcement stays host-side (branch-protection / repository merge settings).

## Alternatives Considered

- Hardcode a universal squash policy — rejected: false certainty; the host can override silently and non-main promotion branches legitimately want merge-commit.
- Have git-manager run the actual merge (e.g. `gh pr merge --squash`) — rejected: brittle, bypasses host branch-protection, and couples the agent to each host's merge API.
- A mutating `git merge --no-commit --no-ff` dry-run to detect promotion conflicts — rejected: leaves merge state / a dirty tree on interruption; replaced by read-only `git merge-tree --write-tree` (git >= 2.38).

## Consequences

- **Gained:** Honest separation of request vs. enforce; per-branch strategy config via glob map; promotion-conflict preview without mutating the tree; divergence is surfaced not hidden.
- **Gave up:** git-manager cannot guarantee the merge method (the repo owner must set host branch-protection to make policy binding); the divergence check is best-effort and stays silent when the host can't surface a single canonical method (`read_pr` returns `unavailable`).
- **Follow-up required:** Repos that want a binding policy configure squash/rebase-only at the host level.
