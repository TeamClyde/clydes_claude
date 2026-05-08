# TODO

## In Progress

## Up Next

## Backlog

- Mobile app workflow observations — real-world testing of memory capture, skill triggering, and CSO effectiveness in a new repo. Mobile app repo on separate machine will be used to observe whether memory is actually being written/read, which skills auto-trigger vs. get skipped, and what friction surfaces. Signal feeds back into memory system and CSO improvements. [scope]
- feature-dev plugin agent review — revisit feature-dev@claude-plugins-official agents (code-explorer, code-architect, code-reviewer) as potential upgrades to existing custom agents. Plugin was uninstalled 2026-04-20 due to its /feature-dev command bypassing the Jira/git/plan-doc workflow entirely, but the three agents themselves are well-designed and may offer patterns worth absorbing into architect, requesting-code-review, and the writing-plans exploration phase. [scope]

## History

- [x] Workflow doc process rework — completed 2026-05-07. Delivered four-file plan tree (design + plan + journal + handoff), three new plan-management modes (divergence, spawn-subplan, close-subplan) with idempotent atomic three-write invariant, .claude/active-plan marker, constitutional gates across writing-plans / executing-plans / subagent-driven-development / systematic-debugging, scope-driven plan-state validators in git-manager + bash pre-commit, SessionStart Node hook, plan-gate Jira/TDD-disabled branches, and Star Chamber audit pattern (Auditor + Skeptic + Fresh Agent). Bundles GitHub issues #13 + #15 + #18.
- [x] Codegraph Integration — completed 2026-04-24. Replaced graphify + FastMCP JSON pipeline with codebase-memory-mcp across all rules, skills, agents, and docs. Corrected trace_call_path → trace_path from live binary inspection. Remaining stale references in agents/integration-engineer.md, agents/test-builder.md, and docs/agent-architecture.md (batch-indexer section) are out of scope for this plan.
- [x] Workflow Audit & Map — completed 2026-04-21. Fixed 4 semantic coherence issues (todo-manager refs, architect tool, plan-gate Case A/B, brainstorming dead path). Created docs/workflow-map.md canonical reference. Brought all 26 skills to Pulser 100/100 (Gotchas + allowed-tools on 21 skills, writing-skills split to 399 lines). Cleaned up committed session artifacts (plans/, tests/). Added adherence-audit skill for ongoing drift detection.
- [x] Integrated tool creation + plugin lifecycle — completed 2026-04-20. Created creating-tools orchestration skill, writing-agents TDD skill, writing-rules skill, integrated Pulser eval as Phase 3 of writing-skills, and established plugin registry + lifecycle governance with rules/plugin-lifecycle.md.
- [x] Workflow Refinements — project.json, skill patches, token efficiency, feedback system — completed 2026-04-20
