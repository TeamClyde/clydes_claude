# claude-workflow-improvements

Personal Claude Code workflow — agents, skills, rules, and hooks that install to `~/.claude/` via symlinks and give Claude structured, consistent behavior across every repository: gated planning, delegated git/Jira, testing protocols, documentation tooling, and supply-chain vetting. Run `scripts/setup.sh` on any machine to restore the full workflow.

---

## Documentation

The docs follow a pragmatic [Diátaxis](https://diataxis.fr/) layout under [`docs/`](docs/). Start here:

| I want to… | Go to |
|------------|-------|
| **Learn the system hands-on** | [Tutorial: Getting Started](docs/tutorials/getting-started.md) |
| **Install it on a new machine** | [How-To: Setup](docs/how-to/setup.md) |
| **Understand the whole architecture** | [Explanation: Architecture (C1+C2)](docs/explanation/architecture.md) |
| **See every component that exists** | [Reference: Component Inventory](docs/reference/component-inventory.md) — generated, drift-checked (76 components) |
| **See how components depend on each other** | [Reference: Gate Map](docs/reference/gate-map.md) — 140 edges |
| **See the primary skill chain visually** | [Reference: Workflow Map](docs/reference/workflow-map.md) |
| **Look up a term** | [Reference: Glossary](docs/reference/glossary.md) |
| **See what docs the repo aspires to have** | [docs/manifest.md](docs/manifest.md) |

### Subsystem explainers (the "why" and "how")

Each major subsystem has a C3 feature explainer under [`docs/explanation/features/`](docs/explanation/features/):

| Subsystem | Explainer |
|-----------|-----------|
| Orchestration & gating (soft vs hard gates, the executor spectrum) | [orchestration-gating](docs/explanation/features/orchestration-gating.md) |
| Planning & plan docs (the four-file plan tree) | [planning-and-plan-docs](docs/explanation/features/planning-and-plan-docs.md) |
| Git & Jira workflow | [git-jira-workflow](docs/explanation/features/git-jira-workflow.md) |
| Agents & skills (the component model) | [agents-and-skills](docs/explanation/features/agents-and-skills.md) |
| Codebase knowledge graph | [codebase-graph](docs/explanation/features/codebase-graph.md) |
| Documentation tooling | [doc-tools](docs/explanation/features/doc-tools.md) |
| Install vetting (3-gate funnel) | [install-vetting](docs/explanation/features/install-vetting.md) |
| Stack hats (per-stack best-practice) | [stack-hats](docs/explanation/features/stack-hats.md) |
| Testing system (six pillars) | [testing-system](docs/explanation/features/testing-system.md) |
| Quality & review | [quality-and-review](docs/explanation/features/quality-and-review.md) |
| Tool authoring | [tool-authoring](docs/explanation/features/tool-authoring.md) |
| Thinking & session tools | [thinking-and-session-tools](docs/explanation/features/thinking-and-session-tools.md) |

Architecture decisions live under [`docs/explanation/adr/`](docs/explanation/adr/).

---

## Restore on a New Machine

```bash
git clone <repo-url>
cd claude-workflow-improvements
bash scripts/setup.sh
```

Full prerequisites, MCP/credential setup, and verification steps: [docs/how-to/setup.md](docs/how-to/setup.md).

---

## What Gets Installed

`setup.sh` symlinks the workflow into `~/.claude/` (skills, agents, rules, hooks) and the root `CLAUDE.md` (mandatory delegation + architect-review gates). The **authoritative roster of all 76 components** — 40 skills, 13 agents, 14 rules, 9 hooks — is generated and drift-checked in [docs/reference/component-inventory.md](docs/reference/component-inventory.md); it is not hand-maintained here.

### Plugins

Installed separately via `claude plugin install` (tracked outside the component inventory; lifecycle state in `plugins/registry.md`):

| Plugin | Purpose |
|--------|---------|
| `atlassian` | Jira and Confluence via browser session auth |
| `aws-serverless` | AWS Lambda, API Gateway, SAM/CDK deployment |
| `claude-md-management` | CLAUDE.md auditing and improvement |
| `context7` | Fetches current library/framework documentation |
| `plugin-dev` | Plugin and skill authoring (Integrated — routed via `creating-tools`) |
| `playwright` | Browser automation |
| `pyright-lsp` | Python type checking and symbol resolution |
| `skill-creator` | Skill creation and improvement tooling |

### MCP Servers

`setup.sh` merges these into `~/.claude/settings.json`:

| Server | Purpose |
|--------|---------|
| `bitbucket` | PR management and repo browsing via Bitbucket Cloud API |
| `atlassian` | Jira and Confluence (`claude mcp auth atlassian`) |
| `git` | Local git history, blame, diffs — no auth |
| `codebase-memory-mcp` | SQLite code graph (`defer_loading: true`; loaded via Tool Search) |

---

## Repo Structure

```
claude-workflow-improvements/
├── CLAUDE.md                   — global Claude Code instructions (→ ~/.claude/CLAUDE.md)
├── README.md
├── agents/                     — agent definition files (→ ~/.claude/agents/)
├── skills/                     — skill directories (each → ~/.claude/skills/<name>/)
├── rules/                      — always-on + path-scoped rule files (→ ~/.claude/rules/)
│   └── filesystem/             — subdirectory, symlinked as a unit
├── hooks/                      — global pre-commit hook (→ ~/.claude/hooks/)
├── .claude/hooks/              — sessionStart / preToolUse / postToolUse / userPromptSubmit hooks
├── templates/                  — project + manifest + doc templates (copied on use, not symlinked)
├── scripts/                    — setup.sh + harvest-components.mjs (inventory/gate-map generator)
└── docs/                       — public-facing documentation (Diátaxis)
    ├── tutorials/  how-to/  reference/  explanation/
    └── explanation/{architecture.md, features/, adr/}
```

---

## Adding or Updating Workflow Components

Edit files in place — symlinks keep `~/.claude/` in sync automatically. After adding new files, recreate symlinks and regenerate the inventory:

```bash
bash scripts/setup.sh --force   # recreate symlinks
npm run harvest                 # regenerate component-inventory + gate-map
npm run harvest:check           # assert no drift (exit 0)
```

Create new components through the [`creating-tools`](docs/explanation/features/tool-authoring.md) skill — it routes to the correct authoring specialist.

---

## After Setup

1. `claude mcp list` — verify MCP servers are registered.
2. `claude mcp auth atlassian` — authenticate Atlassian.
3. Add Bitbucket/Atlassian credentials per [rules/secrets-handling.md](rules/secrets-handling.md) (never paste secrets into chat).
4. In any repo, run `/using-superpowers` to initialize the session.
