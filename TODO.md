# TODO

## In Progress

## Up Next

## Backlog

- Mobile app workflow observations — real-world testing of memory capture, skill triggering, and CSO effectiveness in a new repo. Mobile app repo on separate machine will be used to observe whether memory is actually being written/read, which skills auto-trigger vs. get skipped, and what friction surfaces. Signal feeds back into memory system and CSO improvements. [scope]
- Skill-creator integration — integrate skill-creator@claude-plugins-official into the superpowers workflow so CSO optimization, eval benchmarking, and A/B comparison are first-class steps in skill creation/editing rather than a standalone external tool. Plugin has full eval loop (trigger accuracy testing, extended thinking rewrites, browser review UI) that should be accessible from within the workflow. Requires ANTHROPIC_API_KEY for the rewrite step; Windows patches to plugin cache scripts also need to be reported upstream. [scope]

## History

- [x] Workflow Refinements — project.json, skill patches, token efficiency, feedback system — [plans/workflow-refinements/workflow-refinements-plan.md](plans/workflow-refinements/workflow-refinements-plan.md)
