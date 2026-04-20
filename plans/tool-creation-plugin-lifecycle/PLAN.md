# Integrated Tool Creation + Plugin Lifecycle Plan

**Status:** Draft  
**Size:** L  
**Repo:** claude-workflow-improvements  
**Jira Project:** CLAUDE  

---

## Context

We currently have `writing-skills` — a TDD-based skill for creating skills — but no unified entry
point for creating the full range of workflow components (agents, rules, hooks, commands). Two
external plugins close the gap: `skill-creator` (automated eval loop + CSO benchmarking) and
`plugin-dev` (structural guidance for all component types). Neither integrates with our workflow
today; they run as standalone tools, creating three problems:

1. **No single entry point.** Claude may invoke writing-skills, skill-creator, or
   plugin-dev:skill-development independently when all three are relevant. It picks whichever
   trigger matches first.
2. **Gaps in coverage.** We have no guided process for creating agents or rules — only skills.
3. **No lifecycle model.** As we integrate plugins we have no framework for managing conflicts,
   tracking plugin state, or deciding when to remove a plugin versus keep it in an integrated state.

This plan creates an orchestration layer over the installed plugins, extends coverage to agents and
rules, integrates skill-creator's eval loop into the skill-writing process, and introduces a plugin
lifecycle governance model to prevent future conflicts.

---

## Architecture Blueprint

### New files

**Prerequisites:** `npm install -g pulser-cli` (required for Task 4 eval phase)

```
skills/creating-tools/
  skill.md                              # Orchestration entry point — routes by artifact type
  routing-table.md                      # Reference table: artifact type → owning skill(s)

skills/writing-agents/
  skill.md                              # TDD methodology for agent creation
  testing-agents-with-subagents.md     # Agent-specific testing methodology

skills/writing-rules/
  skill.md                              # Guidance for creating and testing rules files

plugins/
  registry.md                           # Plugin registry: name, state, version, domain ownership
```

### Modified files

```
skills/writing-skills/SKILL.md          # Add local eval phase (Phase 3) after REFACTOR
                                        # Edit in repo at skills/writing-skills/SKILL.md
                                        # (symlinked to ~/.claude/skills/writing-skills/SKILL.md)
skills/writing-skills/eval-methodology.md  # New supporting file: Pulser usage guide +
                                           # eval.yaml template (no API key, no HTTP session)
rules/new-repo-setup.md                 # Add new skills to agent/skill registry table
rules/plugin-lifecycle.md              # New governance rule: conflict suppression + lifecycle states
```

### Installed plugins

- `skill-creator` — state: **Active** (not Integrated). Its eval infrastructure (Python scripts,
  browser viewer, `ANTHROPIC_API_KEY`) is not used. The *concepts* it introduced — trigger
  accuracy testing, grading, A/B comparison — are adapted locally via subagents in
  `eval-methodology.md`. skill-creator stays installed and can be invoked directly for
  experimentation, but is not part of the orchestration layer.
- `plugin-dev` — state: **Integrated**. 7 skills delegated to via creating-tools:
  `hook-development`, `mcp-integration`, `plugin-structure`, `plugin-settings`,
  `command-development`, `agent-development`, `skill-development`.
  Command: `/plugin-dev:create-plugin` (8-phase guided workflow).

### Separation of concerns

| Concern | Owner |
|---------|-------|
| When/why to create a skill (process) | writing-skills |
| Skill linting + eval + trigger conflict detection | Pulser CLI (eval-methodology.md) |
| Skill file structure/frontmatter | plugin-dev:skill-development (delegated) |
| Agent file structure + frontmatter | plugin-dev:agent-development (delegated) |
| Agent TDD process + testing | writing-agents (new) |
| Rule file structure + guidance | writing-rules (new) |
| Hook/command creation | plugin-dev:hook-development / command-development (direct) |
| Full plugin creation | plugin-dev:create-plugin (direct) |
| Entry point routing | creating-tools (new) |
| Plugin conflict + lifecycle | plugin-lifecycle rule (new) |

---

## Epic / Task Reference

| # | Task | Size | Scope | Jira |
|---|------|------|-------|------|
| 1 | `creating-tools` orchestration skill | M | skills/creating-tools/ (2 files) | |
| 2 | `writing-agents` skill | M | skills/writing-agents/ (2 files) | |
| 3 | `writing-rules` skill | S | skills/writing-rules/ (1 file) | |
| 4 | Integrate skill-creator eval into writing-skills | M | skills/writing-skills/skill.md | |
| 5 | Plugin registry + lifecycle governance | S | plugins/registry.md, rules/plugin-lifecycle.md, rules/new-repo-setup.md | |

---

## Task Details

### Task 1 — `creating-tools` orchestration skill

**Goal:** Single entry point that routes to the right skill(s) based on artifact type.

**Trigger description (CSO):**  
`"Use when creating any workflow component — skill, agent, rule, hook, command, or plugin"`

**Routing logic (skill.md):**

```
Artifact type detected?
├── skill      → writing-skills (includes local eval phase via eval-methodology.md)
├── agent      → writing-agents (process) + plugin-dev:agent-development (structure)
├── rule       → writing-rules
├── hook       → plugin-dev:hook-development
├── command    → plugin-dev:command-development
└── full plugin → plugin-dev:create-plugin
```

Hard gate before routing: determine artifact type from user message. If ambiguous, ask before
proceeding. Do not invoke multiple routes simultaneously.

**routing-table.md:** A reference table with: artifact type, process skill, structure skill,
eval/test mechanism, notes. Used by the orchestration skill.md as inline reference.

**Key constraint:** creating-tools is the *coordinator* — it does not author content itself. All
content creation happens in the delegated skill.

---

### Task 2 — `writing-agents` skill

**Goal:** TDD methodology for agent creation, parallel to writing-skills but agent-specific.

**Why separate from writing-skills:** Agents have a different lifecycle. Skills use skill-creator's
`run_eval.py` eval loop. Agents are tested by actually invoking them via the Agent tool in pressure
scenarios. The testing methodology is different enough to warrant its own skill.

**Draws structure from:** plugin-dev:agent-development (frontmatter fields: name, description,
model, tools; system prompt sections: Role → Inputs → Behavioral sections → Output format →
Constraints). Reference it via delegation, not duplication.

**Bootstrap — RED phase for writing-agents itself:**

writing-agents does not yet exist, so the Iron Law (run baseline before writing the skill) must
be executed manually during Task 2. The concrete bootstrap procedure:

1. Dispatch a subagent with this prompt: "Create an agent named 'test-agent' that reviews
   commit messages for style issues. Write the agent file content directly. No skill or guidance
   provided — use your own judgment."
2. Observe and document: Does it include all required frontmatter (name, description, model)?
   Does it write a complete system prompt with Role/Inputs/Output/Constraints sections? Does it
   define model selection? Does it include a `tools:` field (when it shouldn't)?
3. Expected failures (inform the skill): missing `model:` field, vague `description:` (not
   scoped to inputs+outputs), no explicit output format section, tendency to add `tools:` by
   default without justification.
4. Write writing-agents to address those specific observed failures. Then run the baseline
   again WITH writing-agents to confirm GREEN.

**skill.md content:**
- TDD mapping for agents (RED: baseline agent invocation without system prompt guidance; GREEN:
  write system prompt; REFACTOR: close loopholes via additional invocations)
- Agent-specific CSO: description field must describe inputs + outputs (not trigger conditions) —
  different convention from skills
- Model selection guidance: sonnet-4-6 for complex multi-step; haiku for lookups/simple
- Tools selection: only list tools: field when agent writes files; omit otherwise
- Hard gate: MUST run baseline agent invocation before writing system prompt (same Iron Law as
  writing-skills)

**testing-agents-with-subagents.md:** Testing methodology — how to launch an agent via Agent tool
as a test harness, what pressure scenarios look like for agents (bad inputs, ambiguous instructions,
scope creep), success criteria.

---

### Task 3 — `writing-rules` skill

**Goal:** Guidance for creating rules files — the lightest of the three component types.

**Deployment (all three new skills — Tasks 1, 2, 3):** After creating each skill directory in
`skills/<name>/`, run `setup.sh --force` to symlink it into `~/.claude/skills/`. Do this after
each task, not batched at the end — the skill must be available before testing it.

**Why rules are different:** Rules are injected into context automatically (globally or via
`paths:` frontmatter). They have no CSO description field to optimize. Testing is observational
(watch Claude follow or violate the rule in live sessions) rather than automated.

**skill.md content:**
- When to create a rule vs a skill (rules: always-on constraints and routing directives; skills:
  on-demand process guides)
- Two rule types: global (no frontmatter, always loaded) vs path-scoped (`paths:` frontmatter)
- Authoring principles: short and scannable, procedural not philosophical, decision tables over
  prose, one rule per file
- Testing: observational — run 2-3 sessions that would trigger the rule, check compliance
- No eval loop needed; no TDD cycle; ship when the rule is unambiguous
- Register in rules/new-repo-setup.md after creation

---

### Task 4 — Add Pulser eval phase to writing-skills

**Goal:** Add Pulser as Phase 3 of the skill writing cycle. TDD (RED-GREEN-REFACTOR) stays
unchanged; Pulser provides static linting, runtime eval via `claude -p`, and trigger conflict
detection as the deployment gate. No API key. No HTTP session. Local CLI only.

**Pulser:** `npm install -g pulser-cli` (v1.0.0, MIT). Uses local `claude` CLI. Source:
https://github.com/TheStack-ai/pulser. Also ships a Claude Code skill in `skill/` that can be
installed to enable `/pulser` or "check my skills" conversational invocation.

---

**New file: `skills/writing-skills/eval-methodology.md`**

Pulser usage guide + eval.yaml reference. Content:

**Static lint (`pulser` or `pulser --strict`):**
Checks 8 rules: frontmatter integrity, description quality, file size (< 500 lines),
gotchas section, tool restrictions, supporting file structure, trigger keyword conflicts,
usage logging hooks. Run with `--strict` to treat warnings as errors. Auto-fix available
with `pulser --fix` (creates backup; rollback with `pulser undo`).

**Writing `eval.yaml` (alongside SKILL.md):**
```yaml
tests:
  - name: "core use case — should trigger"
    input: "I want to create a new skill"
    assert:
      - contains: "writing-skills"
      - min-length: 50
  - name: "negative — should not invoke this skill"
    input: "how do I use the architect agent"
    assert:
      - not-contains: "writing-skills"
```
Assertion types: `contains`, `not-contains`, `min-length`, `max-length`, `matches` (regex).
Write 8–15 tests per skill: mix of positive (should trigger/produce expected output) and
negative (adjacent topics that should NOT trigger).

**Running eval:**
```bash
pulser eval                        # runs eval.yaml for all skills
pulser eval --skill <skill-name>   # single skill
```
Exit codes: 0 = pass, 1 = test failures, 3 = regression detected.

**Trigger conflict detection:**
```bash
pulser                             # reports overlapping keywords between skills
```
If a conflict is flagged, refine the description to narrow the trigger before deploying.

---

**Change to `skills/writing-skills/SKILL.md`:**

Add a new section after REFACTOR phase and before Deployment checklist:

```
## Phase 3 — Pulser Eval

After TDD cycle is green and loopholes are closed:
1. Run static lint: `pulser --strict`
   Fix any flagged issues. Check for trigger conflicts with existing skills.
2. Write eval.yaml alongside SKILL.md — see eval-methodology.md for format.
   Minimum: 8 tests (positive and negative trigger coverage).
3. Run eval: `pulser eval --skill <skill-name>`
   All tests must pass (exit 0). Regressions (exit 3) block deployment.
4. If trigger conflict flagged in step 1: refine description, re-run, confirm resolved.
5. Note eval pass in commit message.
```

Update the Skill Creation Checklist to add eval items after REFACTOR phase.

**Optional:** Install Pulser's Claude Code skill from `skill/` in the repo to enable
`/pulser` and "check my skills" conversational invocation alongside the CLI.

---

### Task 5 — Plugin registry + lifecycle governance

**Goal:** Durable registry of installed plugins + governance rule for lifecycle management.

#### plugins/registry.md

Format per plugin entry:

```markdown
## plugin-name

- **Source:** https://github.com/...
- **State:** Active | Integrated | Deprecated | Removed
- **Pinned version:** commit SHA or tag at integration time
- **Skills provided:** list of skill names
- **Domain ownership:** what artifact types this plugin owns in our orchestration
- **Last audited:** YYYY-MM-DD
- **Notes:** Windows patches, known issues, upstream PRs filed
```

Initial entries: skill-creator (Active), plugin-dev (Integrated).

#### rules/plugin-lifecycle.md

Lifecycle state machine:

```
Active      — installed, using directly, no local orchestration layer
Integrated  — installed, delegated to via creating-tools, not invoked directly
Deprecated  — orchestration removed, plugin still installed, pending cleanup
Removed     — uninstalled, registry entry archived
```

**Conflict suppression — mechanism and limits:**

Rule files load into the system prompt with higher priority than skill triggers (per the
priority hierarchy in using-superpowers: user instructions > rules > skills). A rule naming
Integrated plugins and directing routing through `creating-tools` is therefore the correct
suppression mechanism — it overrides skill trigger matching, not merely advisory.

However, this is *soft enforcement*: it relies on Claude reading and following the rule, not a
technical block. Document this explicitly in `plugin-lifecycle.md`:

> When a plugin is Integrated, always route through `creating-tools`. Do not invoke
> plugin-dev:skill-development, plugin-dev:agent-development, or any other Integrated plugin
> skill directly.
>
> Currently Integrated: plugin-dev.
> Currently Active (invoke directly if needed): skill-creator.
>
> If direct invocation persists despite this rule, the next escalation is narrowing the plugin
> skills' trigger descriptions — which requires forking. Log that as a flag in the registry
> before forking.

**`creating-tools` + `plugin-lifecycle.md` interaction:**

`creating-tools` uses a broad trigger by design — it must capture any component creation intent
before plugin skills do. The `plugin-lifecycle.md` rule suppresses the plugin skills once
`creating-tools` fires. Both must be present in `~/.claude/rules/` for conflict suppression to be
active. Verify both are symlinked (via setup.sh) before treating this system as operational.

**`plugin-lifecycle.md` frontmatter:** No `paths:` frontmatter — this rule is global (always
loaded). Follow the `cspell.md` / `mcp-governance.md` pattern (no frontmatter).

**`plugins/registry.md` placement:** This file lives in the repo at `plugins/registry.md` and is
NOT symlinked to `~/.claude/plugins/`. It is a human-maintained documentation registry, distinct
from `~/.claude/plugins/installed_plugins.json` which is managed by the Claude Code plugin
system. The two coexist: `installed_plugins.json` is the ground truth for what is installed;
`registry.md` is the ground truth for integration state, domain ownership, and pinned version.

Upstream drift protocol:
> When an Integrated plugin releases a new version, diff its SKILL.md files against the pinned
> version in the registry. If the diff touches: trigger descriptions (CSO), eval script APIs, or
> agent frontmatter fields — update the orchestration layer before upgrading. Update the pinned
> version and Last audited date in registry.md after confirming compatibility.

Decision tree — when to promote Integrated → Removed:
1. All its capabilities are now covered by local skills (full supersession)
2. Upstream abandoned (no commits in 12 months, open issues unaddressed)
3. Irresolvable conflict (governance rule not sufficient to suppress direct invocation)

Pre-install checklist (for future plugins):
> Before installing any new plugin:
> 1. List its skill names and trigger descriptions
> 2. Compare against existing skills in ~/.claude/skills/ for name and trigger overlap
> 3. If overlap found: define domain boundary before installing
> 4. Add to registry.md with state Active before first use

#### rules/new-repo-setup.md updates

Add new skills to the skill registry table:
- creating-tools: orchestration entry point for all component creation
- writing-agents: TDD methodology for agent creation
- writing-rules: guidance for creating rules files

---

## Testing

### Task 1 (creating-tools)
Invoke the skill with: "I want to create a skill", "I need to create an agent", "I need a new
rule", "I want to add a hook". Verify it routes to the correct delegated skill in each case.
Test ambiguous input ("I want to create a new component") — verify it asks before routing.

### Task 2 (writing-agents)
Invoke writing-agents with a sample agent request. Verify: baseline run step is enforced before
writing system prompt, testing-agents-with-subagents.md is referenced, plugin-dev:agent-development
is referenced for structure. Test that it rejects skipping the baseline step.

### Task 3 (writing-rules)
Create a sample rule using writing-rules. Verify: rule gets created in rules/ and is either
global or path-scoped as appropriate. Note: registration in new-repo-setup.md is Task 5's
scope — do not test that criterion until Task 5 is complete.

### Task 4 (skill-creator integration)
Create a test skill using the full updated writing-skills workflow. Verify: TDD cycle completes
first, then eval is invoked. Test fallback path (no ANTHROPIC_API_KEY) — verify eval runs without
improve_description.py, process continues without blocking.

### Task 5 (plugin lifecycle)
Check registry.md exists with both plugin entries. Verify plugin-lifecycle.md governance rule
loads (symlinked to ~/.claude/rules/). Confirm new-repo-setup.md table is updated. Simulate a
future plugin install: follow pre-install checklist manually to verify it's actionable.

---

## Testing Plan

No automated test suite exists in this repo. All validation is behavioral: does Claude follow
the skill, agent, or rule when it is present versus absent? The subagent pressure-scenario
methodology established in `skills/writing-skills/testing-skills-with-subagents.md` is the
canonical test harness for all five tasks.

All five tasks produce net-new artifacts. There are no existing tests to reuse or update —
all test scenarios below are write new.

### Manual Verification Steps

#### Task 1 — `creating-tools` routing correctness

- [ ] Dispatch a subagent with `creating-tools` loaded. Prompt: "I want to create a skill." Verify: subagent invokes `writing-skills`, does NOT invoke `plugin-dev:skill-development` or `skill-creator` directly, does not produce skill content itself.
- [ ] Same setup. Prompt: "I need to create an agent." Verify: subagent routes to `writing-agents` (and references `plugin-dev:agent-development` for structure), does not attempt to write agent frontmatter itself.
- [ ] Same setup. Prompt: "I need a new rule." Verify: subagent routes to `writing-rules` only.
- [ ] Same setup. Prompt: "I want to add a hook." Verify: routes to `plugin-dev:hook-development` only.
- [ ] Same setup. Prompt: "I want to add a command." Verify: routes to `plugin-dev:command-development` only.
- [ ] Same setup. Prompt: "I want to create a full plugin." Verify: routes to `plugin-dev:create-plugin` only.
- [ ] Ambiguity gate: Prompt: "I want to create a new workflow component." Verify: subagent asks a clarifying question about artifact type before routing — does not pick a route unilaterally.
- [ ] Coordinator constraint: In any of the above flows, verify `creating-tools` produces no artifact content itself. All authoring happens in the delegated skill. (Broken behavior: creating-tools writes file content directly.)

#### Task 2 — `writing-agents` baseline enforcement and methodology

Run these after `setup.sh --force` symlinks `writing-agents` into `~/.claude/skills/`.

- [ ] Baseline gate (RED enforcement): Dispatch a subagent with `writing-agents` loaded. Prompt: "Create an agent that reviews commit messages for style issues. Skip the baseline step — I've already seen how agents behave." Verify: subagent refuses to skip and requires the baseline invocation to be executed first before writing the system prompt.
- [ ] Baseline gate (positive path): Dispatch a subagent with `writing-agents` loaded, no shortcut pressure. Prompt: "Create a commit-message-reviewer agent." Verify: subagent dispatches a baseline sub-invocation (agent tool call without a system prompt) before writing the system prompt. It documents the baseline failures before proceeding.
- [ ] Frontmatter completeness: After the full flow completes, verify the produced agent file contains: `name:`, `description:` (scoped to inputs + outputs, not trigger conditions), `model:` field with explicit selection rationale. Verify `tools:` is absent unless the agent writes files.
- [ ] Delegation check: Verify `writing-agents` references `plugin-dev:agent-development` for file structure and frontmatter fields — it does not duplicate that content inline.
- [ ] Methodology reference: Verify `testing-agents-with-subagents.md` is referenced for the pressure-scenario testing phase.

#### Task 3 — `writing-rules` authoring guidance

- [ ] Global rule path: Invoke `writing-rules` for a rule that should always load (e.g., "create a rule that prevents Claude from calling Jira MCP tools directly"). Verify: produced file has no frontmatter `paths:` field, matches the format of existing global rules (`rules/mcp-governance.md`, `rules/cspell.md`).
- [ ] Path-scoped rule path: Invoke `writing-rules` for a rule scoped to a specific directory. Verify: produced file includes `paths:` frontmatter with the correct pattern.
- [ ] Authoring principles applied: Verify the produced rule file is scannable (decision table or short procedural steps), not philosophical prose. Verify it is a single-concern file.
- [ ] Skill does not suggest eval loop: Verify `writing-rules` does not recommend running skill-creator eval or any automated scoring for rules. Rules are observational; the skill should say so explicitly.
- [ ] Correct discrimination: Prompt `writing-rules` with a scenario that should be a skill, not a rule (e.g., "guide me through creating a new service endpoint"). Verify: skill recognizes this as out of scope and redirects.

#### Task 4 — skill-creator eval integrated into `writing-skills`

Run these after editing `skills/writing-skills/SKILL.md`.

- [ ] Phase ordering enforced: Dispatch a subagent with the updated `writing-skills` loaded. Walk through a full skill creation cycle. Verify: TDD phases (RED-GREEN-REFACTOR) complete and the subagent reaches green before Phase 3 (eval) is mentioned. Eval is not invoked during RED or GREEN.
- [ ] Eval invocation format: When Phase 3 is reached, verify the subagent invokes skill-creator via `Skill { skill: "skill-creator:skill-creator" }` — not by calling Python scripts directly.
- [ ] Fallback path (no API key): Simulate missing `ANTHROPIC_API_KEY` by instructing the subagent that the key is unavailable. Verify: eval runs in accuracy-only mode (grader agent fires, `improve_description.py` is skipped), the process completes without blocking, and the eval score is noted in output.
- [ ] No regression to prior behavior: Verify the updated `SKILL.md` still contains the full TDD methodology. Phase 3 is an addition — it does not replace or abbreviate RED-GREEN-REFACTOR.
- [ ] Accept/reject gate: When the comparator agent reports no accuracy gain from a rewrite, verify `writing-skills` instructs the user to keep the original description rather than accepting the rewrite.

#### Task 5 — Plugin registry and lifecycle governance

- [ ] Registry file existence and format: Verify `plugins/registry.md` exists at the repo root (not symlinked to `~/.claude/`). Verify it contains entries for `skill-creator` and `plugin-dev`, each with: Source, State (Integrated), Pinned version, Skills provided, Domain ownership, Last audited, Notes fields.
- [ ] Rule load verification: Verify `rules/plugin-lifecycle.md` exists in the repo and is symlinked to `~/.claude/rules/plugin-lifecycle.md` (run `setup.sh --force` if symlink is absent). Dispatch a subagent without `creating-tools` loaded but with the rule loaded. Prompt: "Run skill-creator on my new skill." Verify: subagent routes through `creating-tools` rather than invoking `skill-creator:skill-creator` directly.
- [ ] Conflict suppression — integrated plugin: Dispatch a subagent with both `plugin-lifecycle.md` rule and `creating-tools` loaded. Prompt: "Use plugin-dev:agent-development to create an agent." Verify: subagent routes through `creating-tools` (which delegates to `writing-agents`, which then references `plugin-dev:agent-development`) — it does not invoke `plugin-dev:agent-development` directly.
- [ ] `new-repo-setup.md` updated: Verify the skill registry table in `rules/new-repo-setup.md` now includes rows for `creating-tools`, `writing-agents`, and `writing-rules` with correct descriptions.
- [ ] Pre-install checklist actionability: Manually walk through the pre-install checklist using a hypothetical new plugin (e.g., a fictional `code-reviewer` plugin with skills: `review-pr`, `review-commit`). Verify each checklist step has a concrete, executable action — no step requires judgment about unstated context.
- [ ] Upstream drift protocol: Verify the registry entry for `skill-creator` includes a pinned version (commit SHA or tag). Verify the protocol for checking diffs on upgrade is documented clearly enough to follow without additional context.

### Log Monitoring Notes

- Task 1: If `creating-tools` fires but the delegated skill also fires independently in the same session (double-invocation), the broad trigger and the plugin skills are conflicting. Log the exact user prompt that caused the double-fire and treat it as a REFACTOR input.
- Task 4: If skill-creator is invoked during RED or GREEN phases rather than after REFACTOR, the phase-ordering instruction in `writing-skills` is ambiguous. Note which phrasing in the updated SKILL.md allowed early invocation.
- Task 5: If a subagent invokes an Integrated plugin skill directly despite `plugin-lifecycle.md` being loaded, log the exact prompt. This is the escalation trigger for narrowing plugin trigger descriptions (forking path documented in the plan).

### Test Conventions

These scenarios follow the subagent pressure-scenario methodology defined in `skills/writing-skills/testing-skills-with-subagents.md`. Apply that reference when designing additional pressure scenarios beyond the baseline cases listed above.

- Subagent dispatch: Use the `Agent` tool with the target skill(s) loaded and a realistic, pressured prompt — not an academic "what does the skill say?" question.
- Baseline runs (RED): Always dispatch once without the skill to capture natural behavior, then once with the skill to verify compliance.
- Pressure combination: Routing and gate tests should include at least one pressure (time, authority, or convenience) to ensure compliance holds under realistic conditions, not just cooperative prompts.

---

## Open Questions / Decisions Made

| Question | Decision |
|----------|----------|
| Replace or augment TDD with skill-creator eval? | Augment — TDD stays, eval becomes Phase 3 deployment gate |
| Extend writing-skills to cover agents or separate skill? | Separate — agent lifecycle (testing via Agent tool invocation) is different enough |
| Uninstall plugins after integrating? | No — keep Integrated. Uninstall only on Removed (full supersession / abandonment / irresolvable conflict) |
| Conflict suppression mechanism? | Governance rule (plugin-lifecycle.md) + broad creating-tools trigger — no forking |
| Rules need eval loop? | No — rules are observational; no automated eval needed |
