# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

This repo contains the delivered Claude workflow system (agents, skills, rules, hooks, templates, setup script) plus the design documentation that explains why things are built the way they are. The deliverables live in `output/` and are installed by `scripts/setup.sh`.

## Repository Structure

```
clydes_claude/
├── README.md
├── CLAUDE.md
├── scripts/
│   └── setup.sh               — Idempotent installer (symlinks output/ into ~/.claude/)
├── output/                    — Deliverables installed by setup.sh
│   ├── CLAUDE.md              — Global CLAUDE.md → symlinked to ~/.claude/CLAUDE.md
│   ├── agents/                — Agent definition files
│   ├── skills/                — Skill directories
│   ├── rules/                 — Always-on rule files
│   ├── hooks/pre-commit       — Global pre-commit hook
│   └── templates/             — Reusable project templates + MCP config
└── plans/
    ├── MAIN-PLAN.md           — System overview, current/desired state, sub-plan index
    ├── 01-infrastructure-as-code/PLAN.md
    ├── 02-jira-integration/PLAN.md
    ├── 03-testing-system/PLAN.md
    ├── 04-git-workflow/PLAN.md
    ├── 05-agent-architecture/PLAN.md
    ├── 06-plan-management/PLAN.md
    ├── 07-rules/PLAN.md
    ├── 08-skills/PLAN.md
    └── 09-setup/PLAN.md
```

## Architecture

**Sub-plan dependency order** (implement in this sequence):

```
01-infrastructure-as-code  (no deps — start here)
        ↓
02-jira-integration  ←→  03-testing-system
        ↓                       ↓
04-git-workflow                 ↓
        ↓                       ↓
05-agent-architecture  ←────────┘
        ↓
06-plan-management  (depends on all above)
        ↓
07-rules  +  08-skills  (parallel — depend on 01–06)
        ↓
09-setup  (final — installs everything)
```

**MAIN-PLAN.md** is the canonical source of truth for overall status, success metrics, and cross-subsystem integration notes. Each numbered PLAN.md covers one subsystem in isolation.

## Working in This Repo

- Read `plans/MAIN-PLAN.md` first when starting any new session — it contains current status, open questions, and the integration picture.
- Each sub-plan is designed to be worked in a separate focused chat session.
- After completing a sub-plan, update `plans/MAIN-PLAN.md` with completion status, implementation notes, and any impact on success metrics.

## Cross-Plan Synchronization — Mandatory

Sub-plans overlap and impact each other. When editing or reviewing any sub-plan:

1. **Identify ripple effects.** Before finalizing any change, ask: does this affect assumptions, interfaces, or deliverables in other sub-plans? The dependency graph in `MAIN-PLAN.md` and the Architecture section above show the primary links, but overlaps also occur laterally (e.g. testing assumptions in 04 may constrain agent design in 06).

2. **Ask before assuming.** If a change in one sub-plan could plausibly conflict with another and the right answer is not obvious, surface it to the user before writing anything. Don't silently resolve conflicts.

3. **Propagate confirmed changes.** Once the user confirms a decision that affects multiple plans, update all impacted sub-plan files in the same session — not in a follow-up. Don't leave plans in a temporarily inconsistent state.

4. **Keep MAIN-PLAN.md current.** Any decision that changes scope, sequencing, deliverables, or cross-subsystem contracts belongs in `MAIN-PLAN.md` as well as in the sub-plan. MAIN-PLAN.md is the integration view; if it doesn't reflect current reality, the system is out of sync.

## Jira Configuration

- **Workspace:** See global `~/.claude/CLAUDE.md` for Jira connection details.
- **Project key:** CLAUDE (assumed — confirm before creating tickets).
