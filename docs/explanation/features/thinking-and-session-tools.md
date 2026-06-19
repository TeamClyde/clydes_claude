---
**Feature:** Thinking & Session Tools
**C4 Layer:** C3 Component
**Status:** Active
**Owner:** solo
**Last updated:** 2026-06-18
**Related plans:** plans/orchestration-layer-foundation/ (Phase 1B docs)
**Related ADRs:** _(none)_
**Key files:**
  - `skills/different-viewpoint/SKILL.md`, `skills/different-viewpoints-lite/SKILL.md` — Phoenix Checklist thinking tools
  - `skills/handoff/SKILL.md`, `skills/feedback/SKILL.md` — session continuation + friction capture
  - `skills/dispatching-parallel-agents/SKILL.md`, `skills/using-git-worktrees/SKILL.md`, `skills/using-superpowers/SKILL.md` — parallelism, isolation, skill discovery
---

# Thinking & Session Tools

## Context & Scope

This explainer covers seven skills that serve two related purposes: improving the quality of in-session reasoning before decisions are made, and managing the practical boundaries of a work session (starting it correctly, handing it off cleanly, capturing what went wrong).

These are not implementation skills. They produce no code, modify no data model, and own no persistent state beyond ephemeral artifacts (`plans/phoenix/` sweep outputs, the active plan's handoff doc, GitHub friction issues). They are ambient infrastructure — available at any point in a session and composable with every other skill group.

**What this covers:**
- `different-viewpoint` — full CIA Phoenix Checklist sweep; problem-definition and hypothesis-challenge modes
- `different-viewpoints-lite` — adversarial 5-question subset; selects questions by damage potential, not topic relevance
- `handoff` — produces a copy-pasteable continuation prompt; refreshes the active plan's handoff doc in place when one exists
- `feedback` — captures mid-session workflow friction as a GitHub issue in `TeamClyde/clydes_claude`; does not interrupt current work
- `dispatching-parallel-agents` — fans out 2+ independent tasks to isolated subagents running concurrently
- `using-git-worktrees` — creates an isolated git worktree for feature work; verifies gitignore safety and clean test baseline before handing off
- `using-superpowers` — session-start orientation: instruction priority hierarchy, skill invocation rule, orientation protocol for unfamiliar repos, extended agent registry

**What this does NOT cover:**
- Plan creation, execution, or status tracking — see `docs/explanation/features/planning-and-plan-docs.md`
- Git commit, branch, push, and PR operations — see `docs/explanation/features/git-jira-workflow.md`
- Systematic debugging and code review — see `docs/explanation/features/quality-and-review.md`
- Test execution — see `docs/explanation/features/testing-system.md`

For the authoritative component registry entry for each skill, see `docs/reference/component-inventory.md`.

---

## Building Block View

### Thinking tools

**`different-viewpoint`** — Full CIA Phoenix Checklist. Takes a problem statement and an optional `hypothesis:` argument. In *problem-definition mode* (no hypothesis) it works through all questions in order to surface what the actual unknown is before any solution is considered. In *hypothesis-challenge mode* it annotates each answer as supporting, challenging, or neutral to the hypothesis, with the goal of finding where an honest answer makes the hypothesis look wrong. The full Q&A is written to `plans/phoenix/<slug>.md`; the user receives only the frame-shifting answers — those where the answer contradicted a starting assumption, revealed an unknown unknown, or changed how the problem should be stated.

**`different-viewpoints-lite`** — Adversarial 5-question Phoenix Checklist challenge. Uses the same question bank as `different-viewpoint` but selects questions by a three-step adversarial process: identify threat categories (scope wrong, information incomplete, wrong component, constraint missed, timing/ordering error, success criteria undefined, reversibility not considered), generate a candidate pool of questions that probe those threats, then apply a negative constraint before finalising 5. The negative constraint guards against a known failure mode: defaulting to the same five generic questions without per-question justification tied to the specific hypothesis. Output is written to `plans/phoenix/<slug>-lite.md` and concludes with one of three verdicts: hypothesis survived, hypothesis weakened, or hypothesis challenged (the last recommends running the full sweep before acting).

### Session-management tools

**`handoff`** — Produces a copy-pasteable continuation prompt for the next session, always inside a single markdown code fence. The prompt names the entry-point doc(s), what is currently being worked on, and the immediate next step. When `.claude/active-plan` is present and non-empty, the skill additionally refreshes the active plan tree's handoff doc in place — updating the status table, active task, last-updated date, and open gotchas. If the active plan pointer resolves to a sub-plan, the skill walks up the directory tree to find the top-level handoff (sub-plans have no handoff of their own). When no active plan exists, no file is written; the emitted prompt carries all context inline. This is a standalone skill — it reads `.claude/active-plan` but never writes it and never appends to the journal.

**`feedback`** — Captures mid-session workflow friction without interrupting current work. The skill first captures a context snapshot from the current session (active plan doc, current Jira task, last skill invoked, verbatim feedback, timestamp), then spawns a subagent that classifies the friction into a fixed category set and records it as a GitHub issue in `TeamClyde/clydes_claude`. The skill always records to that repo regardless of the active working repository. If `gh` is not authenticated, it surfaces `AUTH_FAILED` and stops. It does not write to any flat `docs/workflow-feedback.md` file — that path is archived.

**`dispatching-parallel-agents`** — Coordinates fan-out of 2+ independent tasks to isolated subagents running concurrently. The skill defines a decision flow: multiple failures → are they independent? → can they work in parallel? → dispatch one agent per problem domain. Each dispatched agent receives a fully self-contained prompt (scope, goal, constraints, expected output format) with no inherited session context. The main context collects all results before synthesising — it does not act on partial results.

**`using-git-worktrees`** — Creates an isolated git worktree for feature work. Directory selection follows a strict priority order: existing `.worktrees/` or `worktrees/` directory wins; CLAUDE.md preference is consulted next; the user is asked only when neither exists. For any project-local directory, the skill verifies gitignore status with `git check-ignore` before creating the worktree — if the directory is not ignored, it adds the entry to `.gitignore` and commits before proceeding. After worktree creation, the skill runs project setup (auto-detected from `package.json`, `Cargo.toml`, `requirements.txt`, etc.) and verifies a clean test baseline. It also persists the base branch ref to `.claude/worktrees/<wt-name>/base-branch` so that `finishing-a-development-branch` can restore the original context after cleanup.

**`using-superpowers`** — Session-start orientation skill. Establishes the instruction priority hierarchy (user instructions > rules > skills > default system prompt), explains how to invoke skills via the `Skill` tool, and defines an orientation protocol for unfamiliar repos: `project.json` → `codebase-entry` file → active plan doc → stop. It also registers the extended agent roster and the `plan-gate` skill. The skill includes a Red Flags table listing common rationalisations used to skip skill invocation, and is skipped by subagents (`<SUBAGENT-STOP>` guard).

---

## Runtime View

### Phoenix Checklist sweep (different-viewpoint)

```
User: /different-viewpoint <problem> [hypothesis: <theory>]
  → answer all problem questions in order
  → answer all plan questions in order
  → write full Q&A → plans/phoenix/<slug>.md
  → return only frame-shifting answers to user (or "No frame shifts detected")
```

### Adversarial challenge (different-viewpoints-lite)

```
User: /different-viewpoints-lite <problem> [hypothesis: <theory>]
  → Step 1: identify 2–3 threat categories for this hypothesis
  → Step 2: generate candidate questions that probe those categories
  → Step 3: apply negative constraint → select 5 highest-damage questions
  → answer each adversarially with explicit undermining statement
  → write output → plans/phoenix/<slug>-lite.md
  → return verdict: survived / weakened / challenged
```

### Session handoff

```
User: /handoff
  → read .claude/active-plan
    ├── active plan present → resolve top-level handoff doc (walk up from sub-plan if needed)
    │                         refresh handoff doc in place; emit prompt pointing at handoff + plan
    └── no active plan → emit prompt with inline context only (no file writes)
```

### Feedback capture

```
User: /feedback <what felt wrong>
  → capture snapshot (active plan, Jira task, last skill, timestamp)
  → spawn subagent: classify → record GitHub issue in TeamClyde/clydes_claude
    ├── AUTH_FAILED → surface to user, stop
    └── success → single-line confirmation, continue current work
```

### Parallel agent dispatch

```
identify N independent problem domains
  → for each domain: craft self-contained agent prompt (scope + goal + constraints + output)
  → dispatch all N agents concurrently (no shared state)
  → collect ALL results before synthesising
  → review summaries → check for conflicts → run full suite → integrate
```

### Worktree setup

```
User: /using-git-worktrees branch: <name>
  → detect directory: .worktrees/ > worktrees/ > CLAUDE.md > ask
  → if project-local: git check-ignore → if not ignored, add + commit
  → capture base branch ref
  → git worktree add → cd into worktree
  → persist base ref → .claude/worktrees/<name>/base-branch
  → auto-detect + run project setup; run test suite → verify clean baseline
  → report: "Worktree ready at <path>, N tests passing"
```

### Session-start orientation (using-superpowers)

```
session starts (main context only — subagents skip via SUBAGENT-STOP)
  → load instruction priority hierarchy
  → read project.json → codebase-entry file → active plan doc → stop
  → register extended agent roster and plan-gate in working context
  → apply skill invocation rule: invoke BEFORE any response, even at low probability
```

---

## Dependencies

**Internal dependencies:**

- `handoff` reads `.claude/active-plan` (written by `plan-management`); it never writes it. When an active plan exists, it overwrites `plans/<slug>/<slug>-handoff.md` in place.
- `feedback` spawns a subagent (`Agent` tool) to record GitHub issues. It requires the `gh` CLI authenticated on the machine.
- `dispatching-parallel-agents` uses the `Agent` tool to dispatch subagents and the `Read` tool to load context before crafting prompts.
- `using-git-worktrees` writes per-worktree state to `.claude/worktrees/<wt-name>/base-branch`; this file is later consumed by `finishing-a-development-branch`.
- `using-superpowers` is the entry-point for the entire skill system and references the extended agent roster and `plan-gate`. It depends on `project.json` and the `codebase-entry` file existing at repo root.
- `different-viewpoint` and `different-viewpoints-lite` write output to `plans/phoenix/`; they depend on no other internal component.

**External dependencies:**

- `feedback` depends on `gh` CLI authenticated to GitHub (set up at `gh auth login`; never through the chat).
- `using-git-worktrees` depends on `git` and the project's standard toolchain (Node.js / Rust / Python / Go) for the post-creation setup step.
- `using-superpowers` depends on `setup.sh` having been run on a fresh install so that skill symlinks are in place under `~/.claude/`.

---

## Decisions

_(No accepted ADRs yet.)_

---

## Known Issues & Gotchas

- **`different-viewpoints-lite` default-question trap.** The skill's negative constraint explicitly guards against defaulting to the same generic five questions: if more than two generic defaults appear in the final selection, each must be justified as the most threatening question for the specific hypothesis — not just "this is always a good question." Skipping the threat-category identification step (Step 1) is the root cause.

- **`different-viewpoint` — "no frame shifts" is a valid result.** The sweep may complete with no answers that shift framing. This does not mean the sweep failed; it means the current framing is sound. Do not force a frame shift where none exists.

- **`handoff` is not a `plan-management` mode.** It does not append to the journal, does not transition ticket state, and does not write `.claude/active-plan`. Treating it as a divergence event will produce spurious journal noise.

- **`handoff` with a sub-plan active.** When `.claude/active-plan` points to a sub-plan, the skill walks up the directory tree to find the top-level handoff doc — sub-plans have no handoff of their own. Failing to resolve the top level results in a missing or stale handoff for the session that picks up the work.

- **`feedback` — do not batch friction points.** One `/feedback` invocation per friction observation. Batching multiple observations into a single issue makes the `review-workflow` pattern-detection analysis less useful.

- **`feedback` — capture first, resolve later.** The skill explicitly does not resolve friction in the same session. Attempting to both capture and fix in one pass corrupts the signal. Use `review-workflow` as the resolution pass.

- **`dispatching-parallel-agents` — shared-state dispatch causes merge conflicts.** Only dispatch agents in parallel when tasks are genuinely independent (different files, different subsystems, no shared TODO.md rows). If two agents edit the same file, their changes will conflict on integration.

- **`dispatching-parallel-agents` — do not act on partial results.** Collect all agent summaries before synthesising or integrating. Acting on the first agent to return while others are still running produces an incomplete and potentially contradictory integrated state.

- **`using-git-worktrees` — do not run `setup.sh` or `infra-init` from inside a worktree.** Both tools write to `~/.claude/`, which is shared across all worktrees. Running them from a worktree context can corrupt global configuration.

- **`using-git-worktrees` — clean up when done.** Abandoned worktrees accumulate in `git worktree list` and consume disk. The cleanup pair is `finishing-a-development-branch`; invoke it when work in the worktree is complete.

- **`using-superpowers` — subagents skip this skill.** The `<SUBAGENT-STOP>` guard at the top of the skill prevents subagents from running the session-start orientation. This is intentional: subagents receive their own focused context and must not inherit the main session's orientation overhead.

- **`using-superpowers` — plugin skills in Integrated state.** Skills belonging to Integrated plugins (currently `plugin-dev:*`) must be invoked through `creating-tools`, not directly. The `rules/plugin-lifecycle.md` rule enforces this — `using-superpowers` does not override it.

---

## Observability

These skills are interactive session tools with no background processes, metrics endpoints, or persistent services. Observe their effects through the artifacts they produce:

- **`different-viewpoint` / `different-viewpoints-lite`** — check `plans/phoenix/` for the Q&A output files. The presence of a `-lite.md` suffix distinguishes the adversarial variant from the full sweep.

- **`handoff`** — the refreshed `plans/<slug>/<slug>-handoff.md` file is the observable artifact. Its `Last updated` date and status table should reflect the state at the moment the skill ran. The copy-pasteable prompt emitted to the user is ephemeral (transcript only).

- **`feedback`** — the GitHub issue in `TeamClyde/clydes_claude` is the durable record. Accumulation of issues across sessions feeds the `review-workflow` pattern-detection pass.

- **`dispatching-parallel-agents`** — observable only through the integrated result. There is no per-agent artifact in the main context; each agent returns a summary. The main context's synthesis and the subsequent test suite run are the verification layer.

- **`using-git-worktrees`** — `git worktree list` shows all active worktrees. The per-worktree base-branch record lives at `.claude/worktrees/<wt-name>/base-branch`.

- **`using-superpowers`** — no persistent artifact. Observable only through session behaviour: skills are invoked before responses, the orientation protocol stops after its defined steps, and the extended agent roster is used correctly.

---

## Glossary

**CIA Phoenix Checklist** — A structured problem-analysis technique organised into two phases: a problem section that challenges how the problem is defined, and a plan section that challenges how the solution is approached. The mechanism is committing written answers to all questions in order, including those that seem obvious or irrelevant.

**Frame-shifting answer** — In `different-viewpoint` output, an answer that contradicted a starting assumption or hypothesis, revealed an unknown unknown, or changed how the problem should be stated. The only answers returned to the user; the full Q&A is saved to disk.

**Hypothesis-challenge mode** — The operating mode of `different-viewpoint` and `different-viewpoints-lite` when a hypothesis is supplied as an argument. The goal is to find answers that make the hypothesis look wrong, not to confirm it.

**Problem-definition mode** — The operating mode when no hypothesis is supplied. The goal is to surface what the actual unknown is before any solution is considered.

**Adversarial selection** — The method used by `different-viewpoints-lite` to choose its 5 questions. Questions are selected by threat-category analysis and damage potential against the specific hypothesis — not by topic relevance or general usefulness.

**Worktree** — A git feature that allows multiple working trees to be checked out from the same repository simultaneously, each on a different branch, without switching. Created by `git worktree add`. Used by `using-git-worktrees` to give feature work an isolated workspace that does not disturb the main checkout.

**Handoff doc** — The live, continuously-refreshed file at `plans/<slug>/<slug>-handoff.md` that serves as the session entry point for an active plan tree. Owned by `plan-management` for lifecycle transitions; overwritten in place (without journal append) by the `handoff` skill when preparing a session continuation.

**Workflow friction** — A mid-session observation that a skill, rule, or process produced an unexpected, confusing, or counterproductive result. Captured by `/feedback` as a GitHub issue in `TeamClyde/clydes_claude` for later pattern analysis via `review-workflow`.

**Parallel dispatch** — The pattern of submitting 2+ independent agent tasks concurrently using the `Agent` tool, with each agent receiving a fully self-contained prompt and no inherited session context. Coordinated by `dispatching-parallel-agents`.

**Problem domain** — In `dispatching-parallel-agents`, a coherent scope of independent work (e.g. a single failing test file, a single broken subsystem) that can be investigated and fixed without reference to other domains in the same fan-out. The unit of agent assignment.

**`SUBAGENT-STOP` guard** — A marker at the top of the `using-superpowers` skill that instructs dispatched subagents to skip the skill entirely. Prevents subagents from running the main-session orientation when they are already operating with a focused, self-contained prompt.
