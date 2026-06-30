# ADR-0007: Host-adapter capability contract for PR creation

## Status

Accepted

## Related

Parent: docs/explanation/features/git-jira-workflow.md

## Supersedes

_(none)_

## Superseded by

_(none)_

## Context

git-manager's `finish` workflow created PRs with inline per-host branches (GitHub `gh`, Bitbucket REST). Adding GitLab or any new forge meant editing the procedure and risked a leaky shared output-parser, because `gh` and `glab` diverge on exit codes and JSON shapes. We needed a host-agnostic way to open PRs that new forges could extend without touching `finish`.

## Decision

Introduce an operation-level host-adapter capability contract (`skills/git-manager/references/host-adapters.md`) with four normalized operations — `detect_host`, `auth_preflight`, `create_pr`, `read_pr`. `finish` is host-blind: it calls these operations against whichever adapter `detect_host` selects; each adapter (github/gitlab/bitbucket/manual) parses its own transport's output and returns a normalized value. Adding a host means writing one adapter block, with no edit to `finish`.

## Alternatives Considered

- Keep inline per-host branches in `finish` — rejected: every new forge edits the procedure and the secret-handling/PR logic is duplicated.
- A single shared JSON-parsing layer across hosts — rejected: `gh`/`glab` output shapes diverge, so a unified parser leaks host specifics (the "forge CLI divergence" risk).
- Delegate entirely to each host's own CLI (git-town style) — rejected: still needs a normalized return for the divergence/PR-URL contract and doesn't cover the REST (Bitbucket) or manual paths.

## Consequences

- **Gained:** New forges added by one self-contained adapter block; `finish` never branches on a host name; each adapter owns its own parsing and secret handling.
- **Gave up:** A small indirection (the contract layer) and the discipline that each adapter must independently return the normalized shape (no shared parser to lean on).
- **Follow-up required:** The four operations are the stable interface; `read_pr` feeds the merge-method divergence check (ADR-0008).
