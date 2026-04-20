# TODO

## In Progress

## Up Next

## Backlog

- Mobile app workflow observations — real-world testing of memory capture, skill triggering, and CSO effectiveness in a new repo. Mobile app repo on separate machine will be used to observe whether memory is actually being written/read, which skills auto-trigger vs. get skipped, and what friction surfaces. Signal feeds back into memory system and CSO improvements. [scope]
- feature-dev plugin agent review — revisit feature-dev@claude-plugins-official agents (code-explorer, code-architect, code-reviewer) as potential upgrades to existing custom agents. Plugin was uninstalled 2026-04-20 due to its /feature-dev command bypassing the Jira/git/plan-doc workflow entirely, but the three agents themselves are well-designed and may offer patterns worth absorbing into architect, requesting-code-review, and the writing-plans exploration phase. [scope]

## History

- [x] Integrated tool creation + plugin lifecycle — completed 2026-04-20. Created creating-tools orchestration skill, writing-agents TDD skill, writing-rules skill, integrated Pulser eval as Phase 3 of writing-skills, and established plugin registry + lifecycle governance with rules/plugin-lifecycle.md.
- [x] Workflow Refinements — project.json, skill patches, token efficiency, feedback system — [plans/workflow-refinements/workflow-refinements-plan.md](plans/workflow-refinements/workflow-refinements-plan.md)
