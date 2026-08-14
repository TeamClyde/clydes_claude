# Skill Conventions

Authoring reference for skills — `SKILL.md` plus any supporting `references/*.md` or `scripts/*`
files it points to. A **command** is not a separate artifact: it is a skill carrying
`disable-model-invocation: true`, invoked only via `/name` instead of automatically by the model.
Everything below applies equally to both.

Deciding whether the behavior you want is a skill at all — versus an agent, a rule, or a hook —
happens before this file is relevant. See `skills/creating-tools/SKILL.md`'s artifact-selection
guidance first; everything below assumes that call has already been made.

## Contents

- [Frontmatter](#frontmatter)
- [Size Discipline](#size-discipline)
- [Structure and Progressive Disclosure](#structure-and-progressive-disclosure)
- [Description and Discoverability](#description-and-discoverability)
- [Portability — the Six-Field Packaging Spec](#portability--the-six-field-packaging-spec)
- [Common Mistakes](#common-mistakes)

## Frontmatter

**Every field is optional.** Only `description` is recommended — it is what Claude reads to decide
whether to load the skill at all. `name` defaults to the directory name if omitted.

| Field | Behavior |
|---|---|
| `name` | Display name in skill listings. Defaults to the directory name. |
| `description` | What the skill does and when to use it. Falls back to the body's first paragraph if omitted entirely. See [Description and Discoverability](#description-and-discoverability). |
| `when_to_use` | Extra trigger phrases, appended to `description` in the listing. Shares the same character budget as `description` — see the truncation note below. |
| `disable-model-invocation` | `true` disables automatic loading; the skill then runs only via manual `/name`. This flag is the entire difference between a "skill" and a "command" — there is no separate command artifact. Default `false`. |
| `user-invocable` | `false` hides the skill from the `/` menu while leaving automatic invocation intact. Default `true`. |
| `allowed-tools` | Tools usable without a permission prompt for the rest of the turn. **Grants only — does not restrict the tool pool.** Every tool stays callable regardless of this list. |
| `disallowed-tools` | **kebab-case.** Tools removed from the available pool while the skill is active — the actual restriction mechanism. Clears on the next message. |
| `argument-hint` | Autocomplete hint shown after `/name`, e.g. `[issue-number]`. Not part of the six-field packaging spec — see [Portability](#portability--the-six-field-packaging-spec). |
| `arguments` | Named positional arguments for `$name` substitution in the body. |
| `model` | Model while the skill is active, for the rest of the turn only — not persisted to settings. |
| `effort` | `low`, `medium`, `high`, `xhigh`, or `max` — overrides session effort while the skill is active. |
| `context` | `fork` runs the skill in a forked subagent context instead of inline. |
| `agent` | Which subagent type to fork into, when `context: fork` is set. |
| `background` | Only meaningful with `context: fork`. `false` waits for the forked result inline; default `true`. |
| `hooks` | Hooks scoped to this skill's own lifecycle. |

**The trap to know about:** `allowed-tools` sounds like a restriction and is not one. A skill that
omits `Edit` from `allowed-tools` can still edit — it just prompts first. To actually deny a tool,
use `disallowed-tools` instead, and note the casing difference from an agent's `disallowedTools`
(camelCase — see `references/agent-conventions.md`).

## Size Discipline

**The size bar is `≤500 lines`, not `<500 words`.** A word-count limit circulated in this repo's
earlier guidance; it was never sourced from official documentation, and checking it against this
repo's own 42 skills shows why it should not be reinstated:

| Bar | Source | Pass rate across 42 skills |
|---|---|---|
| `<500 words` | Unsourced, self-invented | 0 / 42 |
| `≤500 lines` | Official, confirmed | 39 / 42 |

A bar the entire corpus fails is not a bar anyone is actually checking against — it is decoration.
Measure size in lines. If a skill creeps past 500 lines, the fix is to split content into
`references/`, not to argue it still fits under some other unit of measurement.

**Why size matters at all — this part is rationale, not a rule.** Auto-compaction re-attaches only
the first ~5,000 tokens of each previously-invoked skill, sharing one combined ~25,000-token budget
across every skill in play, filled starting from the most-recently-invoked. Once that shared budget
runs out, older skills are dropped from the re-attached context entirely rather than truncated
evenly. A skill that front-loads its essential content in the first few thousand tokens survives
compaction; one that buries the essentials further in risks losing them. That mechanism — not a
stylistic preference for brevity — is the real reason to keep `SKILL.md` lean and push detail into
`references/` files that only load on demand.

## Structure and Progressive Disclosure

```
skills/
  skill-name/
    SKILL.md              # required — the only file loaded automatically
    references/
      topic.md             # loaded on demand, only when SKILL.md points to it
    scripts/
      helper.sh             # executed, never loaded into context
```

**One level deep, always.** `SKILL.md` may point a reader into a `references/` file. That file may
not point into a further file of its own — `SKILL.md → advanced.md → details.md` is the documented
example of what not to do. If a reference file needs to send a reader somewhere else, either fold
that content back into the reference file or promote the target to a sibling `SKILL.md` links to
directly, rather than nesting a second hop.

**A table of contents is required once a file passes 100 lines.** Below that threshold a reader can
scan the headers directly; above it they cannot, and an un-navigable reference file defeats the
point of having split the content out in the first place.

**Scripts are executed, not loaded.** A helper under `scripts/` costs nothing in context until it
actually runs, unlike a `references/*.md` file, which costs tokens the moment `SKILL.md` points a
reader at it. Prefer a script over a reference file when the content is a procedure to run rather
than something to read — and document only what the script does, not every flag it accepts; point
at its own `--help` output for the rest.

**Deciding what to split out:**

| Keep inline in `SKILL.md` | Move to `references/` (or `scripts/`) |
|---|---|
| Principles, decision criteria, short code patterns (roughly under 50 lines) | Heavy reference material — full API surfaces, comprehensive syntax tables |
| Anything relevant on every invocation | Anything relevant only to a specific sub-case |
| — | Reusable scripts, templates, or utilities |

A skill with no heavy reference material and no reusable tooling is legitimately self-contained.
Everything living in one `SKILL.md` is not, by itself, a defect to fix.

## Description and Discoverability

**Capability, not procedure.** The description's job is to answer "should this skill load right
now?" — not to narrate how it works internally. Summarizing internal steps has an observed failure
mode: a description reading "dispatches a subagent per task with a review between tasks" caused an
agent to run a single review where the skill's own body specified two. The description became a
shortcut that replaced reading the body. State what the skill is for and when it applies; leave the
mechanism out.

| | Example | Verdict |
|---|---|---|
| Capability — what it's for | "Executes an implementation plan task-by-task in isolated contexts" | Keep |
| Procedure — how it works internally | "dispatches a subagent per task with a code review between tasks" | Remove |

```yaml
# poor — narrates internal steps; becomes a shortcut past the body
description: Use when executing plans - dispatches a subagent per task with a review between tasks

# poor — trigger only, states no capability
description: Use when executing implementation plans with independent tasks

# good — capability plus trigger, no procedure
description: Executes an implementation plan in isolated per-task contexts. Use when you have a written plan with independent tasks.
```

Write in third person — the text is injected into a system prompt, not spoken by the skill itself.
Front-load the primary use case: the listing truncates a skill's combined `description` and
`when_to_use` at **1,536 characters** (the `perSkillMaxChars` figure in
`docs/reference/skill-surface-policy.json`), and anything past that cutoff — including trigger
keywords stacked at the very end — is simply lost.

**Keyword coverage.** Use the words a future search would actually use: literal error messages
("Hook timed out"), symptoms ("flaky", "hanging", "race condition"), and the real tool or command
names involved. A description that states only the abstract capability, with none of the concrete
symptoms that motivate reaching for it, is harder to match against a real question.

**Naming.** Verb-first, active voice: `condition-based-waiting` reads better than
`async-test-helpers`; `root-cause-tracing` reads better than `debugging-techniques`. A gerund
(`-ing`) form fits a process skill naturally — `writing-skills`, `debugging-with-logs`.

## Portability — the Six-Field Packaging Spec

Claude Code itself accepts every frontmatter field listed above. Other distribution paths do not.
A skill being uploaded to claude.ai, packaged through the Skills API, or attached to a scheduled
routine or cloud session is restricted to six fields: `name`, `description`, `license`,
`compatibility`, `metadata`, `allowed-tools`.

A field outside that set does not degrade gracefully — packaging fails with a hard error naming the
offending key. `disable-model-invocation`, `when_to_use`, and `argument-hint` are three fields
authors reach for often, and none of them survive packaging. A skill that needs to run in a
scheduled or cloud context has to be written with that six-field ceiling in mind from the start;
there is no automatic fallback conversion at upload time.

Body content is affected too: dynamic context injection at invocation time is a Claude Code-only
body feature and does not function in claude.ai chat or through the API.

## Common Mistakes

| Mistake | Why it fails |
|---|---|
| Reintroducing a word-count size bar | The line bar is the official, sourced one; a word bar has already been shown to fail 42 of 42 skills in this repo. See [Size Discipline](#size-discipline). |
| A `references/` file that points to another `references/` file | Breaks the one-level-deep rule — flatten the content, or promote the target to a sibling `SKILL.md`. |
| A reference file over 100 lines with no table of contents | Un-navigable — add one. |
| Narrating the workflow inside `description` | Becomes a shortcut the model takes instead of reading the body. State capability, not procedure. |
| Trigger keywords placed at the very end of a long description | Lost past the 1,536-character listing cutoff — front-load the primary use case instead. |
| Documenting every script flag inline in `SKILL.md` | Wastes tokens on every invocation. Reference the script's own `--help` output instead. |
| A narrative example ("in session X, we found...") | Too specific to one incident to be reusable — write the general pattern instead. |
| The same example duplicated across several languages | Maintenance burden for no added clarity. One excellent example beats several mediocre ones. |

For the evaluation cycle that validates a skill before it ships — baseline testing, pressure
scenarios, and the RED-GREEN-REFACTOR loop — see `references/pressure-testing.md`.
