# Doc Manifest — claude-workflow-improvements

> Source of truth for "what docs this repo aspires to have." Seeded from `templates/manifest/_default.md`
> (no `domain` set in `project.json`). Diátaxis-organized checklist.
> `/docs-status` compares the actual files in this repo against the checklist below:
> `[x]` = on disk; `[ ]` = aspirational / not yet created. Never delete entries without deliberate intent.

## Tutorials
<!-- Learning-oriented. The first walkthrough for a new contributor (or future-you). -->
- [x] `docs/tutorials/getting-started.md` — first-run walkthrough

## How-To
<!-- Task-oriented recipes. -->
- [x] `docs/how-to/setup.md` — install / setup recipe

## Reference
<!-- Information-oriented. Generated artifacts + durable lookup material. -->
- [x] `docs/reference/component-inventory.md` — generated roster of all 76 components (drift-checked)
- [x] `docs/reference/gate-map.md` — generated dependency/gate map (140 edges)
- [x] `docs/reference/glossary.md` — alphabetical workflow term definitions
- [x] `docs/reference/workflow-map.md` — Mermaid map of the primary skill chain
- [x] `docs/reference/setup-workflow-acceptance.md` — per-skill acceptance criteria (platform/tier matrix)

## Explanation
<!-- Understanding-oriented. Hybrid C1+C2+C3 layout per rules/doc-tools.md. -->
- [x] `docs/explanation/architecture.md` — repo-level system overview (C1 + C2)
- [x] `docs/explanation/orchestration-regulation-layer.md` — design dossier for the orchestration "third leg" (regulation layer); active draft, load-bearing for post-Phase-2 work

### Feature explainers (C3) — one per subsystem
- [x] `docs/explanation/features/orchestration-gating.md` — soft/hard gates + executor spectrum
- [x] `docs/explanation/features/planning-and-plan-docs.md` — planning subsystem + four-file plan tree
- [x] `docs/explanation/features/git-jira-workflow.md` — git-manager + jira-workflow-manager
- [x] `docs/explanation/features/agents-and-skills.md` — the component model
- [x] `docs/explanation/features/codebase-graph.md` — infra-init + codebase-memory graph
- [x] `docs/explanation/features/doc-tools.md` — the documentation subsystem
- [x] `docs/explanation/features/install-vetting.md` — the 3-gate advisory funnel
- [x] `docs/explanation/features/stack-hats.md` — per-stack best-practice layer
- [x] `docs/explanation/features/testing-system.md` — the six-pillar testing system
- [x] `docs/explanation/features/quality-and-review.md` — debugging + review + verification
- [x] `docs/explanation/features/tool-authoring.md` — creating-tools + authoring skills
- [x] `docs/explanation/features/thinking-and-session-tools.md` — thinking + session one-offs

### Architecture Decision Records
<!-- Immutable once Accepted; live under docs/explanation/adr/. -->
- [x] `docs/explanation/adr/0001-unified-stack-hats-hat-system.md` — Accepted

<!-- Transient working reports (not aspirational doc targets): docs/_triage.md, docs/_coverage-audit.md -->
