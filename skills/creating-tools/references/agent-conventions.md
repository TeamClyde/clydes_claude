# Agent Conventions

Authoring reference for subagents — `agents/<name>.md` files dispatched through the Agent tool.
A subagent is not the main conversation running a different prompt: it gets its own tool pool
(narrowed by two independent filters), no shared history, and a permission mode the parent can
silently override. Frontmatter alone doesn't predict any of that — most of what surprises authors
here is platform *behavior*, not a field they forgot to set.

Deciding whether the behavior you want is an agent at all — versus a skill, a rule, or a hook —
happens before this file is relevant. See `skills/creating-tools/SKILL.md`'s artifact-selection
guidance first; everything below assumes that call has already been made.

## Contents

- [Frontmatter](#frontmatter)
- [Tool Inheritance — the Two Filters](#tool-inheritance--the-two-filters)
- [What a Subagent Does Not Receive](#what-a-subagent-does-not-receive)
- [permissionMode — Overridden by the Parent](#permissionmode--overridden-by-the-parent)
- [Remaining Fields](#remaining-fields)
- [Common Mistakes](#common-mistakes)

## Frontmatter

The markdown body below the frontmatter becomes the subagent's system prompt, and it **replaces**
the default system prompt outright — it does not layer on top of it.

| Field | Required | Behavior |
|---|---|---|
| `name` | Yes | Lowercase letters and hyphens only. A `:` character is reserved for plugin-scoped identifiers — a file whose name contains one fails to load, silently, with only a debug-log entry. Hooks see this value as `agent_type`. The filename itself doesn't have to match. |
| `description` | Yes | The platform's own framing: what tells Claude *when it should delegate to this subagent*. State the capability and the trigger, in third person — never the internal steps; narrating procedure turns the description into a shortcut Claude takes instead of reading the body. `references/skill-conventions.md` § Description and Discoverability makes the fuller argument for this, and it applies here unchanged. |
| `tools` | No | Strict allowlist. Omit it and the subagent inherits everything available to subagents — subject to the two filters below regardless. List it and only those entries survive, with no implicit additions: an unlisted `Read` or `Grep` is simply absent. To preload skill content, use `skills:` rather than listing `Skill` here. |
| `disallowedTools` | No | **camelCase.** Denies specific tools out of an inherited or declared set. |
| `model` | No | `sonnet`, `opus`, `haiku`, `fable`, a full model ID, or `inherit`. Platform default is `inherit` — see [Remaining Fields](#remaining-fields) for why this repo pins explicitly instead. |
| `permissionMode` | No | `default`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions`, `plan`, or `manual` (alias for `default`). See [permissionMode — Overridden by the Parent](#permissionmode--overridden-by-the-parent) — the value in the subagent's own file is frequently not the one that ends up governing. |
| `maxTurns` | No | Caps agentic turns before the subagent is stopped. |
| `skills` | No | Skills to preload — full body content is injected at startup, not only the description. The subagent can still reach unlisted skills through the Skill tool at runtime. |
| `mcpServers` | No | MCP servers this subagent can reach: a configured server name or an inline definition. Ignored for plugin subagents. |
| `memory` | No | `user`, `project`, or `local` — persistent memory scope enabling cross-session learning. |
| `background` | No | `true` forces background execution. Left unset, Claude decides — and as of v2.1.198 that decision defaults to background, which is why the second tool filter below matters even when nothing on the file says "background" explicitly. |
| `effort` | No | `low`, `medium`, `high`, `xhigh`, `max` — overrides session effort; available levels depend on the model. |
| `isolation` | No | `worktree` — see [Remaining Fields](#remaining-fields). |
| `color` | No | `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, `cyan`. |
| `initialPrompt` | No | Auto-submitted as the first user turn, but only when this file runs as the **main session agent** — ignored entirely when the same file is dispatched as a subagent. |

**Model resolution order**, highest priority first: a `CLAUDE_CODE_SUBAGENT_MODEL` environment
variable, then a per-invocation `model` parameter supplied by the caller, then this file's `model`
frontmatter, then finally the main conversation's own model.

## Tool Inheritance — the Two Filters

Lead with the practical consequence, because it's the one that bites: a subagent declaring a tool
outside the background keep-list below **silently loses it** the moment it runs in the
background — and background is the default dispatch mode. Which tools a subagent actually has at
runtime depends on *how it was dispatched*, not only on what its own frontmatter says. Two
filters apply, in order, and only a fork skips both.

### First filter — always, regardless of dispatch

Nine tools are stripped from every subagent even when the file explicitly lists them in `tools`:

| Tool | Condition |
|---|---|
| `Agent` | Only at the subagent depth limit. Inside a fork it stays listed but returns an error instead of spawning. |
| `AskUserQuestion` | Always |
| `EndConversation` | Always — it can end only the main conversation |
| `EnterPlanMode` | Always |
| `ExitPlanMode` | Unless the subagent's `permissionMode` is `plan` |
| `ScheduleWakeup` | Always |
| `TaskOutput` | Always |
| `WaitForMcpServers` | Always |
| `Workflow` | Always |

### Second filter — background subagents only

> "Apart from `Agent` and `ExitPlanMode`, which follow the first filter's conditions wherever the
> subagent runs, a background subagent keeps every MCP tool but only these built-in tools…"

That opening clause is the part worth not skimming past: `ExitPlanMode` is **not** unconditionally
stripped from a background subagent — it survives exactly when the first filter already lets it
through, i.e. when `permissionMode` is `plan`. Every other built-in tool not on the keep-list below
is removed, whether it was inherited or explicitly listed in `tools`, so identical frontmatter can
resolve to a different tool set in the foreground than it does in the background.

The keep-list: `Read`, `Grep`, `Glob`, `Bash`, `PowerShell`, `Edit`, `Write`, `NotebookEdit`,
`WebFetch`, `WebSearch`, `TodoWrite`, `Skill`, `ToolSearch`, `EnterWorktree`, `ExitWorktree`,
`Monitor`, `TaskStop`, `SendMessage`, `Artifact` — plus every MCP tool, which this filter never
touches.

### Error behavior

Neither filter reports an error for the tools it strips — with one exception: if filtering leaves
`tools` resolving to nothing at all, that is an error.

### Forks are the exception

A fork skips both filters entirely and receives the main conversation's exact tool pool,
unfiltered.

## What a Subagent Does Not Receive

A subagent starts cold on more than tools. It does not receive the conversation history, the list
of skills already invoked in that conversation, or the files already read in it — none of that
context carries over. It **does** receive the full CLAUDE.md hierarchy and a git-status snapshot,
so repo-level conventions and current working-tree state are visible even though prior turns are
not. Its system prompt fully replaces the default rather than layering on top of it, per the
`description` note under [Frontmatter](#frontmatter).

## permissionMode — Overridden by the Parent

The `permissionMode` field on a subagent's own file is a request, not a guarantee. Four
situations override it, and this list is meant to be exhaustive rather than illustrative:

1. A parent running under `bypassPermissions` or `acceptEdits` takes precedence — the subagent's
   own `permissionMode` cannot override that.
2. A parent in auto mode makes the subagent inherit auto mode too; its frontmatter
   `permissionMode` is ignored outright.
3. The field is ignored entirely for plugin subagents, independent of what the parent is doing.
4. `bypassPermissions` is itself voided when `permissions.disableBypassPermissionsMode` is set, as
   of v2.1.223 — so even case 1 has a kill switch above it.

Reading only the first case and assuming the rest don't apply is how an author misjudges what a
subagent can actually do.

## Remaining Fields

**`isolation: worktree`** branches from the repository's **default branch**, not the parent
session's current `HEAD` — a subagent dispatched mid-feature-branch does not start from that
branch's tip. The worktree cleans itself up automatically if nothing inside it changed.

**`skills:` preloads** inject full skill body content at subagent startup. Prefer this over
listing `Skill` inside `tools` when the subagent should start already primed with a skill's
content rather than discovering and loading it mid-task.

**`tools` is a strict allowlist**, not a suggestion — see [Frontmatter](#frontmatter) for the
field itself, and [Tool Inheritance — the Two Filters](#tool-inheritance--the-two-filters) for
what still gets removed on top of whatever it lists.

**`model` defaults to `inherit`** at the platform level. This repo requires every subagent to pin
an explicit model instead, so dispatch cost is a deliberate authoring choice and any tooling that
inspects the pin has something to read. That is repo policy layered on top of a platform default,
not a platform requirement in its own right.

**Testing a subagent's system prompt** — baseline-first, then closing loopholes with pressure
scenarios — is its own discipline. See `references/pressure-testing.md` for the cycle; it is not
repeated here.

## Common Mistakes

| Mistake | Why it fails |
|---|---|
| Assuming a declared `tools:` entry is always available | The first filter strips specific tools unconditionally; the second strips a much wider set in the background — which is the default dispatch mode. |
| Writing `allowed-tools:` in an agent file | That is the skill-surface field. In an agent file it is silently ignored, and the subagent runs with its full resolved tool set instead of the intended restriction. |
| Assuming the subagent's own `permissionMode` always governs | Four parent-side conditions override it — see [permissionMode — Overridden by the Parent](#permissionmode--overridden-by-the-parent). |
| Omitting `model:` | Platform-valid (`inherit` is the default) but against repo policy, which requires an explicit pin. |
| Declaring `tools:` without everything the subagent needs | The allowlist has no implicit additions — an omitted `Read` or `Grep` is simply absent, not silently restored. |
| Trusting a tools or permission declaration you haven't seen rendered | Diff what the frontmatter declares against what the subagent listing actually renders; an unrecognized or filtered key produces no error. |
