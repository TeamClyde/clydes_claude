# Frontmatter Reference — Agents and Skills

Canonical field reference for both surfaces. Verified against official documentation
2026-08-06: [code.claude.com/docs/en/sub-agents](https://code.claude.com/docs/en/sub-agents)
and [code.claude.com/docs/en/skills](https://code.claude.com/docs/en/skills).

This file is the repo's own reference. It is not a pointer to a plugin — do not replace it with
a citation to `plugin-dev:agent-development`, which was uninstalled 2026-08-06. See  <!-- ref-ok: provenance — records the removed skill this file replaces -->
`hooks-reference.md` § "Why this file exists" for what a cached plugin snapshot drifts into.

## Contents

- [Read this first — the two surfaces differ](#read-this-first--the-two-surfaces-differ)
- [Agent frontmatter](#agent-frontmatter)
- [Skill frontmatter](#skill-frontmatter)
- [Description conventions](#description-conventions)
- [Portability — the six-field packaging spec](#portability--the-six-field-packaging-spec)
- [Repo policy vs platform requirement](#repo-policy-vs-platform-requirement)

---

## Read this first — the two surfaces differ

Agents and skills use **different field names for similar concepts, in different casing.**
This is the single largest source of silently-ignored frontmatter. An unrecognized key is not
an error in Claude Code — it is ignored, so the declaration looks correct and does nothing.

| Concern | Agents | Skills |
|---|---|---|
| Restrict the tool pool | `tools` (allowlist) | `disallowed-tools` (removes from pool) |
| Grant permission without prompting | *n/a — permissions inherit* | `allowed-tools` (**grants only, does not restrict**) |
| Deny specific tools | `disallowedTools` — **camelCase** | `disallowed-tools` — **kebab-case** |
| `name` | **Required** | Optional (defaults to directory name) |
| `description` | **Required** | Recommended |

**The two traps, both observed in this repo:**

1. `allowed-tools` in an **agent** file is ignored. The agent gets every tool. Verify with the
   agent listing: a correctly-restricted agent renders its exact declared list.
2. `allowed-tools` in a **skill** does **not** restrict anything. Official wording: *"It does
   not restrict which tools are available: every tool remains callable."* A skill that omits
   `Edit` from `allowed-tools` can still edit — it just prompts. To actually restrict, use
   `disallowed-tools`.

**Verification idiom.** After writing or changing tool frontmatter, diff what you *declared*
against what the runtime *renders* in the agent/skill listing. They must match. This catches
ignored keys, which no error message will.

---

## Agent frontmatter

`agents/<name>.md`. The markdown body below the frontmatter becomes the system prompt.

| Field | Required | Behavior |
|---|---|---|
| `name` | **Yes** | Lowercase letters and hyphens. Cannot contain `:` — reserved for plugin-scoped identifiers. A file whose name contains `:` is not loaded and an error goes to the debug log. Hooks receive this as `agent_type`. The filename does not have to match. |
| `description` | **Yes** | *"When Claude should delegate to this subagent."* |
| `tools` | No | Tools the subagent can use. **Inherits every tool available to subagents if omitted.** When present it is a strict allowlist — there are no implicit additions, so `Read`/`Grep`/`Glob` must be listed if needed. If no entry resolves to a real tool, the subagent fails to launch with an error naming the entries. To preload skills, use `skills:` rather than listing `Skill` here. |
| `disallowedTools` | No | **camelCase.** Tools to deny, removed from the inherited or specified list. |
| `model` | No | `sonnet`, `opus`, `haiku`, `fable`, a full model ID (e.g. `claude-opus-5`), or `inherit`. **Defaults to `inherit`.** |
| `permissionMode` | No | `default`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions`, `plan`, or `manual` (alias for `default`, requires v2.1.200+). Ignored for plugin subagents. |
| `maxTurns` | No | Maximum agentic turns before the subagent stops. |
| `skills` | No | Skills to preload at startup. **The full skill content is injected, not only the description.** The subagent can still invoke unlisted skills through the Skill tool. |
| `mcpServers` | No | MCP servers available to this subagent — a configured server name or an inline definition. Ignored for plugin subagents. |
| `memory` | No | Persistent memory scope: `user`, `project`, or `local`. Enables cross-session learning. |
| `background` | No | `true` always runs as a background task. When unset Claude chooses; as of v2.1.198 it defaults to background. |
| `effort` | No | `low`, `medium`, `high`, `xhigh`, `max`. Overrides session effort. Available levels depend on the model. |
| `isolation` | No | `worktree` runs the subagent in a temporary git worktree branched from the **default branch**, not the parent's `HEAD`. Cleaned up automatically if nothing changed. |
| `color` | No | `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, `cyan`. |
| `initialPrompt` | No | Auto-submitted as the first user turn only when the agent runs as the **main session agent**. Ignored when it runs as a subagent. |

**Model resolution order** (highest priority first):

1. `CLAUDE_CODE_SUBAGENT_MODEL` environment variable
2. Per-invocation `model` parameter
3. `model` frontmatter field
4. The main conversation's model

---

## Skill frontmatter

`skills/<name>/SKILL.md`. **All fields are optional.** Only `description` is recommended, so
Claude knows when to use the skill.

| Field | Required | Behavior |
|---|---|---|
| `name` | No | Display name in skill listings. **Defaults to the directory name.** |
| `description` | Recommended | *"What the skill does and when to use it."* Falls back to the first paragraph of body content if omitted. Put the key use case first — combined `description` + `when_to_use` is truncated at **1,536 characters** in the listing. |
| `when_to_use` | No | Additional trigger phrases or example requests. Appended to `description` in the listing; counts toward the same 1,536-character cap. |
| `argument-hint` | No | Hint shown during `/` autocomplete, e.g. `[issue-number]`. **Not in the packaging spec** — see [Portability](#portability--the-six-field-packaging-spec). |
| `arguments` | No | Named positional arguments for `$name` substitution. Space-separated string or YAML list; names map to positions in order. |
| `disable-model-invocation` | No | `true` prevents Claude auto-loading the skill — manual `/name` only. Also blocks preloading into subagents, and (v2.1.196+) blocks scheduled tasks firing it. Default `false`. |
| `user-invocable` | No | `false` hides it from the `/` menu while Claude can still auto-invoke. Default `true`. |
| `allowed-tools` | No | Tools usable **without a permission prompt** during the invoking turn. The grant clears on your next message. **Does not restrict the tool pool** — every tool remains callable. |
| `disallowed-tools` | No | **kebab-case.** Tools removed from the available pool while the skill is active. This is the actual restriction mechanism. Clears on your next message. Cannot remove `EndConversation` while any other tool remains. |
| `model` | No | Model while the skill is active; applies for the rest of the turn, not saved to settings. Accepts `/model` values or `inherit`. |
| `effort` | No | `low`, `medium`, `high`, `xhigh`, `max`. Overrides session effort. |
| `context` | No | `fork` runs the skill in a forked subagent context. |
| `agent` | No | Which subagent type to use when `context: fork` is set. |
| `background` | No | Only with `context: fork`. `false` waits for the result inline. Default `true`. Requires v2.1.218+. |
| `hooks` | No | Hooks scoped to this skill's lifecycle. |

**String substitutions** available in skill body content: `$ARGUMENTS`, `$ARGUMENTS[N]` / `$N`,
`$name`, `${CLAUDE_SESSION_ID}`, `${CLAUDE_EFFORT}`, `${CLAUDE_SKILL_DIR}` (v2.1.100+),
`${CLAUDE_PROJECT_DIR}` (v2.1.196+).

`${CLAUDE_SKILL_DIR}` and `${CLAUDE_PROJECT_DIR}` also substitute inside `allowed-tools` Bash
rules (v2.1.129+), letting a skill pre-approve its own bundled scripts without hardcoding paths.

---

## Description conventions

Both surfaces want **what it does and when to use it** — the same shape, phrased for the
surface. Write in third person; the text is injected into a system prompt.

| Surface | Official wording |
|---|---|
| Skill | *"What the skill does and when to use it."* |
| Agent | *"When Claude should delegate to this subagent."* |

**The one thing to never put in a description: internal steps or procedure.**

This is a real, observed failure — not a style preference. A description reading *"dispatches
subagent per task with code review between tasks"* caused Claude to perform **one** review when
the skill's flowchart specified **two** (spec compliance, then code quality). The description
became a shortcut that replaced reading the body.

The distinction that matters:

| | Example | Verdict |
|---|---|---|
| **Capability** — what it is for | "Reviews a plan for design soundness and returns a verdict" | Keep — this is what the docs ask for |
| **Procedure** — how it does it internally | "dispatches a subagent per task with code review between tasks" | Remove — becomes a shortcut past the body |

So: state the capability and the trigger. Do not narrate the workflow.

```yaml
# BAD — narrates internal steps; Claude follows this instead of the body
description: Use when executing plans - dispatches subagent per task with code review between tasks

# BAD — first person
description: I can help you with async tests when they're flaky

# GOOD — capability + trigger, no procedure
description: Executes an implementation plan task-by-task in isolated contexts. Use when you have a written plan with independent tasks.

# GOOD — problem-shaped trigger, technology-agnostic
description: Use when tests have race conditions, timing dependencies, or pass/fail inconsistently
```

Keep triggers technology-agnostic unless the skill genuinely is technology-specific, and
describe the *problem* (race conditions) rather than a language-specific symptom (`setTimeout`).

---

## Portability — the six-field packaging spec

Claude Code accepts every field in the tables above. **Other distribution paths do not.**

| Path | Fields accepted |
|---|---|
| Claude Code skills at any level, including plugin skills | Every field above |
| claude.ai uploads, the Skills API, `package_skill.py` | `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools` — **only these six** |

Including a disallowed field does not degrade gracefully. Packaging or upload **fails with a
hard error**:

```
Unexpected key(s) in SKILL.md frontmatter: argument-hint. Allowed properties are:
allowed-tools, compatibility, description, license, metadata, name
```

**This matters for cloud sessions.** Enabling a personal skill for Cowork, cloud sessions, or
**routines** requires uploading it to claude.ai, so the six-field limit applies there too. A
skill carrying `argument-hint`, `when_to_use`, `disable-model-invocation`, or any other
Claude Code-only field cannot be uploaded as written.

Claude Code-only *body* features — dynamic context injection with `` !`cmd` ``, for instance —
also do not function in claude.ai chat or through the API.

If a skill needs to run in a scheduled or cloud context, restrict its frontmatter to the six
spec fields.

---

## Repo policy vs platform requirement

Keep these separate. Stating repo policy as a platform constraint erodes trust in the rest of
the document and hides real choices.

| Convention | Status |
|---|---|
| Every agent declares `model:` explicitly | **Repo policy.** The platform defaults to `inherit`. The policy exists so dispatch cost is a deliberate choice, and so the model-pinning hook can see it. |
| Agents pin full model IDs, not short aliases | **Repo policy.** Both forms are platform-valid. The repo-authored agents use full IDs; the five vendored agents use aliases and are the exception, not the pattern. Check the model-pinning hook before choosing a form — it may match only one. |
| Skill and agent creation routes through `creating-tools` | **Repo policy**, from `skills/creating-tools/routing-table.md`. Not a platform behavior. |

When writing guidance, say which of the two a rule is. "Required" without qualification reads
as a platform constraint and will be trusted as one.
