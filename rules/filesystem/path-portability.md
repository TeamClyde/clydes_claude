# Filesystem Path Portability

Skills, agents, and scripts run in a shell, but the paths they produce are often consumed by **native OS binaries and MCP servers** that do not understand the shell's path conventions. A path that works in git-bash can be rejected by the native tool it is handed to.

## The bug class

On Windows, git-bash / MSYS reports paths in Unix form: `pwd -P` → `/c/Users/jason/repo`. The shell understands this, but a **native Windows** executable or MCP server (e.g. the codebase-memory MCP) expects `C:/Users/jason/repo` and cannot resolve `/c/...`. The failure is opaque — the tool returns a generic error (`Pipeline failed. Check repo_path exists`) that never names the path format as the cause.

This is platform-asymmetric: the identical instruction works on macOS/Linux (where `pwd -P` is already native) and fails only on Windows — so it passes review on a non-Windows machine and surfaces later as a "Windows-only" breakage.

## The rule

When a path will be passed to a native tool, MCP server, or language server — not used purely inside the shell — source it in OS-native form:

| Path needed | Source it with |
|---|---|
| Repo root (the common case) | `git rev-parse --show-toplevel` |
| A non-root dir that must stay native (Windows) | `cygpath -m "$(pwd)"` (yields `C:/...` with forward slashes) |
| Shell-only use (`cd`, `ls`, `test`, redirection) | `pwd` / `pwd -P` is fine |

`git rev-parse --show-toplevel` emits `C:/Users/...` on Windows git-bash and `/Users/...` or `/home/...` on macOS/Linux — the correct native absolute path on every platform. Prefer it over `pwd -P` whenever the value crosses out of the shell.

## Don't

- Don't write `pwd -P` (or bare `pwd`) when the result is handed to a native binary or MCP.
- Don't hardcode a path separator or drive letter in skill instructions — let a portable command produce the value.
- Don't assume an instruction that passed on macOS/Linux is portable; the MSYS path divergence appears only on Windows.

## Known consumers in this workflow

Paths handed to the **codebase-memory MCP** (`index_repository`, `index_status`, `list_projects` matching), language servers, and any native executable invoked via `Bash`. `skills/infra-init` derives `REPO_PATH` with `git rev-parse --show-toplevel`; match that pattern in any new skill that indexes or analyzes a repo.
