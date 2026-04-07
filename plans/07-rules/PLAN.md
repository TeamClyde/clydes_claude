# Rules & Instruction System — Sub-Plan

**Parent Plan:** [MAIN-PLAN.md](../MAIN-PLAN.md)
**Status:** Designing
**Priority:** 7

---

## Purpose

This plan defines every persistent instruction file that will exist in `~/.claude/` on a fresh user account. It is the authoritative spec for what each file does, what it covers, and how it is loaded.

The system has one goal: give Claude the right guidance at the right time without blowing the instruction budget. Not every piece of guidance needs to be a rule — the right mechanism depends on when and how the guidance needs to load.

---

## Background: Available Mechanisms

Claude Code provides several mechanisms for persistent instructions. Each has different loading behavior:

| Mechanism | Location | Loaded when | Enforcement | Best for |
|-----------|----------|-------------|-------------|----------|
| **CLAUDE.md** (global) | `~/.claude/CLAUDE.md` | Every session, every project | Advisory (~80%) | Universal workflow, delegation, sizing |
| **CLAUDE.md** (project) | `./CLAUDE.md` | Every session in that project | Advisory (~80%) | Project-specific config, test commands, repo safety |
| **Rules** (always-on) | `~/.claude/rules/*.md` (no frontmatter) | Every session, every project | Advisory (~80%) | Guidance that must fire before any file is read |
| **Rules** (path-scoped) | `~/.claude/rules/*.md` (with `paths:` frontmatter) | When Claude reads a file matching the glob | Advisory (~80%) | Conditional guidance for specific task types |
| **Agent definitions** | `~/.claude/agents/*.md` | Only when the agent is invoked | Advisory (~80%) | Agent-specific behavior, tools, constraints |
| **Skill definitions** | `~/.claude/skills/*/SKILL.md` | Only when the skill is invoked | Advisory (~80%) | Reusable workflows, procedures |
| **Hooks** | `settings.json` | Programmatic triggers | Deterministic (100%) | Non-negotiable enforcement (pre-commit, validation) |

**Instruction budget constraint:** Claude follows roughly 150–200 instructions with consistent compliance. The system prompt consumes ~50. Every always-on file draws from the remaining ~100–150 regardless of relevance. Path-scoped rules and agent/skill definitions only draw budget when active.

**Design principle:** Always-on content must be minimal. Detailed guidance loads on-demand via path-scoped rules, agent definitions, or skill definitions.

---

## Architecture

The instruction system has three layers:

**Layer 1 — Always-on (~110 lines):**
Two files that load every session across all projects. These contain only guidance that must be active before any task-specific work begins.

- `~/.claude/CLAUDE.md` (~80 lines) — workflow sequence, delegation routing, architect gates, task sizing, sync rules
- `~/.claude/rules/filesystem-efficiency.md` (~30 lines) — targeted reads, prohibited glob patterns, plan-doc-first

**Layer 2 — Path-scoped rules (~200 lines):**
Two rule files that load when Claude reads specific artifacts. The Layer 1 workflow sequence naturally directs Claude to read these artifacts at the right time, which triggers the rules automatically.

| Rule | Triggers when Claude reads | Content |
|------|---------------------------|---------|
| `planning.md` | `plans/**/*.md` | Research-first protocol, plan doc format, architect gate, test-strategy gate |
| `new-repo-setup.md` | `CLAUDE.md`, `.claude/**` | Agent/skill registry, setup checklist, CLAUDE.md template |

**Layer 3 — Agent/skill definitions (load on invocation only):**
Detailed operational instructions live in the agent and skill definition files themselves. These never consume always-on budget — they load only when the agent or skill is invoked.

| Definition | Contains |
|-----------|----------|
| `jira-workflow-manager` agent + policies | Ticket format, transitions, origin taxonomy, output schema |
| `git-manager` skill + policies | Commit format, branch naming, PR policy, worktree management |
| `architect` agent | Review modes, verdict format, re-invocation rules |
| `plan-management` skill | TODO.md format, classification, archival |
| `/infra-init` skill | Graph generation, artifact schemas, query tool names |
| `/e2e-init` skill | Testing plan generation, test runner setup |
| `test-strategy` agent | Validation criteria derivation |
| `test-builder` agent | TDD test writing from spec |

**How it connects:** The CLAUDE.md workflow sequence says "commit via git-manager" — Claude invokes the skill, which loads its own 178-line definition. The CLAUDE.md says "create tickets via jira-workflow-manager" — Claude invokes the agent, which loads its own definition and policy files. No duplication needed in always-on content.

---

## Instruction Budget

| Source | Lines | Load mode | When |
|--------|-------|-----------|------|
| System prompt | ~50 | Always | Every session |
| `~/.claude/CLAUDE.md` | ~80 | Always | Every session |
| `rules/filesystem-efficiency.md` | ~30 | Always | Every session |
| **Always-on total** | **~160** | | **Within 150–200 budget** |
| `rules/planning.md` | ~100 | Path-scoped | When reading plan docs |
| `rules/new-repo-setup.md` | ~100 | Path-scoped | When reading project config |
| Project `CLAUDE.md` | ~40–60 | Per-project | When working in that project |
| **Typical planning session** | **~320** | | Path-scoped adds ~100 when relevant |
| **Typical coding session** | **~220** | | Project CLAUDE.md only addition |

The always-on budget (~160) leaves room for one path-scoped rule plus the project CLAUDE.md. Planning sessions run higher (~320) but planning is a focused mode where the additional instructions are all relevant.

---

## Deliverable Designs

---

### 1. `~/.claude/CLAUDE.md` — Global Workflow

**Load mode:** Always-on (every session, every project)
**Target length:** ~80 lines
**Driven by:** Plans 02, 04, 06

**Purpose:** The single always-on file that tells Claude how to work across all projects. Contains only universal workflow instructions that would cause mistakes if absent. Does not contain project-specific config, agent-specific procedures, or guidance that can load on-demand.

**Content test:** Every line must pass: "Would Claude make a mistake on any project without this line?"

**Sections:**

**Delegation — Mandatory (~10 lines)**
Routing table mapping operations to agents/skills. One row per agent/skill: git operations → `git-manager` skill, Jira operations → `jira-workflow-manager` agent, plan tracking → `plan-management` skill, independent review → `architect` agent. Rule: never call Jira MCP tools or run git commands directly — always delegate.

**Architect Review — Mandatory (~15 lines)**
When to invoke: before transitioning any task to Testing or Done, before calling ExitPlanMode, when diagnosing bugs. When to skip: S-sized mechanical tasks (renaming, config-only, single-line fixes), status-only transitions. Maximum 3 review iterations — if blocking issues remain, surface to user. Reference `~/.claude/rules/workflow-phases.md` for prompt templates (note: this reference is for future implementation; templates live in the planning rule).

**Task Sizing (~10 lines)**
S (1–5k tokens, 1–3 files), M (5–15k tokens, several files), L (15k+ tokens, many files, multi-session). S and M → single Task ticket. L → Task + sub-tasks where possible.

**Workflow Sequence (~15 lines)**
The 6-step sequence that replaces the 90-line orchestrator:
1. Assess — size the work. L-sized or unclear → EnterPlanMode.
2. Plan — read/create plan doc in `plans/`. Follow planning rules. Architect gate before exit.
3. Tickets — create via jira-workflow-manager from plan doc. Sync to TODO.md via plan-management skill.
4. Execute — one task at a time. Transition to In Progress via jira-workflow-manager.
5. Commit — via git-manager skill. Include Jira key.
6. Close — transition to Done (or Testing if verification needed). Mark plan doc row ✅. Invoke plan-management skill.

**Source of Truth (~5 lines)**
Plan doc is the single source of truth. Jira is seeded from the plan doc at ticket-creation time; updates flow in as comments. TODO.md is a pointer registry — one entry per active plan with plan doc path and Epic key — not a copy of task detail.

**Core Rules (~10 lines)**
- One task in progress at a time. Complete and commit before starting the next.
- Scan before writing. Ticket descriptions must reference real file and method names — not guesses.
- Rich ticket descriptions: a human reading them 3 months later should understand what changed and why.
- If a task is significantly larger or smaller than estimated, note it and adjust sub-tasks.

---

### 2. `~/.claude/rules/filesystem-efficiency.md` — Filesystem Efficiency

**Load mode:** Always-on (no frontmatter)
**Target length:** ~30 lines
**Driven by:** Plans 01, 02

**Purpose:** Govern how Claude navigates codebases — what to read first, how to scope reads, what patterns are forbidden. Must be always-on because it governs the very first file read of a session.

**Content to cover:**

**Scope before acting (~5 lines)**
Before reading or searching, identify the minimum set needed. If a plan doc exists for the current task, read it first — it contains file paths, function names, and data structures. Only use Glob or Grep if the plan doc is missing context.

**Targeted reads (~3 lines)**
Use `offset` and `limit` parameters. A function is 20–40 lines. Do not dump whole files.

**Prohibited unscoped globs (~5 lines)**
Never call Glob without a `path` parameter for: `**/*.py`, `**/*.ts`, `**/*.js`, `**/*.json`, `**/*.yml`, `**/*.yaml`, `**/*`. Always scope with a directory path.

**Plan-doc-first (~3 lines)**
During task execution, the plan doc is the primary reference. Do not Glob or Grep for files already documented in the plan.

**No circular narration (~3 lines)**
Do not explain what you are about to do, do it, then summarize what you did. Act, then report the result.

---

### 3. `~/.claude/rules/planning.md` — Planning Protocol & Plan Doc Format

**Load mode:** Path-scoped
**Target length:** ~100 lines
**Driven by:** Plans 02, 06

```yaml
---
paths:
  - "plans/**/*.md"
  - "plans/**"
---
```

**Purpose:** Define the end-to-end protocol for making a plan and the format requirements for plan docs. Loads when Claude reads any plan doc — which the CLAUDE.md workflow sequence ensures happens as the first action in plan mode. Merges the intent of the original `planning-protocol.md` and `plan-docs.md` into one file since they share the same path scope and load together.

**Content to cover:**

**Research-first protocol (~30 lines)**
The planning sequence from Plan 06:
- Phase 1 — Orient: read `CODEBASE.md` first if available; read related plan docs in `plans/`
- Phase 2 — Research: query codebase graph for structural facts; dispatch `researcher` for live infrastructure values (ARNs, SSM parameters); run multiple researcher instances in parallel when questions are independent; only read source code when the graph is absent or you need implementation logic
- Phase 3 — Ask: batch all remaining unknowns into one message; never trickle questions one at a time; questions must cite real file/function context; do not ask for things Claude can find itself
- Phase 4 — Draft: every step is a concrete action against a real file/function with no placeholders; if a gap remains, return to Phase 2 or 3

**Plan doc requirements (~30 lines)**
- Sizing table: S (1–3 files) → no plan doc; M (several files, cross-cutting) → no plan doc; L (many files, multi-session) → plan doc required, create before ExitPlanMode
- Plan doc location: `plans/<slug>/PLAN.md` in the local repo; `~/.claude/plans/` files are session scratch pads only
- Required sections: Epic/Task Reference table (placeholder rows until execution), Context, Architecture blueprint (file paths, function signatures, enum values, external resource names)
- Self-containment test: a plan is ready when it could be handed to an empty context with "execute this plan" and succeed without additional research
- Plan doc refinements are S-sized — no architect review or new TODO.md entry required

**Test-strategy gate (~10 lines)**
After the plan is drafted and before the architect gate, invoke the `test-strategy` agent with the plan doc path. It produces validation criteria. Trivial plans may yield "existing tests cover this" — valid output. Never begin implementation without validation criteria.

**Architect gate (~15 lines)**
Invoke `architect` agent in `plan` mode before ExitPlanMode. Max 3 iterations. Blocking issues after 3 rounds escalate to user. ExitPlanMode only after architect review approves the plan.

**After completing a plan (~10 lines)**
Invoke `plan-management` skill with: plan doc path, Jira key (if created), status `completed`, 1–2 sentence summary. `TodoWrite` is session-scoped and is not a substitute for plan doc updates — both must be maintained independently.

---

### 4. `~/.claude/rules/new-repo-setup.md` — New Repo Setup

**Load mode:** Path-scoped
**Target length:** ~100 lines
**Driven by:** Plans 06, 08, 09

```yaml
---
paths:
  - "CLAUDE.md"
  - ".claude/**"
---
```

**Purpose:** Define the complete checklist for wiring up a new repository, the agent/skill registry, and the project CLAUDE.md template. Loads when Claude reads project config files — which happens during setup and when orienting on a new repo.

**Content to cover:**

**Agent/skill registry (~20 lines)**
Complete table of all global agents and skills with invocation method and role:
- Agents: `architect`, `jira-workflow-manager`, `researcher`, `test-strategy`, `test-builder`, `infra-init-structure` (spawned), `infra-init-batch-indexer` (spawned), `infra-init-graph-builder` (spawned)
- Skills: `git-manager`, `infra-init`, `e2e-init`, `plan-management`

**New repo checklist (~15 lines)**
Sequenced steps:
1. Run `scripts/setup.sh` to symlink global agents, skills, and rules
2. Run `/infra-init` on repos with 200+ source files → generates `codebase-graph.json` and `CODEBASE.md`; skip for small repos
3. Run `/e2e-init` → generates `testing-plan.md`, `e2e-plan.md`, and `scripts/run-tests.sh`
4. Create project `CLAUDE.md` from template below
5. Create initial `TODO.md`
6. Configure pre-commit hook to run `scripts/run-tests.sh`

**Project CLAUDE.md template (~60 lines)**
The template that every new project CLAUDE.md is created from. Includes:

- Delegation table (mirrors global — reinforces routing at project level)
- Jira configuration section (workspace URL, project key, cloud ID)
- Workflow column definitions (To Do → In Progress → Testing → Done) with project-specific overrides
- "When to skip Testing" rules (project-specific)
- Project overview (2–3 sentences)
- Repository & environment safety (sandbox vs production URLs)
- Codebase graph section (populated by /infra-init if run): graph path, summary path, query tool names, "read CODEBASE.md first when starting work"
- Testing section (populated by /e2e-init if run): test commands, test runner, framework
- TODO.md maintenance rule: update after every commit and every Jira status transition

---

## Implementation Sequence

| Order | Deliverable | Depends On | Notes |
|-------|-------------|------------|-------|
| 1 | `~/.claude/rules/filesystem-efficiency.md` | Plan 01 (graph query tools), Plan 02 (plan-doc-first) | Can be written once graph tool names are confirmed. Lean file — minimal blocking dependencies. |
| 2 | `~/.claude/rules/planning.md` | Plan 02 (research-first protocol), Plan 03 (test-strategy gate), Plan 06 (plan doc format) | Merges content from Plans 02 and 06. Test-strategy invocation spec comes from Plan 03. |
| 3 | `~/.claude/CLAUDE.md` | Plans 02, 04, 06 | Workflow sequence depends on planning and agent models being final. Delegation table depends on Plan 06 agent names. Write after planning.md so the workflow sequence can reference it correctly. |
| 4 | `~/.claude/rules/new-repo-setup.md` | Plans 05, 08, 09 | Registry requires all agents (05) and skills (08) to be finalized. Template requires CLAUDE.md structure to be final. Setup script comes from Plan 09. |

---

## Writing Guidelines for Implementation

When writing the actual files:

- **Lead with the constraint.** First sentence of each section states the rule, not the rationale.
- **Use tables for routing and decision trees.** Prose is harder to follow and easier to ignore.
- **Use IMPORTANT or MUST for hard constraints.** Emphasis improves adherence for safety-critical rules — but overuse dilutes everything.
- **Delete anything Claude already does correctly by default.** If it's standard practice, it wastes budget.
- **No tutorials or explanations.** One sentence of rationale is enough. Rules tell Claude what to do.
- **Every rule must be auditable.** "Use 2-space indentation" is a rule. "Write clean code" is not.
- **Project-specific content goes in project CLAUDE.md, not global files.** Test commands, repo URLs, framework choices — these vary by project.

---

## Cross-Plan Dependencies

| Plan | Drives which deliverables | Notes |
|------|--------------------------|-------|
| Plan 01 — Codebase Knowledge | `filesystem-efficiency.md`, project CLAUDE.md template | Graph query tool names must be confirmed before efficiency rule references them. `/infra-init` skill populates project CLAUDE.md codebase section. |
| Plan 02 — Jira Integration | `CLAUDE.md`, `planning.md` | Jira philosophy goes in CLAUDE.md. Research-first protocol and ticket creation trigger go in planning rule. Agent policies own operational details. |
| Plan 03 — Testing System | `planning.md`, `new-repo-setup.md` | Test-strategy gate goes in planning rule. `/e2e-init` step goes in setup checklist. Pre-commit enforcement → hook in settings.json, not a rule. |
| Plan 04 — Git Workflow | `CLAUDE.md` | Commit protocol reference in workflow sequence. Operational details stay in git-manager skill definition. |
| Plan 05 — Agent Architecture | `new-repo-setup.md` | Agent registry must include all finalized agent names and invocation methods. |
| Plan 06 — Plan Management | `CLAUDE.md`, `planning.md` | Plan doc as source of truth goes in CLAUDE.md. Plan doc format and planning protocol go in planning rule. |
| Plan 08 — Skills System | `new-repo-setup.md` | Skill registry must include all finalized skill names. Plan-management skill absorbs todo-manager. |
| Plan 09 — Developer Setup | `new-repo-setup.md` | Setup checklist references setup script. Script must symlink, not copy. |

---

## Cross-Plan Ripple Effects

| Decision in 07 | Plans affected | Notes |
|----------------|----------------|-------|
| `workflow-phases.md` eliminated as standalone rule | Plans 02, 06 | Orchestrator content absorbed into CLAUDE.md (~15 lines). Plans referencing "the orchestrator rule" should reference CLAUDE.md workflow sequence instead. |
| `codebase-knowledge.md` eliminated as rule | Plan 01 | Graph usage instructions move to project CLAUDE.md template. `/infra-init` skill must populate this section when it runs. |
| `testing-protocol.md` eliminated as rule | Plan 03 | Pre-commit gate → hook in settings.json. Test-strategy gate → section in planning rule. `/e2e-init` → step in setup checklist. Plan 03 should define the hook spec. |
| `jira-policy.md` eliminated as rule | Plan 02 | Philosophy stays as one-liner in CLAUDE.md. All operational Jira logic stays in agent policies. Plan 02 should not expect a separate rule file for main-context Jira guidance. |
| `planning-protocol.md` and `plan-docs.md` merged | Plan 02, Plan 06 | One `planning.md` rule replaces two. Plans referencing either should reference the merged file. |
| `infra-init-protocol.md` eliminated as rule | Plan 01 | Skill definition is self-documenting. Project CLAUDE.md carries per-repo graph config. Plan 01 should ensure `/infra-init` writes the project CLAUDE.md section. |
| Project CLAUDE.md template defined here | All plans | The template in `new-repo-setup.md` is the canonical structure for project-level CLAUDE.md files. Other plans that generate project-level content (Plans 01, 03) must write into the sections defined by this template. |
