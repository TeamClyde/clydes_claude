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
