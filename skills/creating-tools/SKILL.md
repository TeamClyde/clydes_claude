---
name: creating-tools
description: Use when creating or editing any workflow component — a skill, agent, rule, hook, or command. Covers artifact selection, the evaluation-first authoring cycle, type-specific conventions, and the registration gates a new component must satisfy.
allowed-tools: Read, Write, Edit, Bash, Agent, Skill
---

# Creating Tools

Authoring guidance for every workflow component this repo ships: skills, agents, rules, and
hooks. This file is the shared spine — the parts that are the same whatever you are building.
The per-type mechanics live in `references/`, one file per artifact type, listed in §5.

Work through the sections in order. §0 decides *what* to build, §1–§3 decide *how well*, §4
gets it accepted by the graph gates, §5 hands off to the type-specific reference.

## Contents

- [§0 Artifact selection — which of the four is this?](#0-artifact-selection--which-of-the-four-is-this)
- [§1 The Iron Law and the evaluation cycle](#1-the-iron-law-and-the-evaluation-cycle)
- [§2 Degrees of freedom](#2-degrees-of-freedom)
- [§3 Context discipline](#3-context-discipline)
- [§4 Registration — the six gates, in the order that satisfies them](#4-registration--the-six-gates-in-the-order-that-satisfies-them)
- [§5 Type routing](#5-type-routing)
- [Common mistakes](#common-mistakes)

## §0 Artifact selection — which of the four is this?

Make this call first and make it explicitly. The four types differ in *when they load* and in
*what enforces them* — not in subject matter, so the topic of the guidance tells you nothing
about which one you want.

| | Loads | Enforced by | Choose when |
|---|---|---|---|
| **skill** | on invocation, into the main context | the model reading it | a procedure the caller runs deliberately |
| **agent** | into a fresh isolated context | the model, plus a tool allowlist | work that must not pollute the caller's context |
| **rule** | always, every session | the model reading it | a constraint that must hold everywhere |
| **hook** | never — it *executes* | **the harness** | the constraint is mechanically checkable, or prose has already failed to hold it |

Three decisions people get wrong, in order of frequency:

- **Rule vs. skill.** Ask whether it must fire in *every* session or only when a task calls for
  it. Always-on is the rule's whole cost: it is paid in every conversation whether or not it
  applies. A methodology with steps is a skill even when it feels universal.
- **Skill vs. agent.** Ask whose context window pays. If the work produces a large volume of
  intermediate reading the caller does not need afterwards, that is an agent. If the caller
  needs the output *and* the reasoning inline, that is a skill.
- **Anything vs. hook.** Ask whether a program could check it. If the answer is yes, prose is
  the weaker choice and you should say so out loud before defaulting to a Markdown file.

That last row is the one this repo has direct evidence for. Two measured failures — a front-door
routing directive bypassed in 37% of invocations, and 28 dead component references that
accumulated while an audit nominally checked for them — were both cases of a correctly-written
prose instruction not holding. Neither was fixed by rewriting the prose. If a constraint is
mechanically checkable and it has already been violated once, the next version of it is a hook.

**A command is not a fifth type.** The platform merged custom commands into skills:
`.claude/commands/<name>.md` and `.claude/skills/<name>/SKILL.md` both produce `/<name>`.
Author it as a skill and set `disable-model-invocation: true` so it is reachable only by the
explicit `/name` call. There is no separate command route.

**This repo authors no plugins.** It consumes them. If that changes, the official plugin
documentation is the reference — do not reinstate a delegation to a plugin-authoring skill.

If you genuinely cannot tell which type the request wants, ask one question before building.
Guessing wrong costs the author a full rewrite; asking costs one turn.

## §1 The Iron Law and the evaluation cycle

```
NO COMPONENT WITHOUT AN OBSERVED FAILURE FIRST
```

This binds new components and edits alike. If you wrote the guidance before watching anything
fail without it, you know what you *predicted* would go wrong — not what does. Those differ far
more often than authors expect, and prose gives you no compiler error to tell you which one you
have.

**REQUIRED BACKGROUND:** the `test-driven-development` skill defines the RED-GREEN-REFACTOR
cycle this adapts. Read it first if the mapping below is not already familiar.

The cycle, in four moves:

1. **Baseline.** Run the realistic task against a fresh instance with the component absent.
   Record verbatim what it does and how it justifies doing it. This is RED.
2. **Three scenarios.** Design three pressure scenarios aimed at the *specific* failures the
   baseline produced — not at hypothetical ones. Three is the working count: one scenario
   confirms nothing about robustness, and beyond three the marginal scenario tends to re-test
   a gap already covered.
3. **Minimal instructions.** Write only what addresses the observed gaps. Guidance written for
   failures you never watched happen is untested by construction, and it is pure recurring cost.
4. **Re-run and close loopholes.** Verify compliance on the baseline, then on the three
   scenarios. Each new rationalization that appears is a loophole to close and re-verify.

**Claude A and Claude B must be different instances.** Claude A is you — the author, who already
knows the intended answer and therefore cannot serve as evidence. Claude B starts cold: a
separate instance that cannot see this conversation, sent in to attempt the task for real.
Re-reading your own draft and finding it convincing tests nothing at all.

Skip the cycle only for pure-reference material with no behavior to violate — a syntax table, a
field inventory. Anything that enforces a discipline or costs the model effort to follow gets
the full cycle.

Full technique, per artifact type, including the hooks branch (which runs a genuine unit test
rather than a prose baseline): `references/pressure-testing.md`.

## §2 Degrees of freedom

Match how specific the instructions are to how fragile the task is. This is a dial, not a
style preference, and setting it wrong fails in both directions: over-specify a flexible task
and the component obstructs good judgement; under-specify a fragile one and it fails silently.

| Freedom | Shape of the instruction | Use when |
|---|---|---|
| **High** | Goals and heuristics in prose | several approaches are valid and the right one depends on context |
| **Medium** | A pattern or parameterised template to adapt | a preferred approach exists but variation is acceptable |
| **Low** | One exact command, stated as such | the operation is fragile, order-dependent, or destructive |

At low freedom, say so explicitly — *"run exactly this; do not add flags"* — because an
instruction that merely looks precise still reads as a suggestion. The test for which setting
you need: ask how many safe paths exist. Many safe paths, give direction. One safe path with
consequences on either side, give the exact steps and the prohibition.

## §3 Context discipline

Every line of a component is a recurring cost, paid on every load, forever. A rule pays it in
every session; a frequently-invoked skill pays it several times a day. That cost is the reason
most of the editing effort goes into removal.

Three rules that do most of the work:

- **State what to do, not how it works or why it was chosen.** The model does not need the
  rationale to comply, and the rationale is usually the longest part of a first draft. Keep the
  *why* only where an author would otherwise "improve" the instruction into something wrong.
- **Write standing instructions, not narrative.** The file is read once, at load, with no
  memory that it was read before. "In session 2026-03-04 we found…" is unusable; "never stage
  with a wildcard" is usable.
- **Push heavy material one level down.** Anything over roughly 100 lines that is consulted
  rather than followed — a field inventory, an API surface, a long worked example — belongs in
  a sibling file the spine points to, so the cost is paid only by the reader who needs it. A
  skill whose own body violates this is self-refuting.

Assume the reader knows the platform. Explaining what a subagent is, or what YAML frontmatter
does, is spend with no return.

## §4 Registration — the six gates, in the order that satisfies them

A new component is not finished when its file is written. Six graph invariants run in the test
suite, and each one has a specific remediation. **The gates name their own remediation in their
failure messages, including the exact files to edit** — so work from the failure text, not from
a path memorised here. That is deliberate: a path written into this file goes stale silently,
and a path read out of the failing assertion cannot.

Work in this order. Each step is cheaper than discovering it from a red suite later.

1. **Stage the file before running the suite.** Every gate enumerates the corpus through the
   git index, not the working tree. An unstaged new file is *invisible* to the gates, so the
   suite goes green without ever having checked it — and an unstaged deletion crashes a gate
   outright. Stage first, always, in both directions.
2. **Budget the description, and raise the ceiling in the same commit if it does not fit.** Every
   skill description is loaded into every session, so their combined length is capped by a
   ratchet held deliberately a few characters above the current total — meaning **a new skill
   almost always fails this gate on its first run.** That is the ratchet working, not a defect
   in your description. Two branches:
   - **The description can be shorter without losing a trigger** → shorten it. Preferred: the
     cost is permanent and paid every session.
   - **It is already minimal** → raise the ceiling to the newly measured total plus the same
     small headroom, and record what was added and why alongside the existing entries. The gate
     compares total against ceiling and passes either way, so it cannot tell a deliberate raise
     from an unnoticed one — the written record is the only thing that can.

   Only a skill's description counts. Agents, rules and hooks do not load into this budget.
3. **Give the component an inbound edge, or declare that it should not have one.** A component
   nothing cites is an orphan, and the orphan gate fails on it. Two branches, and you must pick
   deliberately:
   - **It should be reachable** → add a citation from whatever component should reach it, in a
     shape the extractor reads (a backticked component name in the citing component's own body).
   - **It is an entry point by design** → declare it, with a written reason, in the policy file
     the gate's failure message names. Rules and hooks are usually this branch.

   Never manufacture a citation purely to quiet the gate. A citation that no reader would follow
   is a dead reference the moment it ships, and the orphan gate exists to surface exactly the
   question you would be suppressing.
4. **Know which files produce edges.** Only a component's own primary body is scanned — a
   skill's `SKILL.md`, an agent's or rule's file. Material in a sibling reference file produces
   **no** edge. Citing something from a reference file will not satisfy step 3, and discovering
   that after the fact is the most common way this step is repeated.
5. **Check the paired invariant.** If you declared an entry point, that declaration asserts the
   component has *zero* inbound edges. Adding a citation to it later breaks the declaration
   rather than the orphan check, and the failure message names the component now citing it.
6. **Document it in the explanation layer.** Every component must be named in an explanation
   doc or declared catalog-only, with a reason. A one-line mention in the most fitting explainer
   satisfies this; nothing about it is onerous, and skipping it is a guaranteed red suite.
7. **Regenerate the derived artifacts and re-run.** The inventory and gate-map files are
   generated, never hand-edited. Regenerate them in the same commit; a drift guard compares
   them against a fresh harvest.

**Hooks branch differently at step 3, and skip step 2 entirely.** A hook has no outbound edges and nothing dispatches it —
the harness fires it on an event. Zero inbound edges is its correct steady state, so a hook
normally takes the entry-point declaration branch rather than the citation branch. It carries no
description into the skill listing either, so the budget step does not apply to it — nor to an
agent or a rule. A hook also
has a registration step the other three types do not: it must be wired into `.claude/settings.json`
against the event that triggers it, or it is a file that never runs. `references/hook-conventions.md`
covers the wiring shape.

Then commit through the `git-manager` skill, which stages named files rather than a wildcard.

## §5 Type routing

Read the spine above first — all of it applies. Then load exactly one of these:

| Building | Load |
|---|---|
| a skill, or a `/name` command | `references/skill-conventions.md` |
| an agent | `references/agent-conventions.md` |
| a rule | `references/rule-conventions.md` |
| a hook | `references/hook-conventions.md` |

`references/pressure-testing.md` is loaded alongside whichever of the four you picked, at the
point §1's cycle begins. It carries the skill, agent, and hook branches of the technique.

## Common mistakes

1. **Writing the component before observing a failure.** The Iron Law has no size exemption —
   "it is only a small addition" is where it is broken most often. Guidance written first
   documents the author's prediction, and there is no later step that turns it into evidence.
2. **Choosing the artifact type from the subject matter.** "It is about git, so it is a rule"
   is not a reason. The question is when it loads and what enforces it, which §0's table
   answers and the topic does not.
3. **Reaching for a Markdown file when the constraint is mechanically checkable.** Prose that
   has already been bypassed once will be bypassed again. Consider the hook before writing the
   third revision of the sentence.
4. **Citing a component from a reference file and expecting an edge.** Only the primary body is
   scanned. This is the failure that costs a full extra round through the gates.
5. **Running the suite before staging.** A green run over an unstaged file proves nothing, and
   an unstaged deletion produces a crash that looks like a real regression and is not.
6. **Explaining the rationale at length inside the component.** The reasoning belongs in the
   commit message or the design record. Inside the component it is recurring cost with no
   behavioral return.
