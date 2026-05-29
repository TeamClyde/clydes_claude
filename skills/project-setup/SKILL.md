---
name: project-setup
description: Use when onboarding a repo to the Claude workflow for the first time — no project.json exists, CLAUDE.md is missing or generic, or the codebase graph hasn't been generated. Configures Jira integration, testing setup, and workflow preferences.
argument-hint: "(no arguments needed — interactive)"
allowed-tools: Read, Write, Edit, Bash, Glob
---

# project-setup

Initialize a repo for the Claude workflow. Generates `project.json` and optionally runs codebase init skills.

**Announce at start:** "I'm using the project-setup skill to initialize this project."

---

## Symlink Architecture (workflow repo only)

> This repo IS `~/.claude/` for workflow files. Symlinks mean editing any file here is immediately live — there is no sync step for edits to existing files. `setup.sh --force` is only needed when **adding new files** (to create new symlinks). Edit in this repo; Claude Code picks it up instantly.

---

## Phase 1 — Codebase Init

Ask the user which init skills to run. Skip any whose output already exists.

| Skill | Output | Skip condition |
|-------|--------|----------------|
| `init` | `CLAUDE.md` | CLAUDE.md exists at repo root |
| `e2e-init` | e2e test scaffolding | ask user if they want this |
| `infra-init` | codebase knowledge graph | ask user if they want this |

Run selected skills one at a time. Wait for each to complete before proceeding.

---

## Phase 1.5 — Doc Scaffolding

Runs after Phase 1, before Phase 2. All steps are idempotent — every action skips if the target already exists.

1. **Read `project.json` `domain:` field.** If missing, fall through; Phase 2 Q10 will populate. Continue with Steps 2-6 regardless.

2. **Create Diátaxis quadrant directories** (skip if already exist):
   - `docs/tutorials/`
   - `docs/how-to/`
   - `docs/reference/`
   - `docs/explanation/adr/`

3. **Seed `docs/manifest.md`** from `templates/manifest/<domain>.md` based on `project.json` `domain:` field.
   - **Fallback logic:** if `templates/manifest/<domain>.md` does not exist (custom or unknown domain), seed from `templates/manifest/_default.md` instead and report to user: "No seed template found for domain '<domain>' — seeded from generic baseline. Consider creating `templates/manifest/<domain>.md` in the workflow-improvements repo to teach the system about this domain."
   - Skip the seed entirely if `docs/manifest.md` already exists.

4. **Scaffold root-level docs** (each skip if target exists):
   - `README.md` ← `templates/README.md`
   - `CHANGELOG.md` ← `templates/CHANGELOG.md`
   - `cliff.toml` ← `templates/cliff.toml`, with substitution:
     - If `project.json` has `jira.enabled: true`: use sed (or Edit tool) to replace `{{JIRA_URL_BASE}}` with `https://<jira.workspace>` derived from project.json, then remove the `# JIRA_LINK_BLOCK_START` and `# JIRA_LINK_BLOCK_END` sentinel comment lines.
     - If `jira.enabled: false` (or missing): use sed (or Edit tool) to delete every line between `# JIRA_LINK_BLOCK_START` and `# JIRA_LINK_BLOCK_END` inclusive (the entire `commit_preprocessors` block).

5. **Scaffold ADR-zero into the Diátaxis path:**
   - `docs/explanation/adr/README.md` ← `templates/adr/README.md`
   - `docs/explanation/adr/template.md` ← `templates/adr/template.md`
   - `docs/explanation/adr/0000-record-architecture-decisions.md` ← `templates/adr/0000-record-architecture-decisions.md`

6. **Report to user:** list each file/dir created (skipped items get an INFO note, not a warning).

7. **Hybrid Explanation layout scaffold (added):**

   1. Create directory `docs/explanation/features/` (empty; populated as work touches each feature). Skip if exists.

   2. Copy `templates/architecture.md` → `docs/explanation/architecture.md`. Skip if `architecture.md` exists.
      - The template's `<repo-name>` placeholder should be replaced with the value from `project.json` `project.name`.
      - The `**Last updated:**` placeholder should be replaced with today's date.

   3. Confirm `docs/explanation/adr/` exists (should already be created by the existing ADR-zero copy step in Phase 1.5 step 5). If missing for any reason, create it.

   All new copies are skip-if-exists per the Phase 1.5 idempotency contract — `project-setup` is re-runnable safely.

**Edge case:** if the workflow-repo templates dir is unreachable (broken symlink, fresh setup), fail loud with: "Templates not found at `templates/manifest/<domain>.md` or `templates/manifest/_default.md`. Ensure setup.sh has been run on this machine."

---

## Phase 2 — Interactive Questionnaire

Ask these questions one at a time. Record answers for Phase 3.

1. **Jira** — Does this project use Jira? (yes/no)
   - If yes: What is the Jira project key? (e.g. `PROJ`)
   - If yes: What is the default issue type? (default: `Task`)

2. **Git** — What is the main branch name? (default: `main`)

3. **Git** — Require Jira key in commit messages? (default: yes if Jira enabled, no otherwise)

4. **Workflow** — Enable architect review before execution? (default: yes)

5. **Workflow** — Enable TDD for this repo? (default: yes — set to no for config/infra/markdown-only repos)

6. **Workflow** — Enable plan-gate? (default: yes)

7. **Testing** — What command runs the test suite? (e.g. `npm test`, `pytest`, `go test ./...`) — skip if not applicable, enter `none`

8. **Orientation** — Is there a CODEBASE.md or equivalent orientation file? If yes, what is its path?

9. **Confluence Push Configuration (optional)** — Does the user want to push selected doc artifacts to Confluence?
   - If yes: Confluence base URL (e.g., `https://yourorg.atlassian.net/wiki`), default parent page or space key.
   - Write to `project.json` `confluence:` block:
     ```json
     "confluence": {
       "enabled": true,
       "base_url": "https://yourorg.atlassian.net/wiki",
       "parent_page": "Claude Docs"
     }
     ```
   - If user declines, set `confluence.enabled: false` and skip the URL/parent prompts.

10. **Repo Domain** — Which domain best describes this repo? Suggest these common values (the initial seed registry):
    - `software-eng` — backend services, APIs, CLI tools
    - `firmware` — embedded / hardware-adjacent
    - `mobile` — iOS / Android app
    - `python-utility` — standalone Python scripts or utility packages
    - `ml` — machine learning training / inference code

    **Accept any free-text value** (not restricted to the list above). Write the answer to `project.json` `domain:` field. If user already has a domain set from Phase 1.5, confirm rather than re-prompt.

    The domain registry is **open by design** — new domains are added by creating `templates/manifest/<new-domain>.md` files, not by code changes. If the user provides a custom domain not in the initial seed list, Phase 1.5 will fall back to `templates/manifest/_default.md` and report that fallback (see Phase 1.5 step 3 fallback logic).

    **Phase 1.5 re-run clause:** if Phase 1.5 ran without a domain (manifest not yet seeded because `domain:` was missing at the time), repeat Phase 1.5 steps 2 through 6 immediately after writing Q10's answer to `project.json` — these are idempotent; re-running only seeds `docs/manifest.md` (which was the only step skipped on the prior pass). Do not re-run step 1 since the domain is now populated.

---

## Phase 3 — Write project.json

Construct `project.json` at the repo root from the questionnaire answers. Omit sections for features that are off or not applicable — keep the file lean.

Example for a full-featured repo:

```json
{
  "project": {
    "name": "my-service",
    "description": "Short description for ticket generation"
  },
  "jira": {
    "enabled": true,
    "project": "PROJ",
    "default-issue-type": "Task"
  },
  "git": {
    "main-branch": "main",
    "require-jira-key-in-commits": true
  },
  "workflow": {
    "architect-review": true,
    "tdd": true,
    "plan-gate": true
  },
  "testing": {
    "command": "npm test"
  },
  "codebase-entry": "CODEBASE.md"
}
```

Example for a scripts/utilities repo (minimal):

```json
{
  "project": {
    "name": "my-scripts"
  },
  "jira": {
    "enabled": false
  },
  "workflow": {
    "tdd": false
  }
}
```

After writing, validate:
```bash
python -m json.tool project.json
```

---

## Phase 4 — Symlink Health Check (workflow repo only)

Detect the workflow repo: check for all three of `setup.sh`, `skills/`, and `agents/` at the repo root. If all three are present, run:

```bash
bash scripts/setup.sh --check
```

If `--check` is not supported by setup.sh, run:

```bash
bash scripts/setup.sh --force
```

Report any symlinks that were created or repaired.

---

## Notes

- Running project-setup on a repo that already has `project.json` will overwrite it after confirmation.
- project.json is intentionally minimal — only include sections for features you are using.
- The `codebase-entry` file should be the human/AI-readable orientation summary (50–200 lines), NOT the code graph output from infra-init.

## Gotchas

1. Run setup.sh before running this skill — symlinks must be in place first.
2. Fill every placeholder in the generated CLAUDE.md before starting work — a half-filled template misleads future sessions.
3. Do not run infra-init until the repo has actual code to graph — running it on an empty repo produces a useless graph.
