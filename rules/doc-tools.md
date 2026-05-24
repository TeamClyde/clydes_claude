# Doc Tools — Multi-Domain Documentation Workflow

## 1. Purpose

This rule documents the multi-domain documentation workflow conventions for repos using the claude-workflow-improvements pipeline. It defines the Diátaxis quadrant convention, the per-repo `docs/manifest.md` pattern, the open domain registry, and how the workflow gates (`project-setup`, `brainstorming`, `plan-management`, `finishing-a-development-branch`) interact with documentation.

---

## 2. Diátaxis Convention

| Quadrant | Location | User need |
|---|---|---|
| Tutorials | `docs/tutorials/` | Learning — first walkthrough, oriented to a new contributor or future-you |
| How-To | `docs/how-to/` | Doing — task-oriented recipes, runbooks, troubleshooting |
| Reference | `docs/reference/` | Information — APIs, configs, data formats, domain-specific lookup material |
| Explanation | `docs/explanation/` | Understanding — architecture, rationale, design notes |

**ADRs live under `docs/explanation/adr/`** (Diátaxis Explanation quadrant), **NOT** the older flat `docs/adr/` path.

---

## 3. The `docs/manifest.md` Pattern

- Every repo has a `docs/manifest.md` — the source of truth for "what docs this repo aspires to have."
- Seeded at `project-setup` Phase 1.5 from `templates/manifest/<domain>.md`.
- Format: Diátaxis-organized checkbox list.
  - `[ ]` = aspirational (not yet created)
  - `[x]` = required-and-present
- Inline HTML comments explain *why* each entry is suggested.

**Never** delete an entry from `docs/manifest.md` without deliberate intent — it is the durable record of doc-intent for this repo.

---

## 4. Open Domain Registry

The `project.json` `domain:` field is **free text**, not a closed enum.

Initial seed templates:

| Domain value | Intended for |
|---|---|
| `software-eng` | Backend services, APIs, CLI tools |
| `firmware` | Embedded / hardware-adjacent |
| `mobile` | iOS / Android app |
| `python-utility` | Standalone Python scripts or utility packages |
| `ml` | Machine learning training / inference code |

**Any domain value not in this initial set falls back to `templates/manifest/_default.md`** (the generic Diátaxis baseline).

To extend the registry: drop a new `templates/manifest/<new-domain>.md` file in the workflow-improvements repo — no code change required.

Constraints:
- One domain per repo (v1 limitation).
- If `project.json` is missing the `domain:` field, the workflow prompts the user once, writes the value back, and continues.

---

## 5. Wshobson Agent Routing Table

The `/docs-refresh <type>` slash command is the user-facing entry point that routes to the right agent or skill by quadrant.

| Artifact / location | Routed to |
|---|---|
| `docs/tutorials/` | `tutorial-engineer` agent |
| `docs/how-to/` | `docs-architect` agent |
| `docs/reference/` | `reference-builder` agent |
| `docs/explanation/` (non-ADR) | `docs-architect` agent |
| `docs/explanation/adr/` | `architecture-decision-records` skill |
| `CHANGELOG.md` | `changelog-automation` skill |
| `openapi.yaml` | `openapi-spec-generation` skill (or `api-documenter` agent for human-readable companion) |
| Diagrams (inline in any artifact) | `mermaid-expert` agent |

---

## 6. `/docs-status` Tiering Convention

`/docs-status` output uses three severity tiers — **never** a flat list:

| Tier | When |
|---|---|
| ERRORS | File marked `[x]` in manifest but missing on disk; broken internal links/anchors (via Linkinator MCP); manifest references file outside Diátaxis quadrant convention |
| WARNINGS | File exists but mtime > 6 months (default threshold; tunable per-repo via `<!-- stale-threshold: N months -->` comment in `docs/manifest.md`) |
| SUGGESTIONS | Manifest entry `[ ]` (aspirational, not yet created); file exists on disk but not in manifest (orphan — consider adding or removing) |

Deferred to v2: git-log-based drift detection ("code area changed since last doc update"). V1 uses mtime only.

---

## 7. Workflow Gate Summary

The doc workflow integrates at these points:

- **`project-setup` Phase 1.5** — scaffolds Diátaxis dirs, seeds `docs/manifest.md` from domain template (or `_default.md` fallback), scaffolds README/CHANGELOG/cliff.toml/ADR-zero
- **`brainstorming` Step 10** — ADR-candidate flag question (high-signal capture moment when a decision is being made)
- **`plan-management:divergence`** — `[adr-candidate]` tag in the authoritative taxonomy for mid-execution rationale moments
- **`plan-management:close-subplan`** (both paths) — scans journal for `[adr-candidate]` entries → prompts ADR promotion via `architecture-decision-records` skill
- **`finishing-a-development-branch` Step 2.5** — soft `/docs-status` suggestion before PR creation (declinable, no enforcement)
- **`/docs-status`** — manual audit; tiered output per Section 6
- **`/docs-refresh <type>`** — manual generation; routes per Section 5

---

### What is NOT enforced

- **Never** block PR creation on missing docs.
- **Never** require manifest entries to exist on disk before a commit lands.
- **Never** auto-generate or auto-update doc content — **always** user-initiated via `/docs-refresh`.
- **Never** push to Confluence without user-initiated action via Atlassian MCP.

Solo-developer principle: the system informs; the user decides. The **only** nudge in the entire workflow is the soft `/docs-status` suggestion at plan-close (Section 7).

---

> See `plans/multi-domain-doc-workflow/multi-domain-doc-workflow-design.md` for full rationale.
