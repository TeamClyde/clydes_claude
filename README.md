# claude-workflow-improvements

Personal Claude Code workflow dotfiles — agents, skills, rules, hooks, and plugins that install to `~/.claude/` via symlinks. Run `setup.sh` on any machine to restore the full workflow.

---

## Restore on a New Machine

```bash
git clone <repo-url>
cd claude-workflow-improvements
bash scripts/setup.sh
```

See [Prerequisites](#prerequisites) if the script reports missing tools.

---

## What Gets Installed

### Agents (7)

Invoked via the `Agent` tool with `subagent_type: <name>`.

| Agent | Role |
|-------|------|
| `architect` | Plan reviewer — returns BLOCKING / MINOR / APPROVED before ExitPlanMode or task completion |
| `integration-engineer` | Maps cross-repo endpoints and contracts using local codebase MCPs |
| `jira-workflow-manager` | All Jira operations: ticket creation, status transitions, comments |
| `researcher` | Codebase and infrastructure lookups — keeps search out of the main context window |
| `test-builder` | Writes failing tests from the test strategy before implementation begins |
| `test-strategy` | Derives per-plan validation criteria after architect approval |

### Skills (19)

Invoked via the `Skill` tool with `skill: <name>`.

| Skill | Role |
|-------|------|
| `brainstorming` | Interactive spec authoring with a visual companion |
| `dispatching-parallel-agents` | Pattern for fanning out independent tasks to parallel agents |
| `e2e-init` | Per-repo testing backbone — produces `testing-plan.md` and `run-tests.sh` |
| `executing-plans` | Step-by-step plan execution with task tracking |
| `finishing-a-development-branch` | Pre-merge checklist: tests, review, PR creation |
| `git-manager` | All git operations: commits, branching, push, PR creation |
| `infra-init` | Codebase indexing via codebase-memory-mcp — produces `.claude-init/CODEBASE.md` and `.claude-init/enrichments.json` |
| `plan-gate` | Bridges planning to execution: architect review, test strategy, Jira tickets |
| `plan-management` | TODO.md maintenance and plan doc status tracking |
| `receiving-code-review` | Structured response to code review feedback |
| `requesting-code-review` | Pre-review checklist and review request formatting |
| `subagent-driven-development` | Implementation via parallel subagents with spec review |
| `systematic-debugging` | Root-cause-first debugging protocol |
| `test-driven-development` | TDD cycle: failing test → minimal impl → passing test |
| `using-git-worktrees` | Isolated feature work in git worktrees |
| `using-superpowers` | Session initialization — loads available skills and conventions |
| `verification-before-completion` | Pre-commit checklist before claiming work is done |
| `writing-plans` | Comprehensive implementation plan authoring |
| `writing-skills` | Skill definition authoring and testing |

### Rules (7)

Always-on instructions loaded by Claude Code in every session:

| Rule | What it enforces |
|------|-----------------|
| `filesystem-efficiency.md` | Targeted reads, scoped globs, no speculative file exploration |
| `filesystem/efficiency.md` | Filesystem efficiency rules (subdirectory variant, loaded as a unit) |
| `mcp-governance.md` | Route Jira through jira-workflow-manager; no wildcard MCP queries |
| `new-repo-setup.md` | Onboarding checklist when starting in a new repository |
| `plan-docs.md` | When and how to create plan docs; size thresholds |
| `planning.md` | Plan doc structure, architect review gates, task sizing |
| `workflow-phases.md` | Jira + Git workflow phases: planning, execution, commits |

### Plugins (13)

Installed automatically by `setup.sh` via `claude plugin install`:

| Plugin | Purpose |
|--------|---------|
| `atlassian` | Jira and Confluence via browser session auth |
| `aws-serverless` | AWS Lambda, API Gateway, SAM/CDK deployment |
| `claude-code-setup` | Claude Code automation recommender |
| `claude-md-management` | CLAUDE.md auditing and improvement |
| `commit-commands` | Commit, push, and PR slash commands |
| `context7` | Fetches current library/framework documentation |
| `explanatory-output-style` | Response formatting conventions |
| `feature-dev` | Feature development with codebase exploration |
| `plugin-dev` | Plugin and skill authoring |
| `pyright-lsp` | Python type checking and symbol resolution |
| `security-guidance` | Security review guidance |
| `skill-creator` | Skill creation and improvement tooling |
| `superpowers` | Core workflow skills (writing-plans, plan-gate, etc.) |

### Global CLAUDE.md

Root `CLAUDE.md` is symlinked to `~/.claude/CLAUDE.md`. It sets mandatory delegation (git → `git-manager`, Jira → `jira-workflow-manager`) and architect review gates.

### MCP Servers

`setup.sh` merges three MCP server entries into `~/.claude/settings.json`:

| Server | Purpose |
|--------|---------|
| `bitbucket` | PR management and repo browsing via Bitbucket Cloud API |
| `atlassian` | Jira and Confluence via browser session auth (`claude mcp auth atlassian`) |
| `git` | Local git history, blame, diffs — no auth required |

---

## Repo Structure

```
claude-workflow-improvements/
├── CLAUDE.md                   — global Claude Code instructions (symlinked to ~/.claude/CLAUDE.md)
├── README.md
├── agents/                     — agent definition files (symlinked to ~/.claude/agents/)
├── skills/                     — skill directories (each symlinked to ~/.claude/skills/<name>/)
├── rules/                      — always-on rule files (symlinked to ~/.claude/rules/)
│   └── filesystem/             — subdirectory, symlinked as a unit
├── hooks/
│   └── pre-commit              — global pre-commit hook (symlinked to ~/.claude/hooks/pre-commit)
├── templates/                  — project templates (not symlinked; copied on use)
├── docs/                       — public-facing documentation
│   └── superpowers/specs/      — brainstorming and design specs
└── scripts/
    └── setup.sh                — idempotent installer
```

---

## Prerequisites

| Tool | Install |
|------|---------|
| [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) | `npm install -g @anthropic-ai/claude-code` |
| [Node.js + npm](https://nodejs.org) | nodejs.org |
| [Python 3.9+](https://python.org) | python.org |
| [Python 3.11 or 3.14](https://python.org) | Required by `infra-init` skill |
| [uv](https://docs.astral.sh/uv/) | `pip install uv` or see uv docs |
| [pre-commit](https://pre-commit.com) | `pip install pre-commit` |
| Git | [git-scm.com](https://git-scm.com) |

**Windows note:** Symlinks require Developer Mode (`Settings → System → For developers → Developer Mode`) or running the script as Administrator.

---

## Adding or Updating Workflow Components

Edit files in place — symlinks keep `~/.claude/` in sync automatically. To re-create all symlinks after adding new files:

```bash
bash scripts/setup.sh --force
```

---

## After Setup

1. Run `claude mcp list` to verify MCP servers are registered.
2. Authenticate Atlassian: `claude mcp auth atlassian`
3. Add Bitbucket credentials to `~/.claude/settings.json` under `mcpServers.bitbucket.env`:
   - `BITBUCKET_USERNAME`
   - `BITBUCKET_APP_PASSWORD`
4. When starting work in any repo, run the `using-superpowers` skill to initialize the session.
