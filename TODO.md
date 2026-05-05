# TODO

## In Progress

## Up Next

- [ ] Workflow doc process rework — bundles GitHub issues #13 (no session log) + #15 (design rationale lost) + #18 (cumulative footprint). Four-file structure per plan tree (design + plan + journal + handoff), skill-internal forcing functions, sub-plan rollup, one cross-platform SessionStart hook, bash pre-commit extension — [plan doc](plans/workflow-doc-process-rework/workflow-doc-process-rework-plan.md)
  - [ ] Rules (4): plan-docs, planning, workflow-phases, filesystem/efficiency
  - [ ] Skills (8 modified): plan-management (3 new modes), using-superpowers, writing-plans, executing-plans, subagent-driven-development, systematic-debugging, git-manager, plan-gate
  - [ ] Hooks: 1 new SessionStart Node hook + 1 line addition to bash hooks/pre-commit
  - [ ] Docs cleanup: 5 files (workflow-map, plan-management, rules, testing-system, glossary)
  - [ ] Verification: /adherence-audit + pulser on 8 skills + smoke test

## Backlog

- Mobile app workflow observations — real-world testing of memory capture, skill triggering, and CSO effectiveness in a new repo. Mobile app repo on separate machine will be used to observe whether memory is actually being written/read, which skills auto-trigger vs. get skipped, and what friction surfaces. Signal feeds back into memory system and CSO improvements. [scope]
- feature-dev plugin agent review — revisit feature-dev@claude-plugins-official agents (code-explorer, code-architect, code-reviewer) as potential upgrades to existing custom agents. Plugin was uninstalled 2026-04-20 due to its /feature-dev command bypassing the Jira/git/plan-doc workflow entirely, but the three agents themselves are well-designed and may offer patterns worth absorbing into architect, requesting-code-review, and the writing-plans exploration phase. [scope]

## History

- [x] Codegraph Integration — completed 2026-04-24. Replaced graphify + FastMCP JSON pipeline with codebase-memory-mcp across all rules, skills, agents, and docs. Corrected trace_call_path → trace_path from live binary inspection. Remaining stale references in agents/integration-engineer.md, agents/test-builder.md, and docs/agent-architecture.md (batch-indexer section) are out of scope for this plan.
- [x] Workflow Audit & Map — completed 2026-04-21. Fixed 4 semantic coherence issues (todo-manager refs, architect tool, plan-gate Case A/B, brainstorming dead path). Created docs/workflow-map.md canonical reference. Brought all 26 skills to Pulser 100/100 (Gotchas + allowed-tools on 21 skills, writing-skills split to 399 lines). Cleaned up committed session artifacts (plans/, tests/). Added adherence-audit skill for ongoing drift detection.
- [x] Integrated tool creation + plugin lifecycle — completed 2026-04-20. Created creating-tools orchestration skill, writing-agents TDD skill, writing-rules skill, integrated Pulser eval as Phase 3 of writing-skills, and established plugin registry + lifecycle governance with rules/plugin-lifecycle.md.
- [x] Workflow Refinements — project.json, skill patches, token efficiency, feedback system — completed 2026-04-20
