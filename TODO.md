# TODO

## In Progress

## Up Next

- [ ] Integrated tool creation + plugin lifecycle — [plans/tool-creation-plugin-lifecycle/PLAN.md](plans/tool-creation-plugin-lifecycle/PLAN.md)
  - [ ] `creating-tools` orchestration skill
  - [ ] `writing-agents` skill
  - [ ] `writing-rules` skill
  - [ ] Integrate skill-creator eval into writing-skills
  - [ ] Plugin registry + lifecycle governance

## Backlog

- Mobile app workflow observations — real-world testing of memory capture, skill triggering, and CSO effectiveness in a new repo. Mobile app repo on separate machine will be used to observe whether memory is actually being written/read, which skills auto-trigger vs. get skipped, and what friction surfaces. Signal feeds back into memory system and CSO improvements. [scope]
- feature-dev plugin agent review — revisit feature-dev@claude-plugins-official agents (code-explorer, code-architect, code-reviewer) as potential upgrades to existing custom agents. Plugin was uninstalled 2026-04-20 due to its /feature-dev command bypassing the Jira/git/plan-doc workflow entirely, but the three agents themselves are well-designed and may offer patterns worth absorbing into architect, requesting-code-review, and the writing-plans exploration phase. [scope]

## History

- [x] Workflow Refinements — project.json, skill patches, token efficiency, feedback system — [plans/workflow-refinements/workflow-refinements-plan.md](plans/workflow-refinements/workflow-refinements-plan.md)
