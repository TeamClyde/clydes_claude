---
name: handoff
description: Use when you are mid-work and want to start a fresh, clean session that continues the current work — e.g. context is filling up, or you want to resume the same task elsewhere. Produces a copy-pasteable prompt for the next session and, when an active plan exists, refreshes that plan tree's live handoff doc in place.
allowed-tools: Read, Write, Edit, Glob
---

# handoff

**Announce at start:** "Preparing a handoff for a fresh session."

Produces what a new session needs to pick up the current work: always a copy-pasteable prompt, plus an in-place refresh of the active plan's handoff doc when one exists.

This is a standalone skill — **not** a mode of `plan-management`. It reads `.claude/active-plan` but never writes it, and it never appends to the journal.

## Always — Emit a copy-pasteable prompt

Emit a basic prompt for the next session inside a single markdown code fence the user can copy directly. Keep it basic — a few lines, not an elaborate multi-section template. It must contain:

1. **Which doc(s) to read first** — the entry point(s) for the work.
2. **What we are currently working on** — one or two sentences.
3. **The immediate next step** — the very next action the new session should take.

## If an active plan exists

If `.claude/active-plan` is present and non-empty:

1. Read the plan-doc path from `.claude/active-plan`.
2. Resolve the **top-level** plan tree's handoff doc. `.claude/active-plan` may point at a sub-plan (its directory's parent also contains a `*-plan.md`); sub-plans have no handoff of their own — all handoff content rolls up to the top level. Walk up from the active plan's directory until you reach a directory whose parent has no `*-plan.md`; the live handoff is `<top-slug>-handoff.md` in that top-level directory. (For a top-level active plan, this is simply the handoff in the same directory.)
3. Refresh that handoff doc to current state — update the status table, active task, last-updated date, and any open gotchas. This is an **in-place overwrite** of a continuously-refreshed file.
   - It is **not a divergence event:** do **not** append to the journal, and do **not** modify `.claude/active-plan`.
4. Point the emitted prompt at that handoff doc and its plan — e.g. "read `<slug>-handoff.md` first, then its plan."

## If no active plan exists

If `.claude/active-plan` is absent or empty:

- Do **not** write any file.
- Build the prompt entirely from the current session: summarize the work in progress, the relevant files, and key decisions inline, so the new session can continue without a plan doc.

## Gotchas

1. Standalone skill — not a `plan-management` mode. It reads `.claude/active-plan`; it never writes it.
2. Refreshing the handoff doc is an in-place overwrite, not a divergence — no journal append, no `.claude/active-plan` change.
3. No active plan → write nothing to disk; the emitted prompt carries all the context inline.
4. Keep the emitted prompt basic and copy-pasteable, inside one code fence — it is the deliverable the user pastes into the next session.
