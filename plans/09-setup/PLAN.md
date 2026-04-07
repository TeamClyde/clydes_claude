# Developer Setup — Sub-Plan

**Parent Plan:** [MAIN-PLAN.md](../MAIN-PLAN.md)
**Status:** Designing
**Priority:** 9

---

## Purpose

A single setup script (`scripts/setup.sh`) that any developer can run to install the full Claude workflow stack on a new machine. Agents, skills, and rules live at user level (`~/.claude/`) so they are available across all repos without per-project copies. Running the script is the only manual step required — everything else is deployed automatically.

---

## Prerequisites

Before running setup, the developer needs:

| Requirement | How to install |
|-------------|---------------|
| Node.js + npm | `https://nodejs.org` |
| Python 3.9+ | Pre-installed on macOS/Linux; `https://python.org` on Windows |
| `pre-commit` framework | `pip install pre-commit` (required for per-repo pre-commit hooks) |
| Claude Code CLI | `npm install -g @anthropic-ai/claude-code` |
| Bitbucket app password | Generate in Bitbucket → Account Settings → App Passwords |
| Atlassian API token | Generate at `id.atlassian.com/manage/api-tokens` |
| Git | Pre-installed on macOS/Linux; Git for Windows on Windows |

macOS and Windows are both supported. Git for Windows is required on Windows. Python is required on both platforms — most repos will need it for the `pre-commit` framework and per-repo test runners.

---

## What Gets Installed

### Agents (`~/.claude/agents/`)

Sources: Plan 05 Agent Registry is authoritative.

| Agent | Description | Plan |
|-------|-------------|------|
| `architect` | Plan reviewer — BLOCKING / MINOR / APPROVED | 05 |
| `researcher` | Factual lookups from codebase, files, and MCPs | 05 |
| `integration-engineer` | Cross-repo endpoint and contract mapping | 05 |
| `test-strategy` | Per-plan validation criteria | 03 |
| `test-builder` | Writes test code from test strategy spec, parallel with implementation | 03 |
| `jira-workflow-manager` | All Jira operations | 02 |

The three `infra-init-*` agents (`infra-init-structure`, `infra-init-batch-indexer`, `infra-init-graph-builder`) are spawned inline by the `/infra-init` skill at runtime. Their prompt files live in `agents/` inside the skill directory (`~/.claude/skills/infra-init/agents/`) — the directory symlink created by `setup.sh` includes them automatically. No separate install step is needed.

### Skills (`~/.claude/skills/`)

Source: Plan 08 Skill Registry is authoritative.

| Skill | Description | Plan |
|-------|-------------|------|
| `git-manager` | All git operations: commits, branching, push, PR | 04 / 08 |
| `infra-init` | Codebase graph generation orchestrator | 01 / 08 |
| `e2e-init` | Per-repo testing backbone setup | 03 / 08 |
| `plan-management` | TODO.md maintenance and plan tracking | 06 / 08 |

### Rules (`~/.claude/rules/`)

Source: Plan 07 Rule Registry is authoritative.

| Rule File | Load Mode |
|-----------|-----------|
| `filesystem-efficiency.md` | Always-on |
| `planning.md` | Path-scoped: `plans/**/*.md` |
| `new-repo-setup.md` | Path-scoped: `CLAUDE.md`, `.claude/**` |

### MCP Servers

| MCP Server | Package | Purpose |
|------------|---------|---------|
| Bitbucket | `@aashari/mcp-server-atlassian-bitbucket` | PR management, repo discovery |
| Jira / Confluence | Atlassian remote MCP | Ticket creation, transitions |
| Git (local) | `@modelcontextprotocol/server-git` | Local git operations |

**tree-sitter / language-server MCPs:** Per-repo install, not global. Different repos need different language configs. Install these separately when setting up each repo.

---

## Implementation Order

Build the plans in this sequence. Each phase can begin when its dependencies are complete.

```
Phase 1 — No dependencies (start here):
  Plan 04 — Git Workflow: git-manager skill (most self-contained)
  Plan 07 — Rules System: draft always-on rules first

Phase 2 — Depends on Phase 1:
  Plan 01 — Codebase Knowledge: infra-init skill + 3 agents + MCP tools
  Plan 05 — Agent Architecture: architect, researcher, integration-engineer agents

Phase 3 — Depends on Phase 2:
  Plan 02 — Jira Integration: jira-workflow-manager agent + policy files
  Plan 03 — Testing System: e2e-init skill, test-strategy agent, test-builder agent

Phase 4 — Depends on Phase 3:
  Plan 06 — Plan Management: plan-management skill
  Plan 08 — Skills System: finalize all 4 skills (git-manager, infra-init, e2e-init, plan-management)

Phase 5 — Depends on all above:
  Plan 07 — Rules System: finalize path-scoped rules (depend on agents from 01–06)
  Plan 09 — Developer Setup: write setup.sh once all files exist to copy
```

**Why this order:** `git-manager` is built first because it has no agent dependencies. The infra-init agents (Plan 01 + 05) come next because Plan 02 and Plan 03 agents depend on the codebase graph being available. Plan 06 (Plan Management) and Plan 08 (Skills) come last because they depend on having all other agents' specs finalized.

---

## Setup Script Spec

**Location:** `scripts/setup.sh`
**Language:** Bash — runs on macOS, Linux, and Windows (Git for Windows)
**Idempotent:** Safe to re-run. Existing symlinks are not replaced unless `--force` is passed.

### Install strategy: symlinks, not copies

Agents and skills are installed as **symlinks** pointing back into this repo. This means any update committed to the repo is immediately reflected in `~/.claude/` — no re-run of setup required.

- `~/.claude/agents/<agent>.md` → symlink to `<repo>/agents/<agent>.md`
- `~/.claude/skills/<skill>/` → symlink to `<repo>/skills/<skill>/`
- `~/.claude/rules/<rule>.md` → symlink to `<repo>/rules/<rule>.md`

Rules files are also symlinked so rule updates propagate automatically.

**Platform note:** Symlink creation differs by platform. The script handles both:
- **Unix (macOS / Linux / Git for Windows bash):** `ln -s <target> <link>`
- **Windows (native PowerShell):** `New-Item -ItemType SymbolicLink -Path <link> -Target <target>`

On Windows, creating symlinks requires either Developer Mode enabled (no elevation needed) or running the terminal as Administrator. The script detects the platform and uses the appropriate command. If symlink creation fails on Windows, the script prints an actionable error explaining the requirement.

### What the script does

```bash
1. Check prerequisites (node, npm, python, pre-commit, claude CLI, git)
2. Create ~/.claude/ directory structure if missing
3. Symlink each agent file: agents/ from repo → ~/.claude/agents/ (skips infra-init-* — runtime-only, no files to link)
4. Symlink each skill directory: skills/ from repo → ~/.claude/skills/
5. Symlink each rules file: rules/ from repo → ~/.claude/rules/
6. Install global pre-commit hook: symlink hooks/pre-commit → ~/.claude/hooks/pre-commit; chmod +x
7. Install MCP npm packages globally
8. Merge MCP entries into ~/.claude/settings.json (additive — does not overwrite existing entries)
9. Print summary: what was linked / what was already up to date
```

**Pre-commit hook note:** The global hook at `~/.claude/hooks/pre-commit` is installed by `setup.sh`. Per-repo pre-commit configuration (`.pre-commit-config.yaml`) is created by `/e2e-init` during repo onboarding — `setup.sh` only installs the global entry point. Both macOS and Windows (Git for Windows) support the global hook; the `pre-commit` Python framework handles cross-platform execution within each repo.

### Settings.json merge strategy

The script does not overwrite `~/.claude/settings.json`. It merges MCP entries additively: for each MCP in the install list, add it if not already present. If already present, skip it (do not overwrite unless `--force`).

---

## Credential Setup

The script installs packages and config — it does not handle secrets. Each developer sets these up once manually:

| Credential | Environment Variable |
|------------|---------------------|
| Bitbucket username | `BITBUCKET_USERNAME` |
| Bitbucket app password | `BITBUCKET_APP_PASSWORD` |
| Atlassian API token | `ATLASSIAN_API_TOKEN` |
| Atlassian base URL | `ATLASSIAN_BASE_URL` |
| Atlassian email | `ATLASSIAN_EMAIL` |

These can be set in shell profile (`~/.zshrc`, `~/.bashrc`, or Windows environment variables) or passed directly to MCP config.

`scripts/README.md` documents the credential setup steps.

---

## Verification Steps

After running `scripts/setup.sh`, verify each component:

| Component | Verification |
|-----------|-------------|
| `git-manager` skill | Run `/git-manager commit files:[README.md] type:chore description:"test commit"` on a test repo — should stage and commit |
| `/infra-init` skill | Run `/infra-init` on this repo (`claude-workflow-improvements`) — should produce `codebase-graph.json` and `CODEBASE.md` |
| `jira-workflow-manager` agent | Create a test Jira ticket — agent should create it and return a key |
| `/e2e-init` skill | Run `/e2e-init` on a sample repo — should produce `.claude/testing-plan.md` |
| `architect` agent | Invoke with the path to any plan doc in `plans/` — should return BLOCKING / MINOR / APPROVED feedback |
| MCP servers | Run `claude mcp list` — all 3 MCP servers should appear |

---

## Deliverables

| # | Deliverable | Location | Notes |
|---|-------------|----------|-------|
| 1 | Setup script | `scripts/setup.sh` | Idempotent; supports `--force` flag |
| 2 | Scripts README | `scripts/README.md` | Credential setup instructions |
| 3 | MCP settings template | `templates/mcp-settings.json` | Merged into `~/.claude/settings.json` by setup script |

---

## Cross-Plan Dependencies

| Plan | Relationship | Notes |
|------|-------------|-------|
| Plan 01 — Codebase Knowledge | Installs infra-init skill (3 infra-init agents are runtime-only, no files) | Phase 2 |
| Plan 02 — Jira Integration | Installs jira-workflow-manager agent | Phase 3 |
| Plan 03 — Testing System | Installs e2e-init skill, test-strategy agent, test-builder agent | Phase 3 |
| Plan 04 — Git Workflow | Installs git-manager skill | Phase 1 |
| Plan 05 — Agent Architecture | Installs architect, researcher, integration-engineer agents | Phase 2 |
| Plan 06 — Plan Management | Installs plan-management skill | Phase 4 |
| Plan 07 — Rules System | Installs 3 rule files (filesystem-efficiency.md, planning.md, new-repo-setup.md) | Phase 1 (always-on) + Phase 5 (path-scoped) |
| Plan 08 — Skills System | Final skill specs must be confirmed before script symlinks them | Phase 4 |

---

## Open Questions

None.
