# MCP Governance — CLI Sessions

Two rules for Claude Code CLI and subagent sessions (contexts where Tool Search is not configurable):

1. **Route through the correct abstraction.** Jira operations → `jira-workflow-manager` agent (`Agent` tool, `subagent_type: jira-workflow-manager`). Git operations → `git-manager` skill (`Skill` tool). Do not call Atlassian MCP tools directly — always delegate to the agent or skill.

2. **No wildcard or list-all queries.** JQL must include `project=CLAUDE` or a specific issue key. Confluence CQL queries must include a space key or title filter. If neither is known, ask before querying.
