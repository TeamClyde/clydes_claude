# Getting Started

A first walkthrough for setting up the Claude workflow system and running your first planned change. By the end you will have the workflow installed, a repo onboarded, and a feature taken from idea to commit through the gated pipeline.

> **Orientation:** for the *why* behind the system, read [the architecture overview](../explanation/architecture.md). For *what exists*, see [the component inventory](../reference/component-inventory.md). For a visual of how the skills chain together, see [the workflow map](../reference/workflow-map.md).

---

## 1. What you are installing

This repo is a personal Claude Code workflow — skills, agents, rules, and hooks that give Claude structured, consistent behavior across every repository you work in. Once installed, every Claude session has a defined set of slash commands, mandatory review gates, git discipline, and testing protocols — automatically.

The system has a few component classes (full detail in [agents-and-skills](../explanation/features/agents-and-skills.md)):

- **Skills** — invokable procedures (planning, code review, debugging) called via the `Skill` tool.
- **Agents** — isolated subagents Claude dispatches for specific work (architect review, test execution, Jira operations).
- **Rules** — always-on instructions injected into every session (filesystem discipline, MCP governance, delegation).
- **Hooks** — deterministic runtime gates (pre-commit, session-start, pre-tool-use).

---

## 2. Prerequisites

- Claude Code CLI installed and authenticated
- Git configured
- This repo cloned locally

(Full prerequisite table with versions and install links: [how-to/setup](../how-to/setup.md).)

---

## 3. Install the workflow

Run the setup script once. It is idempotent — safe to re-run at any time.

```bash
cd claude-workflow-improvements
bash scripts/setup.sh
```

This symlinks all agents, skills, rules, and hooks into `~/.claude/`. After setup, the workflow is globally available in every repo with no per-repo copies. Verify:

```bash
ls ~/.claude/agents/   ls ~/.claude/skills/   ls ~/.claude/rules/   ls ~/.claude/hooks/
```

If symlinks are stale after adding new components, re-run with `bash scripts/setup.sh --force`.

---

## 4. Onboard a repository

When starting work in a repo that doesn't have the workflow configured, run these in order:

| Step | Command | What it does |
|------|---------|--------------|
| 1 — Project setup (required) | `/project-setup` | Generates `project.json` + a project `CLAUDE.md` with Jira, testing, and workflow preferences. |
| 2 — Codebase graph (200+ source files) | `/infra-init` | Indexes the repo via codebase-memory-mcp; generates `.claude-init/CODEBASE.md` + `enrichments.json` for symbol-level navigation. See [codebase-graph](../explanation/features/codebase-graph.md). |
| 3 — Testing backbone (for TDD) | `/e2e-init` | Generates `.claude/testing-plan.md`, `plans/e2e-plan.md`, `scripts/run-tests.sh`. See [testing-system](../explanation/features/testing-system.md). |

---

## 5. Start a session

At the start of any session in a repo with the workflow installed:

```
/using-superpowers
```

This loads the orientation protocol: reads `project.json`, finds the codebase summary, and gives Claude the context it needs before any work begins.

---

## 6. Run your first planned change

The primary path from idea to committed code (detail in [planning-and-plan-docs](../explanation/features/planning-and-plan-docs.md)):

| You want to… | Run | Notes |
|--------------|-----|-------|
| Design a new feature (approach not obvious) | `/brainstorming` | Clarifying questions, 2–3 options, a design doc. Hands off to `/writing-plans`. |
| Plan a change (approach is clear) | `/writing-plans` | Produces a plan doc with exact paths + task breakdown. Hands off to `/plan-gate`. |
| Execute a plan | `/executing-plans` (sequential) or `/subagent-driven-development` (parallel) | Both run `test-runner` after each task. |
| Debug a failure | `/systematic-debugging` | Always run before proposing a fix — never guess. See [quality-and-review](../explanation/features/quality-and-review.md). |
| Commit / push / PR | `/git-manager` | All git routes through this skill. Never use Bash git directly. See [git-jira-workflow](../explanation/features/git-jira-workflow.md). |

`/writing-plans` automatically hands off to `/plan-gate`, which runs architect review and sets up tests before execution begins. This gating is the heart of the system — see [orchestration-gating](../explanation/features/orchestration-gating.md).

---

## 7. What to read next

| Goal | Read |
|------|------|
| Understand the whole system | [explanation/architecture.md](../explanation/architecture.md) |
| See how components connect | [reference/workflow-map.md](../reference/workflow-map.md) |
| See every component that exists | [reference/component-inventory.md](../reference/component-inventory.md) |
| Understand agents vs skills vs rules | [features/agents-and-skills.md](../explanation/features/agents-and-skills.md) |
| Understand the testing system | [features/testing-system.md](../explanation/features/testing-system.md) |
| Look up a term | [reference/glossary.md](../reference/glossary.md) |
| Install on a fresh machine | [how-to/setup.md](../how-to/setup.md) |

---

## Troubleshooting

**Architect returned NEEDS REVISION:** address BLOCKING findings and re-invoke `plan-gate`. Maximum 3 iterations; surface persistent blockers to the user — do not attempt a fourth round.

**test-runner returned SETUP REQUIRED:** run `/e2e-init` in the repo to generate `.claude/testing-plan.md`.

**test-runner returned FAILURE:** invoke `/systematic-debugging` immediately. Do not attempt a fix until Phase 1 root-cause investigation is complete.

**Symlinks stale after adding a skill/agent:** run `bash scripts/setup.sh --force`.

**Jira operations failing:** confirm you are routing through the `jira-workflow-manager` agent (not Atlassian MCP directly), and check `project.json` for `jira.enabled` and the project key.
