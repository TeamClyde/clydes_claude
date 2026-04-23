# Getting Started

This guide is for engineers setting up the Claude workflow system for the first time, or for anyone who needs a fresh orientation to how the system works.

---

## What Is This?

This repo contains a personal Claude Code workflow — a set of skills, agents, rules, and hooks that give Claude structured, consistent behavior across every repository you work in. Once installed, every Claude session has access to a defined set of slash commands, mandatory review gates, git discipline, and testing protocols — automatically.

The workflow has three layers:
1. **Skills** — slash commands that implement specific workflows (planning, code review, debugging)
2. **Agents** — specialized subagents that Claude dispatches for isolated tasks (architect review, test execution, Jira operations)
3. **Rules** — always-on instructions that override skill defaults (filesystem discipline, MCP governance, delegation requirements)

See `docs/overview.md` for the full system picture and `docs/workflow-map.md` for how components connect.

---

## Prerequisites

- Claude Code CLI installed and authenticated
- Git configured
- This repo cloned locally

---

## Installation

Run the setup script once. It is idempotent — safe to re-run at any time.

```bash
cd claude-workflow-improvements
bash scripts/setup.sh
```

This symlinks all agents, skills, rules, and hooks into `~/.claude/`. After setup, the workflow is globally available in every repo without any per-repo copies.

To verify:
```bash
ls ~/.claude/agents/     # should show all agent .md files
ls ~/.claude/skills/     # should show all skill directories
ls ~/.claude/rules/      # should show all rule .md files
ls ~/.claude/hooks/      # should show pre-commit
```

If symlinks are stale after adding new components, re-run with `--force`:
```bash
bash scripts/setup.sh --force
```

---

## Setting Up a New Repository

When starting work in a repo that doesn't have the Claude workflow configured, run these steps in order:

**Step 1 — Project setup (required)**
```
/project-setup
```
This wizard generates `project.json` and a project `CLAUDE.md` with Jira, testing, and workflow preferences configured for this repo.

**Step 2 — Codebase graph (repos with 200+ source files)**
```
/infra-init
```
Generates `.claude-init/CODEBASE.md` and `.claude-init/codebase-graph.json`. Enables symbol-level navigation without grepping source files.

**Step 3 — Testing backbone (required for TDD workflow)**
```
/e2e-init
```
Generates `.claude/testing-plan.md`, `plans/e2e-plan.md`, and `scripts/run-tests.sh`. Without this, the test-runner agent returns SETUP REQUIRED on every task.

---

## Starting a Conversation

At the start of any Claude session in a repo with the workflow installed:

```
/using-superpowers
```

This loads the orientation protocol: reads `project.json`, finds the codebase summary, and gives Claude the session context it needs before any work begins.

---

## Typical Workflows

### Starting a new feature (M/L work)

```
/brainstorming
```
Collaborative design: clarifying questions, 2–3 approach options, design doc output. Hands off to `/writing-plans` automatically.

### Starting a new feature (S/M work, approach is clear)

```
/writing-plans
```
Produces a plan doc with exact file paths, task breakdown, and architecture blueprint. Hands off to `/plan-gate` automatically, which runs architect review and sets up tests before execution begins.

### Executing a plan

```
/executing-plans   ← sequential, one task at a time
/subagent-driven-development  ← parallel subagents per task
```

Both skills run `test-runner` after each task. On failure, `systematic-debugging` is mandatory before any fix attempt.

### Debugging a failure

```
/systematic-debugging
```
Structured root-cause investigation. Always run this before proposing a fix — never debug by guessing.

### Committing / pushing / PRs

```
/git-manager
```
All git operations route through this skill. Never use Bash git directly.

---

## What to Read Next

| Goal | Read |
|------|------|
| Understand the full system | `docs/overview.md` |
| See how components connect | `docs/workflow-map.md` |
| Understand the agent architecture | `docs/agent-architecture.md` |
| Understand the testing system | `docs/testing-system.md` |
| See all skills and what they do | `docs/skills.md` |
| See current implementation status | `docs/component-status.md` |
| Look up a term | `docs/glossary.md` |

---

## Troubleshooting

**Architect returned NEEDS REVISION:**
Address BLOCKING findings and re-invoke `plan-gate`. Maximum 3 iterations. If BLOCKING issues persist after 3 passes, surface them to the user — do not attempt a fourth round.

**test-runner returned SETUP REQUIRED:**
Run `/e2e-init` in the repo to generate `.claude/testing-plan.md`.

**test-runner returned FAILURE:**
Invoke `/systematic-debugging` immediately. Do not propose or attempt fixes until Phase 1 root-cause investigation is complete.

**Symlinks are stale after adding a new skill/agent:**
Run `bash scripts/setup.sh --force` to recreate all symlinks.

**Jira operations failing:**
Check that you are routing through `jira-workflow-manager` agent and not calling Atlassian MCP tools directly. Check `project.json` to confirm `jira.enabled: true` and the project key is correct.
