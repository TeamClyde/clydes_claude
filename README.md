# clydes_claude

Portable Claude Code workflow setup — agents, skills, rules, and MCP configuration that install to `~/.claude/` on any machine.

Clone once, run setup, and every Claude Code session has the full workflow available.

---

## Quick Start

```bash
git clone https://github.com/TeamClyde/clydes_claude.git
cd clydes_claude
bash scripts/setup.sh
```

That's it. See [Prerequisites](#prerequisites) if the script reports missing tools.

---

## What Gets Installed

### Agents

Invoked via the `Agent` tool with `subagent_type: <name>`.

| Agent | Role |
|-------|------|
| `architect` | Plan reviewer — returns BLOCKING / MINOR / APPROVED before ExitPlanMode or task completion |
| `jira-workflow-manager` | All Jira operations: ticket creation, status transitions, comments |
| `researcher` | Codebase and infrastructure lookups — keeps search out of the main context window |
| `test-strategy` | Derives per-plan validation criteria before implementation begins |
| `test-builder` | Writes test code from the test strategy, in parallel with implementation |
| `integration-engineer` | Maps cross-repo endpoints and contracts using local codebase MCPs |

### Skills

Invoked via the `Skill` tool with `skill: <name>`.

| Skill | Role |
|-------|------|
| `git-manager` | All git operations: commits, branching, push, PR creation |
| `infra-init` | Codebase graph generation — produces `codebase-graph.json` and `CODEBASE.md` |
| `e2e-init` | Per-repo testing backbone — produces `testing-plan.md` and `run-tests.sh` |
| `plan-management` | TODO.md maintenance and plan doc status tracking |

### Rules

Always-on instructions loaded by Claude Code in every session:

| Rule | What it enforces |
|------|-----------------|
| `filesystem-efficiency.md` | Targeted reads, scoped globs, plan-doc-first lookups |
| `planning.md` | Plan doc structure, architect review gates, task sizing |
| `new-repo-setup.md` | Onboarding checklist for new repositories |

### Global CLAUDE.md

`output/CLAUDE.md` is symlinked to `~/.claude/CLAUDE.md`. It sets the mandatory delegation table (git → `git-manager`, Jira → `jira-workflow-manager`) and architect review gates.

### MCP Servers

`setup.sh` merges three MCP server entries into `~/.claude/settings.json`:

| Server | Purpose |
|--------|---------|
| `bitbucket` | PR management and repo browsing via Bitbucket Cloud API |
| `atlassian` | Jira and Confluence via browser session auth (`claude mcp auth atlassian`) |
| `git` | Local git history, blame, diffs — no auth required |

---

## Prerequisites

| Tool | Install |
|------|---------|
| [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) | `npm install -g @anthropic-ai/claude-code` |
| [Node.js + npm](https://nodejs.org) | nodejs.org |
| [Python 3.9+](https://python.org) | python.org |
| [uv](https://docs.astral.sh/uv/) | `pip install uv` or see uv docs |
| [pre-commit](https://pre-commit.com) | `pip install pre-commit` |
| Git | [git-scm.com](https://git-scm.com) |

**Windows note:** Symlinks require Developer Mode (`Settings → System → For developers → Developer Mode`) or running the script as Administrator.

---

## Updating

When agents or skills change, pull and re-run setup:

```bash
git pull
bash scripts/setup.sh
```

The script is idempotent — it skips anything already up to date. Use `--force` to replace all symlinks:

```bash
bash scripts/setup.sh --force
```

---

## Repository Structure

```
clydes_claude/
├── README.md
├── CLAUDE.md                  — Guidance for Claude working in this repo
├── scripts/
│   └── setup.sh               — Idempotent installer
├── output/                    — Deliverables (what setup.sh installs)
│   ├── CLAUDE.md              — Global CLAUDE.md → symlinked to ~/.claude/CLAUDE.md
│   ├── agents/                — Agent definition files
│   ├── skills/                — Skill directories (each has SKILL.md + optional agents/)
│   ├── rules/                 — Always-on rule files
│   ├── hooks/
│   │   └── pre-commit         — Global pre-commit hook
│   └── templates/             — Reusable project templates
│       ├── CODEBASE.md        — Codebase documentation template
│       ├── testing-plan.md    — Testing strategy template
│       ├── mcp-settings.json  — MCP server config (merged by setup.sh)
│       ├── codebase-mcp/      — Python MCP server stub for codebase graphs
│       └── ...
└── plans/                     — Design documentation
    ├── MAIN-PLAN.md           — System overview and integration picture
    └── 01–09/PLAN.md          — Per-subsystem design docs
```

---

## After Setup

1. Run `claude mcp list` to verify the three MCP servers are registered.
2. Authenticate Atlassian: `claude mcp auth atlassian`
3. Set `BITBUCKET_USERNAME` and `BITBUCKET_APP_PASSWORD` in your environment for the Bitbucket MCP.
4. When starting work in any repo, follow the checklist in `output/rules/new-repo-setup.md`.
