# Hook Conventions

Authoring reference for hooks — `.mjs` scripts the Claude Code harness executes on a lifecycle
event. A hook is the only workflow component that is not a Markdown document and not addressed to
the model. It is a program: JSON arrives on stdin, an exit code and optionally JSON on stdout go
back, and the harness acts on what it gets.

That difference is total. A hook shares no authoring mechanics with the other three artifact types:

| | skill / agent / rule | hook |
|---|---|---|
| Artifact | Markdown with frontmatter | `.mjs` JavaScript |
| Outbound edges | present | **always 0** — the citation extractor reads Markdown, and a hook has no prose to extract from |
| Inbound edges | usually cited by a skill or rule | **7 of the 10 here have none** — they need an `entryPoints` declaration instead |
| Discovery | directory convention | **explicitly wired in `.claude/settings.json`** |
| Failure mode | ignored | **silently dropped, or blocks everything** |

The last row is what to design around. A skill nobody triggers costs nothing. A mis-wired hook
reads as correct in the config file and never fires. A hook that throws on unexpected input blocks
the user's work until someone notices. Both failures are quiet, which is why testing and wiring get
the most space below.

Deciding whether the behavior you want is a hook at all — versus a skill, an agent, or a rule —
happens upstream, in `skills/creating-tools/SKILL.md`'s artifact-selection guidance. This file
assumes the spine has already routed you here; the checklist that opens the next section is a
confirmation check against that routing, not a fresh decision, and everything after it covers only
the hook-specific half.

## Contents

Sections run in the order the decisions get made.

- [Is a Hook the Right Answer?](#is-a-hook-the-right-answer)
- [Which Event](#which-event)
- [What the Hook Returns](#what-the-hook-returns)
- [The House Pattern](#the-house-pattern)
- [Windows](#windows)
- [Testing — Run It Before You Wire It](#testing--run-it-before-you-wire-it)
- [Wiring](#wiring)
- [Registration](#registration)
- [Common Mistakes](#common-mistakes)

## Is a Hook the Right Answer?

Confirm the upstream call rather than re-litigate it: the three conditions below should agree with
the routing that sent you here. If they don't, that disagreement is the signal — take it back to
the spine's artifact-selection guidance rather than resolving it in this file.

Three conditions, all required:

1. **It must happen without the model choosing it.** A skill or a rule asks for compliance; a hook
   does not ask. If "the model usually does this anyway" is acceptable, write a rule.
2. **The trigger is a harness event, not a topic.** If you cannot name the event in the next
   section, you do not have a hook.
3. **The decision is computable from the event payload alone** — string matching, a file-existence
   check, a config read. Anything needing judgment belongs in a skill or an agent.

The near-miss worth naming: a hook that only *nudges* (emits advisory context, never blocks) is
competing with a rule for the same job. Choose the hook only when the nudge must attach to a
specific event rather than being always-on. The advisory install-vetting hook here fires on a
`Bash` install command; written as an always-on rule instead, it would have cost context in every
session that never installs anything — which is exactly why it is a hook.

## Which Event

Thirty-one events. ● marks the four this repo uses.

| Group | Events |
|---|---|
| Session lifecycle | ● `SessionStart`, `Setup`, `SessionEnd` |
| Prompt | ● `UserPromptSubmit`, `UserPromptExpansion` |
| Tool call | ● `PreToolUse`, `PermissionRequest`, `PermissionDenied`, ● `PostToolUse`, `PostToolUseFailure`, `PostToolBatch` |
| Turn and output | `Stop`, `StopFailure`, `Notification`, `MessageDisplay` |
| Agents and tasks | `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`, `TeammateIdle` |
| Context and config | `PreCompact`, `PostCompact`, `InstructionsLoaded`, `ConfigChange` |
| Filesystem and workspace | `CwdChanged`, `DirectoryAdded`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove` |
| Elicitation | `Elicitation`, `ElicitationResult` |

**`PostToolUse` fires only when the tool succeeded.** Failures are a separate event,
`PostToolUseFailure`. Registering only `PostToolUse` and expecting to observe both is a silent gap
— the hook works, it just never sees the case you wrote it for.

The event set grows. Verify the event you want against the official documentation rather than
against a cached snapshot of it; a stale event list is how you end up hooking something that was
renamed two versions ago.

## What the Hook Returns

| Exit | Meaning |
|---|---|
| `0` | Success. Valid JSON on stdout is parsed and honored. Non-JSON stdout goes to the debug log — except on `SessionStart`, `UserPromptSubmit`, and `UserPromptExpansion`, where it is injected as context Claude can see. |
| `2` | Blocking error, on the events that support blocking. The block happens regardless of stdout. |
| other | Non-blocking error. The action proceeds and the failure is surfaced to the user as a hook error. |

Exit 2 blocks on `PreToolUse`, `UserPromptSubmit`, `UserPromptExpansion`, `Stop`, `SubagentStop`,
`TeammateIdle`, `TaskCreated`, `TaskCompleted`, `ConfigChange`, `PostToolBatch`, and the
elicitation pair. `WorktreeCreate` is the odd one: *any* non-zero exit fails the creation. On every
other event exit 2 does not block.

**House rule: never deny with exit 2. Deny with JSON and exit 0.**

```js
process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: reason,
  },
}) + '\n');
process.exit(0);
```

Two reasons. `permissionDecisionReason` carries a structured, actionable message where exit 2
surfaces raw stderr as an error. And it keeps the two kinds of non-zero apart: **a hook that
decides exits 0; a hook that crashes exits non-zero.** Collapse those and you cannot tell a working
deny from a broken script by looking at the exit code.

Output fields worth knowing:

| Field | Where |
|---|---|
| `hookSpecificOutput.permissionDecision` + `permissionDecisionReason` | the tool-call events |
| `hookSpecificOutput.updatedInput` | `PreToolUse` only — rewrite the tool input before it runs |
| `hookSpecificOutput.additionalContext` | inject text for Claude; used here on `SessionStart`, `UserPromptSubmit`, and `PostToolUse` |
| `continue: false` + `stopReason` | all events — stop Claude entirely |
| `systemMessage` | a warning shown to the user |

`permissionDecision` values in production here: `allow`, `deny`, and `ask` (the advisory hook uses
`ask`). This enum is the one field worth re-checking against the docs for your Claude Code version
before you rely on it — `allow` and `deny` are stable, anything beyond them is not guaranteed to be.

## The House Pattern

`.claude/hooks/<event>/<name>.mjs`, with a sibling `<name>.test.mjs`. Node ESM, shebang
`#!/usr/bin/env node`. Every hook here follows seven rules:

1. **A header docblock** stating Event, Purpose, short-circuit order, Override, and a runtime
   budget (`<10ms p50` and similar). Where the hook is a safety-net rather than a security
   boundary, say so explicitly — the git-prohibitions hook documents that command-string
   interception is trivially evadable and that evasion is out of scope. Someone will otherwise
   mistake it for one.
2. **`CLAUDE_DISABLE_WORKFLOW_HOOKS` checked first**, before any I/O, as a full emergency rollback.
3. **Fail open.** Bad input takes several shapes — malformed stdin, a missing field, a tool name
   the hook doesn't recognize — and every one of them should exit 0 and fall through untouched. A
   hook that throws on unexpected input blocks real work over a bug in the hook. Deviating is
   allowed but must be argued in the docblock along with the recovery
   path: the prefix-prepend hook denies when its prefix file is unreadable, because a silent pass
   there would emit a malformed dispatch, and it says so in its header.
4. **Narrow before matching.** Filter on `tool_name`, then extract, then run detectors. Cheapest
   rejection first — most invocations are not for you.
5. **Read the payload defensively.** The shape is not uniform. A Bash command arrives at
   `tool_input.command`, but Agent-dispatch fields (`subagent_type`, `prompt`, `model`) arrive at
   the top level, and `pattern` has been observed at the top level too. Production hooks read
   `input?.tool_name ?? input?.name ?? ''` and `input?.tool_input?.command ?? input?.command ?? ''`.
   Copy that defensiveness rather than trusting one documented shape.
6. **An env override for every path the hook reads.** Marker files, `project.json`, catalog
   directories, `CLAUDE.md` — each is resolved as `process.env.<THING>_OVERRIDE ?? <default>`. This
   is not configurability for its own sake; it is the only thing that makes the hook testable
   against a fixture instead of against your live repo.
7. **A documented bypass, and a non-fatal audit log for decisions.** Bypass markers are
   prefix-matched, never substring-matched — a substring match lets the marker hide inside a commit
   message. Hooks that decide append a `.jsonl` line under the project's `.claude/logs` directory
   inside a `try`/`catch`; a log write must never be able to fail the hook.

Skeleton:

```js
#!/usr/bin/env node
/** <docblock: Event / Purpose / Short-circuit order / Override / Runtime budget> */
if (process.env.CLAUDE_DISABLE_WORKFLOW_HOOKS) process.exit(0);

const input = parseOrExitZero(readStdin());          // see Windows, below
if ((input?.tool_name ?? input?.name) !== 'Bash') process.exit(0);
const command = input?.tool_input?.command ?? input?.command ?? '';
if (!command) process.exit(0);
// ... detectors, then emit JSON + exit 0, or exit 0 silently
```

`SessionStart` hooks are the exception to the skeleton: the ones here read no stdin at all. They
gate on `process.cwd()` and env vars, which is faster and makes them trivial to test.

One more, for feedback-loop hooks: if the hook's own output induces a retry of the tool it just
observed, add a re-entry guard env var so it cannot fire on its own retry chain — and document how
far the guard actually reaches, since a Node process setting `process.env` does not affect its
parent.

## Windows

Two things break silently on Windows, and both are platform-asymmetric: the code passes review on
macOS or Linux and fails only here.

**1. `/dev/stdin` is not reliable.** `readFileSync('/dev/stdin')` throws or reads nothing on
Windows. Every hook in this repo's `.claude/hooks/` tree works around it the same way: a
synchronous `readSync(0, ...)` loop on fd 0. Skip the fallback and the hook reads an empty payload,
fails open, and passes everything through — installed, and enforcing nothing. Copy this verbatim:

```js
let rawInput = '';
try {
  rawInput = readFileSync('/dev/stdin', 'utf8');
} catch {
  try {
    const { readSync } = await import('node:fs');
    const buf = [];
    const chunk = Buffer.alloc(65536);
    while (true) {
      try {
        const n = readSync(0, chunk, 0, chunk.length, null);
        if (n === 0) break;
        buf.push(chunk.slice(0, n).toString('utf8'));
      } catch { break; }
    }
    rawInput = buf.join('');
  } catch { process.exit(0); }
}
```

**2. Shell-reported paths are not native paths.** Under git-bash / MSYS, `pwd` and `pwd -P` report
`/c/Users/...`. The shell understands that form; a native Windows binary, a language server, or an
MCP server does not, and the error you get back never names the path format as the cause. So:

| Path needed | Source it with |
|---|---|
| Repo root, from Node (the hook case) | `resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')` — no shell involved, correct everywhere |
| Repo root, from a shell | `git rev-parse --show-toplevel` — emits `C:/Users/...` on Windows, `/home/...` or `/Users/...` elsewhere |
| A non-root directory that must stay native | `cygpath -m "$(pwd)"` |
| Shell-only use (`cd`, `test`, redirection) | `pwd` is fine |

Never hardcode a separator or a drive letter; let a portable command produce the value. Hooks here
resolve their own repo root from `import.meta.url` and count directory levels up from the hook's
own location — which sidesteps the shell entirely and is the right default for a hook.

The executable bit is a non-issue as long as you wire hooks as `node <path>` (see below) rather
than relying on the shebang: `chmod +x` does not set git's mode on Windows, so a hook that depends
on being executable works on your machine and not on a fresh clone.

## Testing — Run It Before You Wire It

A hook is executable, so it is testable by *running* it. This is the one artifact type in the
workflow with real unit tests, and there is no excuse for wiring an untested one.

Drive it by piping a JSON payload and asserting on stdout and the exit code:

```bash
echo '{"tool_name":"Bash","tool_input":{"command":"git add -A"}}' | node <path-to-hook>
```

Every hook should have a sibling `<name>.test.mjs` — 8 of the 10 production hooks here do;
`session-start.mjs` and `graph-tools-directive.mjs` are the two still without one. The repo's test
runner discovers `*.test.mjs`
recursively and roots at the `.claude/hooks` directory among others, so a correctly-named sibling
is picked up with no registration step. The established harness spawns the real script —
`spawnSync('node', [HOOK], { input, env })` — rather than importing it, because the contract under
test is the process contract.

Cover at minimum:

| Case | Expected |
|---|---|
| The positive case | the decision fires, with the exact JSON shape |
| The negative case | silent pass, exit 0, empty stdout |
| The bypass marker | pass, and only as a prefix — assert that a mid-string marker does *not* bypass |
| `CLAUDE_DISABLE_WORKFLOW_HOOKS=1` | pass |
| Malformed stdin | exit 0 |
| A wrong-tool payload | exit 0 |
| Every false-positive guard the detectors carry | pass (e.g. a flag quoted inside a commit message) |

Rule 6 of the house pattern pays off here: point the hook's `*_OVERRIDE` env vars at fixtures so
the test never depends on the state of the live repo.

For the RED-state question — what a hook test must fail on *before* the hook exists — see
`references/pressure-testing.md` § hooks. Do not skip it: a hook test written after the hook
usually just re-states the implementation's own branches.

**What tests cannot cover: the wiring.** No unit test touches the config file, so a fully green
suite tells you the script is correct and nothing at all about whether the harness will ever run
it. That is the next section, and it is why it comes after this one.

## Wiring

Hooks are declared in `.claude/settings.json` under a top-level `hooks` key:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/<event>/<name>.mjs",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

Four levels, and each one is load-bearing: the `hooks` wrapper, the event name (whose value is an
array), a matcher group, then the inner `hooks` array of handlers. **Note the two nested `hooks`
keys.** Both are required.

**This is the silent-drop surface.** An unrecognized top-level key in the settings file is ignored
without an error. A hooks block written without the wrapper — events placed directly at the top
level — is syntactically valid JSON, reads as correct to a human, and never fires. Nothing tells
you. After any edit here, confirm the hook actually fires; do not infer it from a green test suite
or from the file looking right.

**Matcher evaluation** decides itself from the characters you use:

| Matcher form | Evaluated as |
|---|---|
| `"*"`, `""`, or omitted | match all |
| Only letters, digits, `_`, `-`, spaces, `,`, `\|` | exact string, or a pipe/comma-separated list — `Bash`, `Edit\|Write` |
| Anything else | JavaScript regex, **unanchored** — `^Notebook`, `mcp__memory__.*` |

The third row is the trap. `Grep|Glob` is a literal list, but `mcp__codebase-memory-mcp__.*`
contains `.` and `*` so it becomes a regex — both forms are in use here, and nothing marks which is
which except the characters themselves. Unanchored also means `Edit.*` matches `NotebookEdit`; use
`^Edit$` when you mean exactly one tool.

Useful handler fields beyond `command`: `timeout` (seconds — set one, and keep it consistent with
the runtime budget in your docblock), and `if`, which filters on tool arguments using permission
rule syntax (`"if": "Bash(rm *)"`) so you can narrow the trigger in config instead of re-checking
inside the script.

**Two hooks on one matcher** both receive the original input independently and each may emit its
own output. If both emit `updatedInput`, how the harness reconciles them is not guaranteed — keep
their writes to disjoint fields, and note the coupling in both docblocks.

**Config locations**, narrowest wins:

| Location | Scope | Committed |
|---|---|---|
| user-level `settings.json` in your home `.claude` directory | every project | no |
| `.claude/settings.json` | this project | **yes** — where this repo's hooks live |
| project-local `settings.local.json` | this project | no (gitignored) |

## Registration

**A new hook trips the orphan gate almost always, and a citation is not the fix.**

The component graph flags any node with no inbound edge. Hooks are dispatched by the harness, so
nothing in the corpus dispatches them — and nothing *can* cite one into existence either, because
the citation extractor reads Markdown and a hook is JavaScript. Writing prose that names your hook
does not produce an edge. Seven of the ten hooks here are in exactly this position.

The correct resolution is a declaration, not a reference: add the hook under
`entryPoints.harnessInvoked` in `docs/reference/skill-surface-policy.json`, keyed by the hook's
bare name, valued by the reason it has no inbound edge. An empty or missing reason fails the schema
check, and the invariant is bidirectional — a stale declaration for a hook that later *does* gain
an inbound edge fails exactly like a missing one.

An inbound edge to a hook is not impossible in general; three of the ten have one, via the
generated gate map under `docs/reference/`. It just never arrives by citation. If your hook is
genuinely referenced by a gate or another structured map, declare nothing — the edge already
exists.

The spine's authoring checklist in `skills/creating-tools/SKILL.md` mirrors this step. It is the
last thing to do, after the hook is tested and wired, and it is the step most often forgotten
because the gate that catches it runs somewhere else.

## Common Mistakes

| Mistake | Why it fails |
|---|---|
| Events placed at the top level of the settings file, without the `hooks` wrapper | Unrecognized top-level keys are dropped silently. The block reads as correct and never fires — the worst defect available here. |
| Trusting a green test suite as evidence the hook is live | No unit test reads the config file. Tests prove the script; only firing it proves the wiring. |
| Denying with exit 2 | Collapses "the hook decided" and "the hook crashed" into one signal, and surfaces raw stderr instead of a structured reason. Deny with JSON and exit 0. |
| Throwing on malformed or unexpected input | Blocks the user's real work over a bug in the hook. Fail open on every unexpected path. |
| `readFileSync('/dev/stdin')` with no fd-0 fallback | Reads nothing on Windows, so the hook fails open and enforces nothing while appearing installed. |
| Handing a `pwd`-derived path to a native binary or MCP server | git-bash reports `/c/...`, which native tools cannot resolve, and the error never names the path format. Resolve from `import.meta.url` in a hook. |
| Registering `PostToolUse` and expecting to see failures | It fires only on success. Failures need `PostToolUseFailure`. |
| Assuming a matcher is a literal | Any character outside letters, digits, `_`, `-`, space, `,`, `\|` silently makes it an unanchored regex. |
| Reading paths with no env override | The hook can only be tested against the live repo, so its tests are slow, order-dependent, and can be broken by unrelated commits. |
| A substring-matched bypass marker | The marker hides inside a commit message or a prompt and bypasses the hook by accident. Prefix-match only. |
| Adding prose that names the hook to satisfy the orphan gate | The citation extractor reads Markdown; a hook is JavaScript, so no prose produces an edge. Declare it under `entryPoints.harnessInvoked` with a reason. |
| Copying an event list or an output-field set from a cached snapshot | The event set and the decision enums both change between versions. Verify against the official documentation. |
