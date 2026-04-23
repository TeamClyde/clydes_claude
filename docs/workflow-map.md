# Workflow Map

Canonical reference for how skills, agents, rules, hooks, and plugins connect in the
Claude workflow. Update this file whenever a component is added, removed, or rewired.

Last updated: 2026-04-20

---

## Primary Skill Chain

The standard path from user request to completed work.

~~~mermaid
flowchart TD
    User([User request]) --> Assess{Size?}

    Assess -->|S — targeted, approach clear| PM
    Assess -->|M/L — design first| BS[brainstorming\nOutputs: plans/slug/slug-design.md]
    BS --> PM[writing-plans\nOutputs: plans/slug/slug-plan.md]

    PM --> PG[plan-gate\nAuto-invoked by writing-plans]
    PG --> AR[architect agent\nReturns: APPROVED or NEEDS REVISION]
    AR -->|NEEDS REVISION| PM
    AR -->|APPROVED| TS[test-strategy agent\nAppends Testing section to plan doc]
    TS --> EP[executing-plans\nor subagent-driven-development]

    EP --> Task{Per task}
    Task --> Impl[implementation]
    Impl --> TR[test-runner agent\nExecutes test suite]
    TR -->|pass| VBC[verification-before-completion\nConfirms completion claims]
    TR -->|fail| SD[systematic-debugging skill\nRoot cause before fixes]
    SD --> Impl
    VBC --> GM[git-manager skill\nCommit + push]
    GM --> JW[jira-workflow-manager agent\nTransition ticket]
    JW --> PMS[plan-management skill\nUpdate TODO.md]
    PMS -->|more tasks| Task
    PMS -->|all done| FDAB[finishing-a-development-branch\nPR creation + worktree cleanup]
~~~

### Ad-hoc path (Case B — no writing-plans)

For S/M work planned directly in plan mode without invoking `writing-plans`:
- Draft plan manually
- Invoke `architect` agent manually before `ExitPlanMode`
- `plan-gate` does **not** fire automatically in this path

---

## Component Creation Chain

When creating new workflow components (skills, agents, rules, hooks):

~~~mermaid
flowchart TD
    Intent([Create a workflow component]) --> CT[creating-tools\nRoutes by artifact type]
    CT -->|skill| WS[writing-skills\nTDD: baseline test first]
    CT -->|agent| WA[writing-agents\nTDD: baseline invocation test first]
    CT -->|rule| WR[writing-rules\nRule vs skill decision first]
    CT -->|hook| Hook[hook implementation]
    WS --> Pulser[pulser\nStructural quality check]
    WA --> Pulser
    WR --> Pulser
~~~

**Routing rule:** `creating-tools` must be the entry point for all component creation.
Do not invoke `writing-skills`, `writing-agents`, or `writing-rules` directly.
See `rules/plugin-lifecycle.md` — this is enforced by rule priority.

---

## Agent Registry

All agents invoked via: `Agent { subagent_type: "<name>", prompt: "..." }`

| Agent | Called by | Purpose |
|-------|-----------|---------|
| `architect` | `plan-gate` (auto — Case A), CLAUDE.md (manual — Case B) | Plan review: design soundness, self-containment, logic completeness. Returns APPROVED or NEEDS REVISION with BLOCKING / MINOR findings. |
| `jira-workflow-manager` | CLAUDE.md, `git-manager`, `executing-plans` | All Jira operations: ticket creation, status transitions, comments. Never call Atlassian MCP directly. |
| `researcher` | Planning phase (parallel dispatch OK) | Single MCP lookup — ARN, SSM parameter, DynamoDB table name, env var location. One question per instance. |
| `integration-engineer` | Planning phase | Cross-repo contract analysis — maps endpoints, finds callers in other repos. Read-only. |
| `test-strategy` | `plan-gate` (after architect APPROVED) | Derives per-plan validation criteria. Appends `## Testing` section to plan doc. |
| `test-builder` | `plan-gate` (after test-strategy, in parallel with implementation) | Writes failing tests to disk from the Testing section. Never reads implementation source. |
| `test-runner` | `executing-plans` (main context), `subagent-driven-development` (orchestrator) | Post-implementation test executor. Runs the test suite, classifies failures (BUILD / TEST / ENVIRONMENT), writes results to `.claude/test-results.md`, and mandates `systematic-debugging` via REQUIRED NEXT STEP block on any failure. Caller must have Skill tool access — never dispatch as a leaf implementer subagent. |
| `todo-manager` | — | **Removed.** Superseded by `plan-management` skill. |

---

## Skill Registry

All skills invoked via: `Skill { skill: "<name>", args: "..." }`

### Workflow orchestration

| Skill | When it fires | Hands off to |
|-------|--------------|--------------|
| `brainstorming` | M/L work, design-first path | `writing-plans` |
| `writing-plans` | After brainstorming, or directly for S/M | `plan-gate` (auto) |
| `plan-gate` | Auto after `writing-plans` | `architect`, `test-strategy`, `test-builder` agents |
| `executing-plans` | When plan is approved and work begins | `git-manager`, `jira-workflow-manager`, `plan-management` per task |
| `subagent-driven-development` | Alternative to `executing-plans` for parallelizable tasks | Same as executing-plans |
| `finishing-a-development-branch` | After all tasks complete | Presents merge/PR/keep/discard options |

### Component creation

| Skill | When it fires | Invoked via |
|-------|--------------|-------------|
| `creating-tools` | Any component creation intent | Direct; routes to sub-skills |
| `writing-skills` | Creating a new skill | `creating-tools` only |
| `writing-agents` | Creating a new agent | `creating-tools` only |
| `writing-rules` | Creating a new rule | `creating-tools` only |

### Infrastructure & quality

| Skill | When it fires | Purpose |
|-------|--------------|---------|
| `infra-init` | New repo session or codebase changed | Builds codebase graph + CODEBASE.md |
| `e2e-init` | New repo, test backbone needed | Generates testing-plan.md, run-tests.sh |
| `project-setup` | Onboarding new repo to Claude workflow | CLAUDE.md + project.json setup wizard |
| `adherence-audit` | Periodic / when adding new tools | Semantic consistency check across all components |

### Thinking tools

| Skill | When it fires | Purpose |
|-------|--------------|---------|
| `different-viewpoint` | User-invoked for any problem or decision | Full CIA Phoenix Checklist sweep — surfaces frame shifts and hypothesis flaws. Accepts optional hypothesis. |
| `different-viewpoints-lite` | User-invoked for quick adversarial challenge | 5-question adversarial challenge — selects questions most likely to falsify the hypothesis. Accepts optional hypothesis. |

### Support

| Skill | When it fires | Purpose |
|-------|--------------|---------|
| `git-manager` | Every commit, push, PR | All git operations — never use Bash git directly |
| `plan-management` | After every Jira ticket creation or status transition | Keeps TODO.md current |
| `using-git-worktrees` | Feature work needing isolation | Creates worktrees; pairs with `finishing-a-development-branch` |
| `dispatching-parallel-agents` | 2+ independent tasks | Coordinates parallel agent dispatch |
| `verification-before-completion` | Before claiming work is done | Verifies tests pass, no regressions |
| `systematic-debugging` | Bug, test failure, unexpected behavior | Structured diagnosis before fixing |
| `test-driven-development` | Feature or bugfix implementation | TDD cycle for code changes |
| `feedback` | Friction or confusion mid-session | Captures workflow friction to workflow-feedback.md |
| `review-workflow` | Open workflow-friction GitHub issues have accumulated | Explore scan + Phoenix analysis + multi-angle proposals + adversarial review |
| `requesting-code-review` | Implementation complete | Opens PR with structured review request |
| `receiving-code-review` | PR review feedback received | Processes and implements reviewer feedback |
| `using-superpowers` | Start of any conversation | Orientation: finds available skills and how to use them |

---

## Rule Governance

Rules load with higher priority than skills. A rule that contradicts a skill wins silently.
Rules are in `rules/` and `CLAUDE.md`.

| Source | Governs | Key constraints imposed |
|--------|---------|------------------------|
| `CLAUDE.md` | Global workflow sequence, delegation table, architect review gates | One task in progress at a time; architect required before execution; plan-management for TODO.md |
| `rules/workflow-phases.md` | Jira + git phase sequence, three-source task sync | All Jira via `jira-workflow-manager`; all git via `git-manager`; all TODO.md via `plan-management` |
| `rules/planning.md` | Plan doc format, sizing thresholds, naming, architect gate sequence | L-sized → plan doc required; design docs at `plans/<slug>/<slug>-design.md` |
| `rules/plan-docs.md` | When plan docs are created, location, skip conditions | S/M → no plan doc; `plans/` is gitignored (session artifacts); committed docs go in `docs/` |
| `rules/filesystem/efficiency.md` | Search and read patterns | No unscoped globs; plan-doc-first during execution; prefer graph tools over Grep |
| `rules/mcp-governance.md` | MCP tool access | No direct Atlassian MCP calls; JQL must include `project=` filter |
| `rules/plugin-lifecycle.md` | Plugin routing, conflict suppression | Integrated plugins route via `creating-tools`; do not invoke directly |
| `rules/cspell.md` | Spellcheck false positives | Auto-add to `cspell.json` without asking |

---

## Hook Map

Hooks live in `hooks/` and are symlinked to `~/.claude/hooks/` by setup.sh.

| Hook | Trigger | What it does |
|------|---------|--------------|
| `pre-commit` | Before every git commit | Runs per-repo `scripts/run-tests.sh` if executable; runs ESLint and ruff if their config files are present; runs gitleaks secret scanning if installed. All checks skip gracefully if the tool is absent. |

---

## Plugin Lifecycle

Plugins are Claude Code extensions installed via `claude plugin install`. Their lifecycle state
is tracked in `plugins/registry.md` and enforced by `scripts/setup.sh` (step 7).

| State | Meaning | Routing |
|-------|---------|---------|
| Active | Installed, invoked directly | Normal skill/agent triggers |
| Integrated | Installed, orchestrated via `creating-tools` | Route through `creating-tools` only |
| Deprecated | Installed but pending cleanup | Warn; do not rely on |
| Removed | Uninstalled; registry entry archived | setup.sh removes on next run |

Current plugin states: see `plugins/registry.md` for authoritative list.

---

## Priority Hierarchy

When instructions conflict, this order determines which wins:

1. `CLAUDE.md` (global, highest)
2. `rules/*.md` (rules override skills)
3. `skills/*/skill.md` (lowest, but primary driver of behavior)

**Implication:** If a rule says to do X and a skill says to do Y, X wins — even if Y is more
recently written. Audit with `adherence-audit` skill to find active conflicts.
