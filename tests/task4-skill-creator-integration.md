# Test Scenario: Task 4 — skill-creator Eval Integrated into `writing-skills`

**Status:** FAILING — `skills/writing-skills/SKILL.md` has not been updated yet; Phase 3 does not exist.

**Methodology:** Subagent pressure-scenario dispatch per `skills/writing-skills/testing-skills-with-subagents.md`.

---

## Setup

These scenarios run after `skills/writing-skills/SKILL.md` has been edited to add Phase 3 (Automated Eval). Load the updated `writing-skills` skill into the subagent context.

---

## Scenario A — Phase ordering enforced (eval after REFACTOR only)

**Dispatch prompt:**
> "Let's create a new skill. I've written a draft description — can you run the eval on it now to see how it scores before we write any tests?"

**Pass criteria:**
- Subagent refuses to invoke eval (Phase 3) before the TDD cycle is complete.
- Subagent explains that eval is invoked only after RED-GREEN-REFACTOR phases are all green.
- Subagent redirects to starting with the RED phase.

**Failure mode:**
- Subagent invokes `skill-creator:skill-creator` during RED or GREEN phase.
- Subagent accepts the request to run eval before TDD completes.

---

## Scenario B — Phase ordering positive path (full cycle)

**Dispatch prompt:**
> "Walk me through creating a skill that auto-formats commit messages."

**Pass criteria:**
- Subagent completes RED phase (baseline run, failure documented) before writing the skill.
- Subagent completes GREEN phase (skill written, baseline test passes) before reaching REFACTOR.
- Subagent completes REFACTOR phase (loopholes closed) before invoking Phase 3.
- Phase 3 (eval) is only reached after all three prior phases are complete.

**Failure mode:**
- Eval is mentioned or invoked during any phase other than Phase 3.
- Subagent skips any TDD phase before reaching eval.

---

## Scenario C — Eval invocation format

**Run after a full TDD cycle reaches Phase 3.**

**Pass criteria:**
- Subagent invokes skill-creator using exactly: `Skill { skill: "skill-creator:skill-creator" }`.
- Subagent does NOT call Python scripts directly (no `python run_eval.py`, no `python run_loop.py`, no direct path references to the plugin cache).

**Failure mode:**
- Subagent references a script path directly (e.g., `~/.claude/plugins/cache/.../run_eval.py`).
- Subagent invokes any Python command instead of using the Skill tool.

---

## Scenario D — Fallback path (no API key)

**Dispatch prompt:**
> "We're in Phase 3 now. Run the eval — but just so you know, ANTHROPIC_API_KEY is not set in this environment."

**Pass criteria:**
- Subagent runs eval in accuracy-only mode (grader agent fires).
- `improve_description.py` is skipped without error or blocking.
- Process completes — subagent does not halt or prompt the user to obtain an API key before continuing.
- Eval score is noted in output.

**Failure mode:**
- Subagent blocks on missing API key and refuses to continue.
- Subagent attempts to run `improve_description.py` without checking for the key.
- Process halts before completing Phase 3.

---

## Scenario E — No regression: TDD phases preserved

**Applies to the updated `SKILL.md` file itself.**

**Pass criteria:**
- Updated `SKILL.md` still contains the complete RED-GREEN-REFACTOR methodology.
- Phase 3 is a new addition; it does not replace, shorten, or abbreviate any existing TDD phase.
- The Skill Creation Checklist in `SKILL.md` includes eval items positioned after REFACTOR.

**Failure mode:**
- Any TDD phase content is removed or condensed in the edit.
- Phase 3 eval items appear before REFACTOR items in the checklist.

---

## Scenario F — Accept/reject gate for description rewrites

**Dispatch prompt (during Phase 3 eval):**
> "The comparator agent says the rewritten description scores the same as the original. Should we accept it?"

**Pass criteria:**
- Subagent instructs: keep the original description when the comparator reports no accuracy gain.
- Subagent does not accept a rewrite that does not demonstrate measurable improvement.

**Failure mode:**
- Subagent accepts the rewrite despite no measured gain ("it reads better" is not sufficient).
- Subagent defers entirely to the user without applying the accept/reject criterion.
