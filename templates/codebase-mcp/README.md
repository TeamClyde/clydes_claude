# Codebase MCP Server

A local FastMCP server that reads `codebase-graph.json` and exposes 6 query tools to Claude Code. Installed per-repo by `/infra-init`. Tools are registered with `defer_loading: true` — zero context cost until searched for.

## Requirements

- Python 3.10+
- `mcp[cli]>=1.2.0` (see `requirements.txt`)

## Installation

`/infra-init` handles this automatically. To install manually:

```bash
# Copy server files into the repo
cp server.py /path/to/repo/.claude-init/mcp/server.py
cp requirements.txt /path/to/repo/.claude-init/mcp/requirements.txt

# Install dependencies
cd /path/to/repo
pip install -r .claude-init/mcp/requirements.txt
```

## Registration in Claude Code

Add to the project's `.claude/settings.json`:

```json
{
  "mcpServers": {
    "codebase": {
      "command": "python3",
      "args": [".claude-init/mcp/server.py", ".claude-init/codebase-graph.json"],
      "defer_loading": true
    }
  }
}
```

On Windows, replace `python3` with `python` if that is your Python 3 executable.

## Available Tools

| Tool | Description |
|------|-------------|
| `codebase_search_symbol` | Find a symbol by name or description |
| `codebase_find_callers` | Who calls this function or class |
| `codebase_find_dependencies` | What a file imports and what imports it |
| `codebase_get_env_var` | Where an env var is defined and who reads it |
| `codebase_get_entry_points` | All entry points and their triggers |
| `codebase_search_api_endpoints` | Exposed routes and consumed API clients |

## Notes

- Do not `print()` to stdout — it corrupts the JSON-RPC stream. The server uses `logging` to stderr.
- At startup the server loads `codebase-graph.json` and pre-builds lookup indexes for fast queries.
- Re-run `/infra-init` to regenerate the graph after significant codebase changes.
