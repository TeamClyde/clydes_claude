# ADR-0000: Record Architecture Decisions

## Status

Accepted

## Context

This repo participates in a workflow where significant architectural decisions are captured as Architecture Decision Records (ADRs). Without a durable record, decisions made in chat, in plan docs, or in commit messages are lost when context shifts. Cross-team engineers — and future versions of the current team — need to understand WHY the system is the way it is, not just WHAT it is.

## Decision

Architectural decisions for this repo are recorded as ADRs in this directory (`docs/explanation/adr/`). Each ADR follows the MADR-inspired template (`templates/adr/template.md` in the workflow repo, or `template.md` in this directory if it has been scaffolded locally). The full ADR convention — when to write one, how to promote from journal entries, where the published copy lives in Confluence — is documented in `rules/doc-tools.md` in the workflow repo.

ADRs are Diátaxis Explanation-quadrant content. They live under `docs/explanation/adr/` (not the older flat `docs/adr/` convention) so they slot cleanly into the broader doc structure.

## Alternatives Considered

- **No ADRs, rely on commit messages and chat history** — rejected: not searchable, evaporates when contributors leave or Slack history expires.
- **ADRs in Confluence only, no repo copy** — rejected: doesn't get version-controlled with the code, doesn't get reviewed via PR, can't be diffed.
- **ADRs in repo only, no Confluence** — rejected: cross-team engineers searching Confluence wouldn't find them, defeating the navigability use case.
- **ADRs at flat `docs/adr/` path** — rejected: doesn't align with the Diátaxis quadrant structure adopted by this workflow; ADRs are Explanation content and belong under `docs/explanation/`.

## Consequences

- **Gained:** durable, searchable architectural decision history; cross-team visibility via Confluence; PR-reviewable changes to architecture rationale; clean nesting under Diátaxis Explanation quadrant.
- **Gave up:** ~5 minutes of overhead per significant decision to write the ADR.
- **Follow-up required:** none — this convention applies going forward; backfill happens organically as decisions surface in feature work.
