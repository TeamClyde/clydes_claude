# Component Status

Current implementation status of all workflow components. Update this file when a component is added, removed, deprecated, or changed state.

Last updated: 2026-04-22

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Implemented and stable |
| 🏗️ | In progress — partially implemented |
| ⚠️ | Deprecated — pending cleanup or replacement |
| ❌ | Planned but not yet implemented |

---

## Agents

Invoked via: `Agent { subagent_type: "<name>", prompt: "..." }`

| Agent | Status | Notes |
|-------|--------|-------|
| `architect` | ✅ | Plan reviewer. Inputs: `plan_doc_path`, optional `instructions`. No mode parameter. |
| `jira-workflow-manager` | ✅ | All Jira operations. Never call Atlassian MCP directly. |
| `researcher` | ✅ | Single MCP lookup per instance. One question per call. |
| `integration-engineer` | ✅ | Cross-repo contract mapping. Read-only. |
| `test-strategy` | ✅ | Per-plan validation criteria. Appends Testing section to plan doc. |
| `test-builder` | ✅ | Writes failing tests from Testing section. Never reads implementation source. |
| `test-runner` | ✅ | Post-implementation test executor. Mandates `systematic-debugging` on failure. |
| `infra-init-structure` | ✅ | Spawned by `infra-init` skill — no persistent agent file. |
| `infra-init-batch-indexer` | ✅ | Spawned by `infra-init` skill — no persistent agent file. |
| `infra-init-graph-builder` | ✅ | Spawned by `infra-init` skill — no persistent agent file. |
| `todo-manager` | ⚠️ | Removed. Superseded by `plan-management` skill. |

---

## Skills

Invoked via: `Skill { skill: "<name>", args: "..." }`

### Orchestration

| Skill | Status | Notes |
|-------|--------|-------|
| `brainstorming` | ✅ | Design-first exploration. Hands off to `writing-plans`. |
| `writing-plans` | ✅ | Plan doc author. Hands off to `plan-gate` automatically. |
| `plan-gate` | ✅ | Pre-execution gate: architect → test-strategy → test-builder → tickets → TODO.md. |
| `executing-plans` | ✅ | Sequential task executor with test-runner per task. |
| `subagent-driven-development` | ✅ | Parallel subagent executor; orchestrator runs test-runner. |
| `finishing-a-development-branch` | ✅ | Branch completion: merge, PR, keep, or discard options. |

### Component Creation

| Skill | Status | Notes |
|-------|--------|-------|
| `creating-tools` | ✅ | Entry point for all component creation. Route through here — do not invoke sub-skills directly. |
| `writing-skills` | ✅ | Via `creating-tools` only. TDD methodology. |
| `writing-agents` | ✅ | Via `creating-tools` only. TDD methodology. |
| `writing-rules` | ✅ | Via `creating-tools` only. |

### Infrastructure & Quality

| Skill | Status | Notes |
|-------|--------|-------|
| `infra-init` | ✅ | Codebase graph generation. |
| `e2e-init` | ✅ | Per-repo testing backbone. Creates `testing-plan.md`. |
| `project-setup` | ✅ | New-repo onboarding wizard. |
| `skills/project-setup/detect-stacks.mjs` | ✅ | Marker-to-stack detector for project-setup Phase 3.5 (Stack Setup). |
| `adherence-audit` | ✅ | Semantic consistency checker. |
| `pulser` | ✅ | Skill/agent structural quality check. |

### Git / Plan / Jira

| Skill | Status | Notes |
|-------|--------|-------|
| `git-manager` | ✅ | All git operations. |
| `git-manager-workspace` | ✅ | Multi-worktree variant of `git-manager`. |
| `plan-management` | ✅ | TODO.md maintenance. |

### Thinking & Debugging

| Skill | Status | Notes |
|-------|--------|-------|
| `different-viewpoint` | ✅ | Full Phoenix Checklist sweep. |
| `different-viewpoints-lite` | ✅ | 5-question adversarial challenge. |
| `dispatching-parallel-agents` | ✅ | Parallel agent coordination. |
| `verification-before-completion` | ✅ | Pre-completion gate. |
| `systematic-debugging` | ✅ | Root-cause diagnosis. Mandatory after test-runner FAILURE. |
| `test-driven-development` | ✅ | TDD cycle helper for implementation work. |
| `feedback` | ✅ | Captures workflow friction to `docs/workflow-feedback.md`. |
| `review-workflow` | ✅ | Deep workflow audit. |

### Code Review

| Skill | Status | Notes |
|-------|--------|-------|
| `requesting-code-review` | ✅ | PR creation with structured review request. |
| `receiving-code-review` | ✅ | Processes reviewer feedback. |

### Support

| Skill | Status | Notes |
|-------|--------|-------|
| `using-git-worktrees` | ✅ | Worktree creation and management. |
| `using-superpowers` | ✅ | Conversation-start orientation. |

### Install Vetting

| Skill | Status | Notes |
|-------|--------|-------|
| `vet-install` | ✅ | 3-gate funnel orchestrator. Entry point for all install vetting; never auto-installs. |
| `vet-reputation` | ✅ | Gate 1 — reputation and maintenance check via deps.dev + GitHub. |
| `vet-capability-fit` | ✅ | Gate 2 — capability coverage check; confirms tool covers stated need. |
| `vet-security` | ✅ | Gate 3 — malware/CVE scan via GuardDog + OSV-Scanner. |

---

## Rules

Load priority: rules override skills. Highest priority: `CLAUDE.md`.

| Rule file | Status | Governs |
|-----------|--------|---------|
| `CLAUDE.md` (global) | ✅ | Workflow sequence, delegation table, architect gate |
| `rules/workflow-phases.md` | ✅ | Jira + git phase sequence; two-source plan+journal sync (handoff is live pointer) |
| `rules/planning.md` | ✅ | Plan doc format, sizing, naming, architect gate sequence |
| `rules/plan-docs.md` | ✅ | When plan docs are created, location, skip conditions |
| `rules/filesystem/efficiency.md` | ✅ | Search/read patterns; plan-doc-first; graph tools over Grep |
| `rules/mcp-governance.md` | ✅ | MCP tool access; no direct Atlassian calls; JQL must include project filter |
| `rules/plugin-lifecycle.md` | ✅ | Plugin routing; Integrated plugins route via `creating-tools` |
| `rules/cspell.md` | ✅ | Spellcheck false positives; auto-add without asking |
| `rules/new-repo-setup.md` | ✅ | New repo checklist; CLAUDE.md template |
| `rules/integration-test-constraints.md` | ✅ | Integration test scope and constraint rules |
| `rules/install-vetting.md` | ✅ | Install-vetting funnel policy; 3-gate advisory funnel; surface-to-tool map |

---

## Hooks

| Hook | Status | Trigger | What it does |
|------|--------|---------|--------------|
| `pre-commit` | ✅ | Before every git commit | Runs `scripts/run-tests.sh` (if executable); ESLint (if `.eslintrc` present); ruff (if `pyproject.toml` present); gitleaks (if installed). All checks skip gracefully if the tool is absent. |
| `stack-hat-directive.mjs` | ✅ | SessionStart | Injects per-stack `## Hat` guidance from `~/.claude/stacks/` based on `project.json` `stacks`. Size-budgeted. Phase 1 of stack-hats (detection/install automation: Phase 2b — project-setup Phase 3.5 + detect-stacks.mjs). |
| `install-vetting-advisory.mjs` | ✅ | PreToolUse on Bash | Detects install commands; returns `permissionDecision: "ask"` recommending `vet-install` funnel. Never denies. Silent pass for non-installs. |

---

## Templates

Located in `templates/`. Copied on use — not symlinked.

| Template | Status | Purpose |
|----------|--------|---------|
| `CODEBASE.md` | ✅ | 5-category codebase summary template |
| `codebase-graph.schema.json` | 🗑️ Retired | Replaced by codebase-memory-mcp (global SQLite-backed server) |
| `codebase-mcp/` | 🗑️ Retired | Replaced by codebase-memory-mcp (global SQLite-backed server) |
| `branch-protection.json` | ✅ | Bitbucket API payload for branch protection rules |
| `mcp-settings.json` | ✅ | MCP settings template |
| `pr-description.md` | ✅ | PR description template |
| `testing-plan.md` | ✅ | Starter template for `.claude/testing-plan.md` (used by `e2e-init`) |
