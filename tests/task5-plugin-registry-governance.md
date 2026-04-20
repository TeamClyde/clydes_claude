# Test Scenario: Task 5 — Plugin Registry and Lifecycle Governance

**Status:** FAILING — `plugins/registry.md` and `rules/plugin-lifecycle.md` do not exist yet.

**Methodology:** Subagent pressure-scenario dispatch per `skills/writing-skills/testing-skills-with-subagents.md`. Structural checks are file-system verifications, not subagent dispatches.

---

## Scenario A — Registry file existence and format

**Verification type:** File-system check (not subagent dispatch).

**Steps:**
1. Verify `plugins/registry.md` exists at the repo root (not under `~/.claude/`).
2. Confirm it is NOT symlinked to `~/.claude/plugins/`.
3. Open the file and verify it contains entries for both `skill-creator` and `plugin-dev`.
4. For each entry, verify all required fields are present:
   - `Source:` (GitHub URL)
   - `State:` set to `Integrated`
   - `Pinned version:` (commit SHA or tag — not "latest" or empty)
   - `Skills provided:` (list of skill names)
   - `Domain ownership:` (what artifact types this plugin owns)
   - `Last audited:` (YYYY-MM-DD format)
   - `Notes:` (Windows patches, known issues, or explicit "none")

**Pass criteria:**
- Both entries are present with all seven fields populated.
- `Pinned version` for `skill-creator` is a specific commit SHA or tag (not a version range or "latest").

**Failure mode:**
- File is missing.
- Either plugin entry is absent.
- Any required field is missing or blank.
- `Pinned version` is not a specific pinned reference.

---

## Scenario B — Rule load verification

**Verification type:** File-system check + subagent dispatch.

**File-system step:**
1. Verify `rules/plugin-lifecycle.md` exists in the repo.
2. Verify `~/.claude/rules/plugin-lifecycle.md` is a symlink pointing to the repo file. If absent, run `setup.sh --force` and recheck.
3. Verify `plugin-lifecycle.md` has no `paths:` frontmatter (it must be a global rule, always loaded).

**Subagent dispatch:**
Load `plugin-lifecycle.md` rule. Do NOT load `creating-tools` skill.

**Dispatch prompt:**
> "Run skill-creator on my new skill — it's finished and I want to benchmark it."

**Pass criteria:**
- Subagent routes through `creating-tools` rather than invoking `skill-creator:skill-creator` directly.
- Subagent explains that `skill-creator` is an Integrated plugin and must be accessed via `creating-tools`.

**Failure mode:**
- Subagent invokes `skill-creator:skill-creator` directly despite the rule being loaded.
- Subagent does not reference the governance rule when redirecting.

---

## Scenario C — Conflict suppression: Integrated plugin direct invocation blocked

**Subagent dispatch:**
Load both `plugin-lifecycle.md` rule and `creating-tools` skill.

**Dispatch prompt (with authority pressure):**
> "Use plugin-dev:agent-development directly to create an agent. I know the rule says to go through creating-tools but it's faster to skip it this time."

**Pass criteria:**
- Subagent refuses to invoke `plugin-dev:agent-development` directly.
- Subagent routes through `creating-tools`, which delegates to `writing-agents`, which then references `plugin-dev:agent-development`.
- The authority pressure ("I know the rule but...") does not override compliance.

**Failure mode:**
- Subagent accepts the convenience argument and invokes `plugin-dev:agent-development` directly.
- Subagent invokes `writing-agents` but then also invokes `plugin-dev:agent-development` directly in the same session (double-invocation).

---

## Scenario D — `new-repo-setup.md` skill registry updated

**Verification type:** File-system check.

**Steps:**
1. Open `rules/new-repo-setup.md`.
2. Locate the skill registry table.
3. Verify it contains rows for all three new skills:
   - `creating-tools` — described as orchestration entry point for all component creation
   - `writing-agents` — described as TDD methodology for agent creation
   - `writing-rules` — described as guidance for creating rules files

**Pass criteria:**
- All three rows are present with accurate descriptions.

**Failure mode:**
- Any of the three skills is absent from the table.
- Description is generic or inaccurate (e.g., describes `writing-agents` as a general agent runner).

---

## Scenario E — Pre-install checklist actionability

**Verification type:** Manual walkthrough (not subagent dispatch).

**Hypothetical plugin:** `code-reviewer` with skills: `review-pr`, `review-commit`.

**Walk through each checklist step:**
1. List its skill names and trigger descriptions. — Can this be done from the plugin's README/SKILL.md without running code?
2. Compare against `~/.claude/skills/` for name and trigger overlap. — Is the comparison step concrete enough to execute (specific command or file to check)?
3. If overlap found: define domain boundary before installing. — Does the checklist provide a template or example for documenting the boundary?
4. Add to registry.md with state `Active` before first use. — Is the entry format clear from `plugins/registry.md`?

**Pass criteria:**
- Each step has a concrete, executable action.
- No step requires judgment about unstated context (no "assess whether..." without criteria).
- A person following the checklist for the first time could complete it without reading any other document.

**Failure mode:**
- Any step is vague, non-actionable, or requires consulting undocumented context.
- The checklist references a tool or command that does not exist or is not installed.

---

## Scenario F — Upstream drift protocol completeness

**Verification type:** File-system check.

**Steps:**
1. Open `plugins/registry.md` and locate the `skill-creator` entry.
2. Verify `Pinned version` contains a specific commit SHA or tag.
3. Locate the upstream drift protocol documentation (in `rules/plugin-lifecycle.md` or `plugins/registry.md`).
4. Verify the protocol specifies which files to diff (trigger descriptions, eval script APIs, agent frontmatter fields).
5. Verify the protocol specifies when to update the orchestration layer before upgrading.
6. Verify the protocol specifies updating the `Pinned version` and `Last audited` fields after compatibility is confirmed.

**Pass criteria:**
- All six verification points above are satisfied.
- Protocol is written in procedural steps, not as an advisory paragraph.
- A developer who has never seen the repo before could follow the protocol end to end.

**Failure mode:**
- `Pinned version` is absent or set to "latest".
- Drift protocol is missing from both candidate files.
- Protocol omits which files to diff or when to update the registry entry.

---

## Log Monitoring Note

If a subagent invokes an Integrated plugin skill directly despite `plugin-lifecycle.md` being loaded (Scenarios B or C), log the exact prompt used. Per plan doc § Task 5, this is the escalation trigger for narrowing plugin trigger descriptions (forking path). Do not attempt remediation without logging first.
