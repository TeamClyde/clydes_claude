<!-- README scaffolded into docs/explanation/adr/ by project-setup Phase 1.5. -->
<!-- This file is for HUMAN readers of the ADR directory in this repo.       -->
<!-- For the workflow conventions (when to write an ADR, when to promote      -->
<!-- a journal entry to an ADR), see skills/plan-management/SKILL.md          -->
<!-- (ADR Promotion Scan in close-subplan) and skills/doc-author/SKILL.md     -->
<!-- (format detail). rules/doc-tools.md is the lean policy pointer.          -->

# Architecture Decision Records

This directory captures architectural decisions made for this repo. ADRs are short, focused documents (1 page each) that record:

- **Context** — why we needed to make a decision
- **Decision** — what we decided
- **Consequences** — what trade-offs we accepted

## Where these live

ADRs in this directory are the **authoring** copy. The **published** copy lives in Confluence under the "Claude Docs" parent page in the team's Confluence space, with each ADR as a child page titled `<repo-name> — ADR-NNNN: <title>`.

Direct edits to Confluence will be overwritten on the next push from this repo. Edit here, push to Confluence via `/docs-refresh push <artifact>`.

## Where ADRs fit in Diátaxis

ADRs are **Explanation**-quadrant content under the Diátaxis convention (see `rules/doc-tools.md` for policy overview, or `skills/doc-author/SKILL.md` for format detail). They explain *why* the system is the way it is. They live at `docs/explanation/adr/` because of this — not at the flat `docs/adr/` path that older conventions used.

## Numbering

ADRs are numbered sequentially: `NNNN-kebab-case-title.md`. ADR-0000 documents the convention itself.

## When to write a new ADR

See `skills/plan-management/SKILL.md` (ADR Promotion Scan in close-subplan) for the canonical criteria. Briefly: framework swap, API contract change, data model change, infrastructure choice, security model change. The `[adr-candidate]` journal tag is the capture mechanism; promotion to a formal ADR happens at sub-plan close.

## Template

See `template.md` in this directory.
