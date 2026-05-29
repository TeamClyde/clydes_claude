# ADR-0000: Record Architecture Decisions

## Status

Accepted

## Context

This repo participates in a workflow where significant architectural decisions are captured as Architecture Decision Records (ADRs). Without a durable record, decisions made in chat, in plan docs, or in commit messages are lost when context shifts. Cross-team engineers — and future versions of the current team — need to understand WHY the system is the way it is, not just WHAT it is.

## Decision

Architectural decisions for this repo are recorded as ADRs in this directory (`docs/explanation/adr/`). Each ADR follows the MADR-inspired template (`templates/adr/template.md` in the workflow repo, or `template.md` in this directory if it has been scaffolded locally). The full ADR convention — including when to write an ADR (criteria), how to promote from journal entries, where the published copy lives in Confluence — is documented in `rules/doc-tools.md` (which now points to `skills/doc-author/SKILL.md` and `skills/plan-management/SKILL.md` for the heavy detail) and the ADR Promotion Scan in `skills/plan-management/SKILL.md`.

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

## Hybrid Explanation Layout (added 2026-05-28)

Per `rules/doc-tools.md`, the Explanation quadrant uses three artifact classes:

| File | Role | C4 layer |
|---|---|---|
| `architecture.md` | Repo-level system overview (single file) | C1 + C2 |
| `features/<slug>.md` | Per-feature explainer (one per component) | C3 |
| `adr/NNNN-<slug>.md` | Decision records, immutable | n/a |

Every ADR has a required `## Related` heading section with at least one `Parent: <path>` line, pointing to either `docs/explanation/architecture.md` or `docs/explanation/features/<slug>.md`. Multi-parent ADRs list one `Parent:` line per parent.

Format detail (parsing, validation, doc-author backlink behavior) lives in `skills/doc-author/SKILL.md` — do not duplicate here.
