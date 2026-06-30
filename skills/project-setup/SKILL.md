---
name: project-setup
description: Use when onboarding a repo to the Claude workflow for the first time — no project.json exists, CLAUDE.md is missing or generic, or the codebase graph hasn't been generated. Configures Jira integration, testing setup, and workflow preferences.
argument-hint: "(no arguments needed — interactive)"
allowed-tools: Read, Write, Edit, Bash, Glob, Skill
---

# project-setup

Initialize a repo for the Claude workflow. Generates `project.json` and optionally runs codebase init skills.

**Announce at start:** "I'm using the project-setup skill to initialize this project."

---

## Symlink Architecture (workflow repo only)

> This repo IS `~/.claude/` for workflow files. Symlinks mean editing any file here is immediately live — there is no sync step for edits to existing files. `setup.sh --force` is only needed when **adding new files** (to create new symlinks). Edit in this repo; Claude Code picks it up instantly.

---

## Pre-flight — Root Detect and Warn

Before Phase 1, resolve the git root and check for stray config above it.

```bash
git rev-parse --show-toplevel
```

Store the result as `<gitroot>`. Then do a bounded walk-up of at most 2 parent directories above `<gitroot>`, checking each for the presence of `CLAUDE.md` or a `.claude/` directory. If found at any level above the git root:

- Surface immediately: "Git root is `<gitroot>`; found existing config (`CLAUDE.md` | `.claude/`) at `<path>`, one level up, outside the git repo. Onboarding will operate at the git root and will NOT read the outer files; this avoids creating a duplicate. Proceed at the git root? (yes / adjust)"
- State explicitly: "The git root is authoritative for all writes during this onboarding session."
- **Do not auto-resolve.** Wait for the user's answer before continuing.

If no stray config is found above the git root, proceed silently to Phase 1.

---

## Phase 1 — Codebase Init

Ask the user which init skills to run. Skip any whose output already exists.

| Skill | Output | Skip condition |
|-------|--------|----------------|
| `init` | `CLAUDE.md` | CLAUDE.md exists at repo root |
| `infra-init` | codebase knowledge graph (`.claude-init/CODEBASE.md`) | ask user if they want this |
| `e2e-init` | e2e test scaffolding | ask user if they want this |

Run selected skills one at a time, **in this order** — `infra-init` before `e2e-init`, because e2e-init uses `.claude-init/CODEBASE.md` (an infra-init output) as its primary structure source and falls back to slower globbing when it is absent. Wait for each to complete before proceeding.

---

## Phase 2 — Interactive Questionnaire

Ask these questions one at a time. Record answers for Phase 3.

1. **Jira** — Does this project use Jira? (yes/no)
   - If yes: What is the Jira project key? (e.g. `PROJ`)
   - If yes: What is the default issue type? (default: `Task`)
   - If yes: What is your Atlassian workspace host? (e.g. `yourorg.atlassian.net`)

2. **Git** — What is the main branch name? (default: `main`)

3. **Git** — Require Jira key in commit messages? (default: yes if Jira enabled, no otherwise)

3b. **Git** — PR backend? Auto-detected from `git remote get-url origin` if you skip this — only set it explicitly for enterprise hosts (e.g. `github.mycompany.com`, self-hosted Bitbucket Data Center). Options: `github` | `bitbucket` | `manual`. Omit the field unless the auto-detection would get it wrong.

3c. **Git** — PR size posture? Heuristic: brand-new / empty repo → `new`; existing codebase with history → `ongoing`. See `rules/delivery-cadence.md` for the full policy (thresholds, slicing patterns, cadence semantics). Propose the detected value and ask the user to confirm — never silently write. On confirm, write `git.pr-sizing.posture` to `project.json`.

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

    **Accept any free-text value** (not restricted to the list above). Write the answer to `project.json` `domain:` field. If `project.json` already has a `domain` (re-run), confirm rather than re-prompt.

    The domain registry is **open by design** — new domains are added by creating `~/.claude/templates/manifest/<new-domain>.md` files, not by code changes. If the user provides a custom domain not in the initial seed list, Phase 1.5 will fall back to `~/.claude/templates/manifest/_default.md` and report that fallback (see Phase 1.5 step 3 fallback logic).

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
    "default-issue-type": "Task",
    "workspace": "yourorg.atlassian.net"
  },
  "git": {
    "main-branch": "main",
    "require-jira-key-in-commits": true,
    "backend": "github"
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

### git config fields

The `git` block supports these optional fields beyond `main-branch`, `require-jira-key-in-commits`, and `backend`:

**`git.merge-strategy`** — a map of branch-pattern → merge strategy. Consumed by `git-manager finish` to resolve the intended merge strategy for the PR's target branch before opening the PR. Enforcement is always host-side (branch-protection rules or repository merge settings).

```jsonc
"git": { "merge-strategy": { "main": "squash", "release/*": "merge-commit", "prod": "merge-commit" } }
```

Valid values: `"squash"` | `"merge-commit"` | `"rebase"`.

Matching is glob-based and order-independent:
- Exact branch name beats any wildcard.
- Among wildcards, the longest (most-specific) pattern wins.
- Default when the map is absent or no pattern matches: `squash`.

Omit this field if the repo uses a single uniform strategy — the `squash` default covers the common case.

**`git.pr-sizing`** — PR size guidance thresholds and enforcement posture. Consumed by `git-manager` and `plan-gate` to surface soft warnings or escalation markers when PRs exceed size targets. See `rules/delivery-cadence.md` for the full policy (thresholds, slicing patterns, cadence semantics).

```jsonc
"git": { "pr-sizing": { "posture": "new" | "ongoing", "target-loc": 200, "ceiling-loc": 400 } }
```

- `posture: "new"` — sizing conventions applied from the start; every PR expected to fit thresholds.
- `posture: "ongoing"` — advisory ratchet; thresholds inform but never block.
- `target-loc` / `ceiling-loc` — default to `200` / `400` if omitted.
- **Absent `git.pr-sizing` entirely** — advisory-only behavior; no plan-gate escalation surfacing, but git-time size soft-warn remains available at defaults (200/400).

Omit this field to accept advisory-only behavior with default thresholds.

---

## Phase 1.5 — Doc Scaffolding

> **Execution order note:** Despite its "1.5" label (a stable cross-reference anchor — do not rename), this section executes after Phase 3 so that `project.json` is guaranteed to exist when doc scaffolding runs.

Runs after Phase 3, before Phase 4. All steps are idempotent — every action skips if the target already exists.

1. **Read `project.json` `domain:` field.** It is now always present (written in Phase 3). Use it directly.

2. **Create Diátaxis quadrant directories** (skip if already exist):
   - `docs/tutorials/`
   - `docs/how-to/`
   - `docs/reference/`
   - `docs/explanation/adr/`

3. **Seed `docs/manifest.md`** from `~/.claude/templates/manifest/<domain>.md` based on `project.json` `domain:` field.
   - **Fallback logic:** if `~/.claude/templates/manifest/<domain>.md` does not exist (custom or unknown domain), seed from `~/.claude/templates/manifest/_default.md` instead and report to user: "No seed template found for domain '<domain>' — seeded from generic baseline. Consider creating `~/.claude/templates/manifest/<domain>.md` in the workflow-improvements repo to teach the system about this domain."
   - Skip the seed entirely if `docs/manifest.md` already exists.

4. **Scaffold root-level docs** (each skip if target exists):
   - `README.md` ← `~/.claude/templates/README.md` — **check case-insensitively** before creating: look for any existing variant (`readme.md`, `Readme.md`, `README.MD`, etc.) so a case-sensitive filesystem (Linux/CI) does not create a duplicate beside an existing variant.
   - `CHANGELOG.md` ← `~/.claude/templates/CHANGELOG.md` — **check case-insensitively** before creating: look for any existing variant (`changelog.md`, `ChangeLog.md`, `CHANGELOG.MD`, etc.) so a case-sensitive filesystem (Linux/CI) does not create a duplicate beside an existing lowercase variant.
   - `cliff.toml` ← `~/.claude/templates/cliff.toml`, with substitution:
     - If `project.json` has `jira.enabled: true`: use sed (or Edit tool) to replace `{{JIRA_URL_BASE}}` with `https://<jira.workspace>` (read `jira.workspace` directly from the just-written `project.json`), then remove the `# JIRA_LINK_BLOCK_START` and `# JIRA_LINK_BLOCK_END` sentinel comment lines.
     - If `jira.enabled: false` (or missing): use sed (or Edit tool) to delete every line between `# JIRA_LINK_BLOCK_START` and `# JIRA_LINK_BLOCK_END` inclusive (the entire `commit_preprocessors` block).

5. **Scaffold ADR-zero into the Diátaxis path:**
   - `docs/explanation/adr/README.md` ← `~/.claude/templates/adr/README.md`
   - `docs/explanation/adr/template.md` ← `~/.claude/templates/adr/template.md`
   - `docs/explanation/adr/0000-record-architecture-decisions.md` ← `~/.claude/templates/adr/0000-record-architecture-decisions.md`

6. **Report to user:** list each file/dir created (skipped items get an INFO note, not a warning).

7. **Hybrid Explanation layout scaffold (added):**

   1. Create directory `docs/explanation/features/` (empty; populated as work touches each feature). Skip if exists.

   2. Copy `~/.claude/templates/architecture.md` → `docs/explanation/architecture.md`. Skip if `architecture.md` exists.
      - The template's `<repo-name>` placeholder should be replaced with the value from `project.json` `project.name`.
      - The `**Last updated:**` placeholder should be replaced with today's date.

   3. Confirm `docs/explanation/adr/` exists (should already be created by the existing ADR-zero copy step in Phase 1.5 step 5). If missing for any reason, create it.

   All new copies are skip-if-exists per the Phase 1.5 idempotency contract — `project-setup` is re-runnable safely.

**Edge case:** if the workflow-repo templates dir is unreachable (broken symlink, fresh setup), fail loud with: "Templates not found at `~/.claude/templates/manifest/<domain>.md` or `~/.claude/templates/manifest/_default.md`. Ensure `setup.sh` has been run (it symlinks `templates/` into `~/.claude`)."

---

## Phase 4 — Tooling Setup

Runs after Phase 1.5 (doc scaffolding complete). Detects the repo's stack(s),
proposes the `stacks` array, and drives prompt-first tooling install through the
install-vetting funnel. **Verification-first, advisory, prompt-first throughout:** never
auto-edit tool config, never auto-install, never auto-author a catalog entry.

### Step 1 — Detect stacks

Run the detector against the repo root:

```bash
node ~/.claude/skills/project-setup/detect-stacks.mjs .
```

It emits JSON: `{ "repoRoot": "...", "detected": [{ "stack": "python", "markers": ["pyproject.toml"], "dir": "." }, ...] }`. Each detection's `dir` is its location relative to the repo root (`.` = root); a non-`.` value signals a wrapper/monorepo layout, handled in Step 2. The detector matches exact-filename markers and extension markers (e.g. `.slcp`/`.csproj`/`.sln`) across the root + subdirs to depth 2 (noise dirs skipped).

- **Empty `detected`** → report: "No recognized stack markers found at the repo root. If this
  repo uses a stack, its markers aren't in the detector map yet — extend
  `skills/project-setup/detect-stacks.mjs` and author the stack's `~/.claude/stacks/<stack>.md`
  catalog entry." Then skip the rest of Phase 4.

### Step 2 — Propose and confirm `stacks`

- Show the detected stacks and the markers that triggered each.
- **Wrapper / monorepo layouts:** if a detected stack's `dir` is not `.`, surface the subdir path(s) and ask which root to onboard — never silently auto-select. If the same stack appears under multiple `dir`s, list them together and let the user pick the root.
- If `project.json` already has a `stacks` array, show a diff (detected vs declared) — never clobber.
- Ask the user to confirm or prune the list (propose-then-confirm; never silently write).
- On confirm, use the Edit tool to set `stacks` in `project.json` to the confirmed array.

### Step 3 — Per-stack catalog-coverage verification + net-new on-ramp

For each confirmed stack `<s>`:

- Check that `~/.claude/stacks/<s>.md` exists AND contains a `## Tooling` H2 section
  (read the file; confirm a line matching `^## Tooling`).
- **Present** → proceed to Step 4 for `<s>`.
- **Missing file, or no `## Tooling`** → the stack is **uncatalogued**. Do NOT dead-end and do
  NOT auto-author. Run the guided, approval-gated **net-new on-ramp** (Step 3a) to produce a
  catalog entry the user reviews before anything is written.

### Step 3a — Net-new stack on-ramp (uncatalogued → drafted catalog entry, approval-gated)

Verification-first: nothing is written without explicit user approval. For an uncatalogued stack `<s>`:

1. **Discover** candidate tier-1 tools for `<s>` — read the repo's own build/config files (the
   detected markers, e.g. a `.slcp`/`.csproj`) and do a targeted lookup of the stack's standard
   lint / format / type / test / build tooling.
2. **Research** each candidate: `Skill { skill: "vet-reputation", args: "<need> ... discover-from-need" }`
   (or `vet-install` with a stated need) to produce a ranked shortlist.
3. **Vet** the finalist(s) through the funnel:
   `Skill { skill: "vet-install", args: "candidate: <tool> surface: <surface> need: <role>" }`.
   Relay the consolidated report; the user decides (yes / no), exactly as the Step-4 per-tool loop.
4. **Draft** `~/.claude/stacks/<s>.md` from `~/.claude/stacks/_TEMPLATE.md` — fill `## Tooling`
   (the vetted tools, their `Install:` commands, roles) and a starter `## Hat` (specialist
   best-practices for `<s>`) from the vetted findings.
5. **Surface the draft for explicit user review/approval** — a HARD GATE. Do NOT write it silently.
6. **On approval:** write the entry directly to `~/.claude/stacks/<s>.md` (this writes through the
   directory symlink into the workflow repo's `stacks/` directory and is instantly live — no
   rebuild or `setup.sh` run needed). Then proceed to Step 4 for the now-catalogued `<s>`.
   **On decline:** skip `<s>` (record nothing).

This is the **ONLY** catalog-authoring path, and it is always approval-gated — never auto-author, never silent.

### Step 4 — Drive the funnel per tier-1 tool

Read the `## Tooling` section of `~/.claude/stacks/<s>.md` (the section ends at the next `## `
heading). Within it, the `- **CLI tools:**` line is a header; each indented sub-bullet beneath
it (e.g. `` - `ruff` — lint + format … Install: `pip install ruff` ``) is one tool entry. For
each such sub-bullet, extract the tool name, its `Install:` command, and its role description.
**Derive the install surface from the `Install:` command** — it determines which vetting gates
apply: `choco`/`winget`/`scoop`/`apt`/`dnf`/`brew`/`pacman` → `OS package manager` (Gate-1
reputation-only per `rules/install-vetting.md`); `pip`/`pipx`/`npm`/`cargo`/`gem`/`go install` →
`CLI dep`. Mislabeling an OS-package-manager tool as `CLI dep` wrongly invokes Gate 3's package
scanner, which cannot cover e.g. an LLVM-from-choco install.
The `- **MCPs:**` and `- **VSCode extensions:**` bullets are NOT CLI tools — skip them (see the
note at the end of this step). For each CLI tool:

1. Run the funnel (the user decides — relay its consolidated report):
   ```text
   Skill { skill: "vet-install", args: "candidate: <tool> surface: <derived surface> need: <role from the catalog bullet>" }
   ```
2. The report ends with "Proceed with install? (yes / no / see Gate N details)". Relay it; do not decide for the user.
3. **On "yes"** → run the tool's `Install:` command via Bash (e.g. `pip install ruff`). The advisory
   PreToolUse hook may nudge again here — that is expected and harmless; the tool was just vetted.
4. **On "no"** → skip the tool; record nothing.
5. After an install, capture: tool name, installed version (`<tool> --version` or package-manager
   query), install location, source (the install command), and the three gate verdicts from the
   `vet-install` report.

MCP servers and VSCode extensions listed in `## Tooling` are **out of v1 auto-install scope** —
surface them as "the catalog also recommends: <list>" for the user to handle manually.

### Step 5 — Write the per-repo install record

- If `docs/reference/stack-setup.md` does not exist, seed it from `~/.claude/templates/stack-setup-record.md`.
- Fill **Detected stacks** and **Last updated** (today's date — `date +%Y-%m-%d` via the Bash tool,
  or `Get-Date -Format 'yyyy-MM-dd'` in PowerShell), and append one row per installed tool to the
  **Installed Tools** table: stack, tool, version, install location, source, Gate-1 / Gate-2 /
  Gate-3 verdicts (copied from the funnel report), date.
- Surface the draft for review before writing (prompt-first). Do **not** auto-commit — the user
  commits it as part of normal git flow.

### Notes

- Prompt-first end to end: never edit tool config files (`pyproject.toml`, `.eslintrc`,
  `analysis_options.yaml`, …), never auto-install, never auto-author catalog entries.
- Polyglot repos: all detected stacks are proposed; the user prunes at Step 2.
- A detected-but-uncatalogued stack escaping at Step 3 is **intended** verification-first behavior,
  not an error — the catalog is the upstream source of truth.

---

## Phase 5 — Symlink Health Check (workflow repo only)

<!-- Intentionally workflow-repo-only: guarded by the setup.sh + skills/ + agents/-at-root detection.
     The `bash scripts/setup.sh` path below is a relative workflow-repo path, not a target-repo path —
     do not "fix" it to ~/.claude/scripts/setup.sh. -->

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
