# close-subplan mode — Full Step Sequence

This file documents the `close-subplan` mode of the `plan-management` skill. See `SKILL.md` for the skill purpose, inputs, and the other modes (`created`, `in_progress`, `completed`, `backlog`, `reconcile`, `divergence`, `spawn-subplan`).

## `close-subplan` — Roll up a completed sub-plan to the top-level

**Rationale:** This is the load-bearing forcing function for preventing knowledge loss when a sub-plan closes. Without structured closeout content, learnings are stranded in the sub-plan's plan file or transient session memory and never surface to the parent. This mode refuses to close without the required content.

### Required Inputs (Mandatory — Refuses Without Them)

The caller must provide all three closeout fields before this mode proceeds:

| Field | Description |
|-------|-------------|
| `closeout-summary` | 1-paragraph summary of what the sub-plan accomplished |
| `closeout-decisions` | Key decisions made during sub-plan execution (rolls up D-style decisions to top history) |
| `closeout-gotchas` | Gotchas and lessons worth preserving (rolls up "what broke" content) |

If any of the three fields is missing or empty: **refuse to close.** Surface the missing fields to the caller and wait. Do not proceed.

**Closeout-gotchas declined-doc warning:** If `closeout-gotchas` references a doc that wasn't synthesized (because the user declined the doc-author draft for it during the Feature-Doc Synthesis Pass), emit a WARNING (not a hard block) before completing — the user may want to revisit the declined doc.

### Top-Level vs. Sub-Plan Detection

Before executing, determine whether the plan being closed is a sub-plan or the top-level plan using the **walk-up algorithm defined in the Active-Plan Marker section** of `SKILL.md`:

- If the walk-up finds a parent `*-plan.md`: this is a sub-plan. Execute the **sub-plan close path** below with that file as the parent.
- If the walk-up terminates without finding a parent `*-plan.md` (i.e., the closing plan IS the top-level): execute the **terminal-state path** below.

Use the canonical algorithm — do not duplicate or restate the walk-up logic here.

### Sub-Plan Close Path

1. Read the child `<child-slug>-plan.md`. Scan the Task Reference table.
2. **Verify all tasks are ✅.** If any row is not checked, refuse to close. Surface the incomplete tasks to the caller and stop.
3. **Check required closeout content.** If `closeout-summary`, `closeout-decisions`, or `closeout-gotchas` are missing: refuse to close.
4. Identify the top-level plan (via walk-up algorithm). Resolve `<top>-journal.md`, `<top>-plan.md`, and `<top>-handoff.md`.
5. **Idempotency check — journal:** Read `<top>-journal.md`. If a closeout entry for `<child-slug>` already exists (header: `## YYYY-MM-DD — Closed sub-plan <child-slug>`), skip journal append.
6. If no matching entry: append a closeout journal entry to `<top>-journal.md`:
   ```markdown
   ## YYYY-MM-DD — Closed sub-plan <child-slug> [subplan-close]

   **Summary:** <closeout-summary>

   **Key decisions:**
   <closeout-decisions>

   **Gotchas and lessons:**
   <closeout-gotchas>

   **Full task detail:** plans/<parent-slug>/<child-slug>/<child-slug>-plan.md
   ```
7. **Idempotency check — parent task:** Read `<top>-plan.md`. Find the Task Reference row corresponding to this sub-plan. If it is already ✅, skip.
8. If not ✅: mark the corresponding parent task row ✅ in `<top>-plan.md`.
9. **Idempotency check — handoff:** Read `<top>-handoff.md`. If `Active sub-plan:` line is already removed and `Active task:` already reflects the next parent task, skip.
10. If not updated: refresh `<top>-handoff.md`:
    - Remove the `Active sub-plan: <child-slug>` line.
    - Advance `Active task:` to the next unchecked row in the parent Task Reference table.
    - Bump `Last Updated:` to today's date.
11. **Idempotency check — active-plan marker:** Read `.claude/active-plan`. If it already points at the parent plan, skip.
12. If not reverted: write `.claude/active-plan` with the parent plan path.
13. **ADR Promotion Scan (reworked):** Read the top-level `<top>-journal.md` from this sub-plan's spawn entry to the just-written closeout entry. Scan for entries tagged `[adr-candidate]`.

    **Look up parent doc:** Read the originating plan's `<slug>-design.md` `## Docs Affected` section. For each `[adr-candidate]` entry, match its decision summary to a parent doc path declared in Docs Affected.

    **Per `[adr-candidate]` entry:**

    - **If parent found in Docs Affected:** Use that path as the value to populate the ADR's `## Related` heading section (as `Parent: <path>`).
    - **If no parent found (orphan):** HARD BLOCK. Prompt user with 4 options:
      - `(1) Pick existing` — list existing `docs/explanation/features/*.md` + `docs/explanation/architecture.md`; user picks one as the parent.
      - `(2) Declare new feature-doc` — prompt for slug + path; dynamically amend Docs Affected with `- <path> — NEW — <decision summary>` (Phase C synthesis pass will create the doc); log a `[divergence]` journal entry recording the amendment. The amendment is written immediately to the design.md file. The Feature-Doc Synthesis Pass reads `## Docs Affected` after the ADR Promotion Scan loop exits, so this entry will be present when the synthesis pass begins.
      - `(3) Defer` — `[adr-candidate]` tag stays in journal; not promoted this close. Future close-subplan may revisit.
      - `(4) Decline` — replace tag with `[adr-declined]`; not promoted; won't re-prompt in future closes.

      Cannot promote without a confirmed parent path. No `Related: none` escape.

    - **Show the journal entry summary to the user.**
    - **Ask: "Promote to formal ADR? (yes/no/defer)"**
    - **If yes:** Invoke `architecture-decision-records` skill with the journal entry + parent path as input → drafts `docs/explanation/adr/NNNN-<title>.md`. After the `architecture-decision-records` skill returns, `plan-management` post-processes the draft to ensure the `## Related` heading section contains the correct `Parent:` line. Four cases: (a) `## Related` is absent — insert it with `Parent: <parent-path>` as the first entry; (b) `## Related` is present but contains no `Parent:` line — prepend `Parent: <parent-path>`; (c) `## Related` contains a `None` placeholder — replace the placeholder with `Parent: <parent-path>`; (d) `## Related` already has a `Parent:` line (e.g., from a partial prior run) — leave it unchanged, do not duplicate. (The `architecture-decision-records` skill produces a draft using its own heading-section structure; `plan-management` is responsible for inserting/updating the `## Related` section per `templates/adr/template.md` convention — see `rules/doc-tools.md` "Where the Heavy Detail Lives" → `skills/doc-author/SKILL.md`.)
    - **If defer:** Leave entry in journal (user can `/docs-refresh adr` later).
    - **If no:** Mark the entry as declined in the journal (append `[adr-declined]` tag).

    After ADR Promotion Scan completes, hold the list of accepted ADR paths in working context for the next step (Phase C).

    **Idempotent:** re-running `close-subplan` after partial ADR promotion (user accepted some, deferred others) only re-prompts on the deferred entries — accepted ones already have ADR files; declined ones are tagged `[adr-declined]`; both are filtered out on re-scan.

14. **Feature-Doc Synthesis Pass (NEW):** Read the originating plan's `<slug>-design.md` `## Docs Affected` section.

    If Docs Affected is "None — no doc updates needed": skip this step entirely. The handoff was refreshed earlier in steps 9-10; the mode completes.

    **Missing-section semantics:** If the originating plan's `<slug>-design.md` does NOT contain a `## Docs Affected` section (e.g., plan was created before brainstorming Step 10.5 lands), treat this as equivalent to `## Docs Affected: None` and skip this entire step. No orphan-prompt fires for missing sections — only for orphan `[adr-candidate]` tags that lack a parent within an EXISTING `## Docs Affected` section.

    Otherwise, for each entry in Docs Affected (serial — one doc at a time):

    1. **Compute mode:**
       - Entry marked `NEW` and target file does not exist → `mode=create`.
       - Entry marked `UPDATE` and target file exists → `mode=update`.
       - Entry has no synthesis work (only an ADR backlink to attach, no other change) → `mode=backlink-only`.

    2. **Compute accepted-adrs subset:** Filter the just-accepted ADR list to only those whose `## Related` section contains a `Parent:` line equal to this target's path.

    3. **Invoke `doc-author` skill:**
       ```
       Skill { skill: "doc-author", args: "
         target: <entry path>
         mode: <computed mode>
         context-source: journal
         accepted-adrs: <filtered subset>
         plan-doc: <originating plan path>
       " }
       ```

    4. **Surface the proposed file (or diff) to the user:** prompt `accept / edit / decline`.
       - **On accept:** invoke `git-manager` to commit the change.
       - **On decline:** discard; mark this entry as pending in the top-level handoff under "Open Gotchas".
       - **On edit:** open the file in the editor; await user; then re-prompt `accept / decline`.

    5. **Proceed to the next Docs Affected entry.** Serial — never parallel.

    After all entries processed: list of committed doc updates + list of pending (declined/edited-incomplete) items, both summarized in the next step's handoff refresh.

### Terminal-State Path (Top-Level Plan Completion)

Triggered when `close-subplan` is invoked on the top-level plan (no parent `*-plan.md` found by walk-up):

1. Read `<top>-plan.md`. Verify all Task Reference rows are ✅. If any are incomplete, refuse and surface them.
2. **Check required closeout content** (`closeout-summary`, `closeout-decisions`, `closeout-gotchas`). Refuse if missing.
3. **Idempotency check — journal:** Read `<top>-journal.md`. If a final completion entry already exists (header: `## YYYY-MM-DD — Plan complete`), skip journal append.
4. If no completion entry: append a final journal entry to `<top>-journal.md`:
   ```markdown
   ## YYYY-MM-DD — Plan complete [subplan-close]

   **Summary:** <closeout-summary>

   **Key decisions:**
   <closeout-decisions>

   **Gotchas and lessons:**
   <closeout-gotchas>
   ```
5. **Idempotency check — handoff terminal state:** Read `<top>-handoff.md`. If `Status:` already reads "All tasks complete; awaiting closeout", skip.
6. If not terminal: update `<top>-handoff.md` — set status line to "All tasks complete; awaiting closeout" and bump `Last Updated:`.
7. **Idempotency check — active-plan marker:** Check whether `.claude/active-plan` still exists.
8. If it exists: **delete** `.claude/active-plan` (do not empty — delete the file). Subsequent SessionStart hooks see no active-plan and exit silently.
9. **ADR Promotion Scan (reworked):** Read the full `<top>-journal.md` from plan start to this final completion entry. Scan for entries tagged `[adr-candidate]`.

    **Look up parent doc:** Read the top-level plan's `<top>-design.md` `## Docs Affected` section. For each `[adr-candidate]` entry, match its decision summary to a parent doc path declared in Docs Affected.

    **Per `[adr-candidate]` entry:**

    - **If parent found in Docs Affected:** Use that path as the value to populate the ADR's `## Related` heading section (as `Parent: <path>`).
    - **If no parent found (orphan):** HARD BLOCK. Prompt user with 4 options:
      - `(1) Pick existing` — list existing `docs/explanation/features/*.md` + `docs/explanation/architecture.md`; user picks one as the parent.
      - `(2) Declare new feature-doc` — prompt for slug + path; dynamically amend Docs Affected with `- <path> — NEW — <decision summary>` (Feature-Doc Synthesis Pass will create the doc); log a `[divergence]` journal entry recording the amendment. The amendment is written immediately to the design.md file. The Feature-Doc Synthesis Pass reads `## Docs Affected` after the ADR Promotion Scan loop exits, so this entry will be present when the synthesis pass begins.
      - `(3) Defer` — `[adr-candidate]` tag stays in journal; not promoted this close. Future close-subplan may revisit.
      - `(4) Decline` — replace tag with `[adr-declined]`; not promoted; won't re-prompt in future closes.

      Cannot promote without a confirmed parent path. No `Related: none` escape.

    - **Show the journal entry summary to the user.**
    - **Ask: "Promote to formal ADR? (yes/no/defer)"**
    - **If yes:** Invoke `architecture-decision-records` skill with the journal entry + parent path as input → drafts `docs/explanation/adr/NNNN-<title>.md` with next-available ADR number. After the `architecture-decision-records` skill returns, `plan-management` post-processes the draft to ensure the `## Related` heading section contains the correct `Parent:` line. Four cases: (a) `## Related` is absent — insert it with `Parent: <parent-path>` as the first entry; (b) `## Related` is present but contains no `Parent:` line — prepend `Parent: <parent-path>`; (c) `## Related` contains a `None` placeholder — replace the placeholder with `Parent: <parent-path>`; (d) `## Related` already has a `Parent:` line (e.g., from a partial prior run) — leave it unchanged, do not duplicate. (The `architecture-decision-records` skill produces a draft using its own heading-section structure; `plan-management` is responsible for inserting/updating the `## Related` section per `templates/adr/template.md` convention — see `rules/doc-tools.md` "Where the Heavy Detail Lives" → `skills/doc-author/SKILL.md`.)
    - **If defer:** Leave entry in journal (user can `/docs-refresh adr` later).
    - **If no:** Mark the entry as declined in the journal (append `[adr-declined]` tag).

    After ADR Promotion Scan completes, hold the list of accepted ADR paths in working context for the next step (Feature-Doc Synthesis Pass).

    **Idempotent:** re-running `close-subplan` after partial ADR promotion (user accepted some, deferred others) only re-prompts on the deferred entries — accepted ones already have ADR files; declined ones are tagged `[adr-declined]`; both are filtered out on re-scan.

10. **Feature-Doc Synthesis Pass (NEW):** Read the top-level plan's `<top>-design.md` `## Docs Affected` section.

    If Docs Affected is "None — no doc updates needed": skip this step entirely. Proceed to step 11 (report to caller).

    **Missing-section semantics:** If the top-level plan's `<top>-design.md` does NOT contain a `## Docs Affected` section (e.g., plan was created before brainstorming Step 10.5 lands), treat this as equivalent to `## Docs Affected: None` and skip this entire step. No orphan-prompt fires for missing sections — only for orphan `[adr-candidate]` tags that lack a parent within an EXISTING `## Docs Affected` section.

    Otherwise, for each entry in Docs Affected (serial — one doc at a time):

    1. **Compute mode:**
       - Entry marked `NEW` and target file does not exist → `mode=create`.
       - Entry marked `UPDATE` and target file exists → `mode=update`.
       - Entry has no synthesis work (only an ADR backlink to attach, no other change) → `mode=backlink-only`.

    2. **Compute accepted-adrs subset:** Filter the just-accepted ADR list to only those whose `## Related` section contains a `Parent:` line equal to this target's path.

    3. **Invoke `doc-author` skill:**
       ```
       Skill { skill: "doc-author", args: "
         target: <entry path>
         mode: <computed mode>
         context-source: journal
         accepted-adrs: <filtered subset>
         plan-doc: <top-level plan path>
       " }
       ```

    4. **Surface the proposed file (or diff) to the user:** prompt `accept / edit / decline`.
       - **On accept:** invoke `git-manager` to commit the change.
       - **On decline:** discard; mark this entry as pending in the top-level handoff under "Open Gotchas".
       - **On edit:** open the file in the editor; await user; then re-prompt `accept / decline`.

    5. **Proceed to the next Docs Affected entry.** Serial — never parallel.

    After all entries processed: list of committed doc updates + list of pending (declined/edited-incomplete) items, both summarized in the report to caller.

11. Report to the caller: plan tree is complete, active-plan marker cleared, `finishing-a-development-branch` flow should now be invoked. If any ADR drafts were created in Step 9, list their paths in the report. If any docs were synthesized or declined in Step 10, list those too.
