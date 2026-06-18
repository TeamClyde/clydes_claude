# Plugin Registry

This file is the ground truth for integration state, domain ownership, and pinned version for installed plugins.

It coexists with `~/.claude/plugins/installed_plugins.json`, which is managed by the Claude Code plugin system and is the ground truth for what is physically installed. `registry.md` is the ground truth for how each plugin integrates with the orchestration layer.

---

## skill-creator

- **Source:** https://github.com/claude-ai/skill-creator (claude-plugins-official)
- **State:** Integrated
- **Pinned version:** unknown (installed 2026-04-20; no git SHA recorded by plugin system)
- **Skills provided:** `skill-creator:skill-creator`
- **Domain ownership:** CSO benchmarking and A/B description comparison — delegated to via the eval phase in `writing-skills`.
- **Last audited:** 2026-04-20
- **Notes:**
  - Routed through `writing-skills` eval phase. Do not invoke `skill-creator:skill-creator` directly.
  - Windows patches applied at install time.

---

## plugin-dev

- **Source:** https://github.com/claude-ai/plugin-dev (claude-plugins-official)
- **State:** Integrated
- **Pinned version:** unknown (installed 2026-04-20; no git SHA recorded by plugin system)
- **Skills provided:** `plugin-dev:hook-development`, `plugin-dev:mcp-integration`, `plugin-dev:plugin-structure`, `plugin-dev:plugin-settings`, `plugin-dev:command-development`, `plugin-dev:agent-development`, `plugin-dev:skill-development`, `plugin-dev:create-plugin`
- **Domain ownership:** Structural guidance for all component types (file structure, frontmatter fields, section conventions). Process guidance for hooks and commands.
- **Last audited:** 2026-04-20
- **Notes:**
  - 7 skills delegated to via `creating-tools`: hook-development, mcp-integration, plugin-structure, plugin-settings, command-development, agent-development, skill-development.
  - `plugin-dev:create-plugin` (8-phase guided workflow) is also a delegation target.
  - Never invoke plugin-dev skills directly — always route through `creating-tools`.
  - Windows patches applied at install time.

---

## atlassian

- **Source:** claude-plugins-official marketplace (`anthropics/claude-plugins-official`)
- **State:** Active
- **Pinned version:** `9b52fb18e184` (gitCommitSha)
- **Provides:** Atlassian MCP (Jira + Confluence) + skills `atlassian:capture-tasks-from-meeting-notes`, `:generate-status-report`, `:search-company-knowledge`, `:spec-to-backlog`, `:triage-issue`.
- **Domain ownership:** Jira/Confluence integration. MCP tools are **never called directly** — routed through the `jira-workflow-manager` agent per `rules/mcp-governance.md`.
- **Last audited:** 2026-06-18
- **Notes:** Jira disabled in this repo (`project.json` jira.enabled=false); used in other repos. MCP tool schemas deferred via Tool Search.

---

## aws-serverless

- **Source:** claude-plugins-official marketplace (`anthropics/claude-plugins-official`)
- **State:** Active
- **Pinned version:** `d3a93d70cb46` (gitCommitSha)
- **Provides:** AWS Serverless MCP + skills `aws-serverless:aws-lambda`, `:api-gateway`, `:aws-serverless-deployment`, `:aws-lambda-durable-functions`.
- **Domain ownership:** AWS serverless development (Lambda / SAM / API Gateway / event source mappings).
- **Last audited:** 2026-06-18
- **Notes:** Largest MCP tool surface (~30 tools); context cost mitigated by Tool Search (`ENABLE_TOOL_SEARCH=true`). Read-only by default — generates templates, never auto-deploys.

---

## context7

- **Source:** claude-plugins-official marketplace (`anthropics/claude-plugins-official`)
- **State:** Active
- **Provides:** Context7 MCP (`resolve-library-id`, `query-docs`) — live library/framework documentation lookup.
- **Domain ownership:** Up-to-date external library docs; preferred over web search for library API/config/CLI questions.
- **Last audited:** 2026-06-18
- **Notes:** Stray local-scope enable in `template-image-generator` disabled + purged 2026-06-18; user-scope install retained.

---

## playwright

- **Source:** claude-plugins-official marketplace (`anthropics/claude-plugins-official`)
- **State:** Active
- **Provides:** Playwright MCP (browser automation — navigate, click, snapshot, network, etc.).
- **Domain ownership:** Browser-driven E2E / frontend verification.
- **Last audited:** 2026-06-18
- **Notes:** Situational; tool schemas deferred via Tool Search.

---

## pyright-lsp

- **Source:** claude-plugins-official marketplace (`anthropics/claude-plugins-official`)
- **State:** Active
- **Provides:** Pyright language-server integration (Python symbol resolution, type inference).
- **Domain ownership:** Code-level Python lookups during planning. Referenced in `rules/filesystem/efficiency.md` as the planning-time symbol/type/enum lookup tool (replacement for grepping source).
- **Last audited:** 2026-06-18

---

## claude-md-management

- **Source:** claude-plugins-official marketplace (`anthropics/claude-plugins-official`)
- **State:** Active
- **Provides:** `claude-md-management:revise-claude-md` (command), `claude-md-management:claude-md-improver` (skill).
- **Domain ownership:** CLAUDE.md auditing and improvement. No local equivalent.
- **Last audited:** 2026-06-18

---

## security-guidance

- **Source:** claude-plugins-official marketplace (`anthropics/claude-plugins-official`)
- **State:** Active
- **Provides:** PreToolUse hook (`Edit|Write|MultiEdit`) — multi-layer secure-coding review (regex pattern warnings → LLM diff review → agentic commit-time reviewer) for injection / XSS / secrets / unsafe-deserialization in code being written.
- **Domain ownership:** Continuous edit-time secure-coding review of **own code**. Distinct surface from install-vetting (`vet-*`, which reviews **third-party tools** pre-install) and from `/security-review` (manual, on-demand) — it complements both rather than duplicating them.
- **Last audited:** 2026-06-18
- **Notes:**
  - Hook shells to `python3` on every edit — verify it resolves on Windows/git-bash per `rules/filesystem/path-portability.md`; if silently erroring, fix or disable.
  - Stray local-scope enable in `template-image-generator` disabled + purged 2026-06-18; user-scope install retained.

---

## explanatory-output-style

- **Source:** claude-plugins-official marketplace (`anthropics/claude-plugins-official`)
- **State:** Active
- **Provides:** "explanatory" output style (educational insights during work).
- **Domain ownership:** Personal output-style preference. Not part of the orchestration layer.
- **Last audited:** 2026-06-18

---

## marketing-skills (project-scoped)

- **Source:** `github.com/coreyhaines31/marketingskills` (marketingskills marketplace — third-party, not Anthropic-official)
- **State:** Active (project: `template-image-generator`)
- **Pinned version:** `1.9.0` (`114587831efb`)
- **Provides:** Marketing / Amazon-listing skills.
- **Domain ownership:** `template-image-generator` repo only. Niche; not global.
- **Last audited:** 2026-06-18
- **Notes:** Only installed plugin from a non-official marketplace — apply the Pre-Install Checklist / install-vetting funnel on any update.

---

## frontend-design (project-scoped)

- **Source:** claude-plugins-official marketplace (`anthropics/claude-plugins-official`)
- **State:** Active (project: `klondike_gui`)
- **Provides:** Frontend design guidance skills/agents.
- **Domain ownership:** `klondike_gui` repo only.
- **Last audited:** 2026-06-18

---

## superpowers

- **Source:** https://github.com/claude-ai/superpowers (claude-plugins-official)
- **State:** Removed
- **Pinned version:** unknown (installed 2026-04-20; no git SHA recorded by plugin system)
- **Skills provided:** `superpowers:using-superpowers`, `superpowers:brainstorming`, `superpowers:test-driven-development`, `superpowers:systematic-debugging`, `superpowers:writing-plans`, `superpowers:executing-plans`, `superpowers:writing-skills`, `superpowers:subagent-driven-development`, `superpowers:dispatching-parallel-agents`, `superpowers:using-git-worktrees`, `superpowers:finishing-a-development-branch`, `superpowers:requesting-code-review`, `superpowers:receiving-code-review`, `superpowers:verification-before-completion`, `superpowers:code-reviewer` (agent).
- **Domain ownership:** Superseded. All skills fully covered by local equivalents in `skills/`.
- **Last audited:** 2026-04-20
- **Notes:**
  - Integrated (local skills took priority), then removed. Local skills (`brainstorming`, `test-driven-development`, `writing-plans`, etc.) are the canonical entry points.
  - setup.sh enforces removal: `claude plugin uninstall superpowers` runs on every setup run while this entry is Removed.
  - 2026-06-18: a surviving local-scope enable + install record in `template-image-generator` (missed by setup.sh's user-scope `uninstall`) was disabled and purged from `installed_plugins.json`. setup.sh's uninstall does **not** cover project/local-scope enables — see the `reference-windows-plugin-local-scope` memory.

---

## commit-commands

- **Source:** claude-plugins-official marketplace (`anthropics/claude-plugins-official`)
- **State:** Removed (2026-06-18)
- **Provided:** `/commit`, `/commit-push-pr`, `/clean_gone`.
- **Reason:** Overlapped and conflicted with the `git-manager` skill — the mandated git path (`CLAUDE.md`: never run git directly). git-manager does strictly more (Jira trailers, plan-doc sync, branch safety).
- **Fold-in flagged:** `/clean_gone` ([gone]-branch + worktree pruning), a capability git-manager lacks — TeamClyde/clydes_claude #71.

---

## feature-dev

- **Source:** claude-plugins-official marketplace (`anthropics/claude-plugins-official`)
- **State:** Removed (2026-06-18)
- **Provided:** agents `code-architect`, `code-explorer`, `code-reviewer`; `/feature-dev` 7-phase command.
- **Reason:** Overlapped `brainstorming` / `writing-plans` / `architect` / `Explore` / `requesting-code-review`, and `/feature-dev` bypassed the plan-doc → plan-gate → architect pipeline entirely.
- **Fold-in flagged:** parallel multi-lens reviewer (3 concurrent reviewers — simplicity/bugs/conventions — with ≥80%-confidence filtering) into `requesting-code-review` — TeamClyde/clydes_claude #72.

---

## claude-code-setup

- **Source:** claude-plugins-official marketplace (`anthropics/claude-plugins-official`)
- **State:** Removed (2026-06-18)
- **Provided:** `claude-automation-recommender` skill (read-only; recommends top automations per category).
- **Reason:** Overlapped `project-setup` (which actually configures, not just recommends) + `adherence-audit` (drift detection). Recommend-only; superseded for a mature workflow.

---

## Lifecycle State Machine

```
Active      — installed, using directly, no local orchestration layer
Integrated  — installed, delegated to via creating-tools, not invoked directly
Deprecated  — orchestration removed, plugin still installed, pending cleanup
Removed     — uninstalled, registry entry archived
```

## Upstream Drift Protocol

When an Integrated plugin releases a new version, diff its SKILL.md files against the pinned version in the registry. If the diff touches any of the following, update the orchestration layer before upgrading:
- Trigger descriptions (CSO)
- Eval script APIs
- Agent frontmatter fields

After confirming compatibility: update the **Pinned version** and **Last audited** date.

## Pre-Install Checklist (for future plugins)

Before installing any new plugin:

1. List its skill names and trigger descriptions.
2. Compare against existing skills in `~/.claude/skills/` for name and trigger overlap.
3. If overlap found: define domain boundary before installing.
4. Add to `registry.md` with state `Active` before first use.

## When to Promote Integrated → Removed

1. All its capabilities are now covered by local skills (full supersession)
2. Upstream abandoned (no commits in 12 months, open issues unaddressed)
3. Irresolvable conflict (governance rule not sufficient to suppress direct invocation)

Document the reason in the registry entry before transitioning to Removed.
