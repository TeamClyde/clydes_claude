# tier2-subagent-driven-dev-v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do NOT use the `superpowers:` prefix — invoke the local forked versions which have git-manager and plan-gate integration.
>
> **Sub-plan (Form A):** This is a sub-plan of `plans/orchestrator-routing-v2/orchestrator-routing-v2-plan.md`. Per `rules/plan-docs.md`: design + plan only; no journal or handoff (rolls up to parent). Parent plan-gate covered governance — no separate plan-gate, no separate Jira tickets (Jira disabled here anyway), no separate TODO.md entry.

---

**Goal:** Rewrite `subagent-driven-development` to incorporate four frontier orchestration patterns — tier-aware dispatch, re-anchoring, cache-stable prompt prefixes, sharpened reviewer role boundaries — without weakening any existing gate.

**Architecture:** Plan-time complexity column in Task Reference (B1) drives orchestrator model selection; canonical role-prefix files (B3) hold methodological content with a PreToolUse hook auto-prepending byte-identical bytes for cache stability; per-implementer-dispatch re-anchoring block (B2) sits in the variable suffix; sharpened reviewer prompts (B4) use positive narrow scope and structural separation. See [design doc §2](./tier2-subagent-driven-dev-v2-design.md) for the architecture overview and §3–§6 for per-piece detail.

**Tech Stack:** Markdown skill bodies; Node.js ESM PreToolUse hook (.mjs); existing `.claude/hooks/preToolUse/` infrastructure (matches `.claude/hooks/preToolUse/agent-model-pinning.mjs` pattern).

---

## Task Reference

| # | Task | Size | Complexity | Scope | Jira Key |
|---|------|------|------------|-------|----------|
| 1 ✅ | B1 — Plan-time tier classifier (Complexity column + skill wiring) | S | S | `skills/subagent-driven-development/SKILL.md`, `skills/writing-plans/SKILL.md`, `rules/planning.md` | _(N/A — Jira disabled)_ |
| 2 ✅ | B3 — Canonical role-prefix files + auto-prepend hook | M | M | 3 new prefix files; new hook + tests; 4 prompt-template restructures | _(N/A)_ |
| 3 | B2 — Re-anchoring block in variable suffix | S | S | `skills/subagent-driven-development/SKILL.md`, `implementer-prompt.md` | _(N/A)_ |
| 4 | B4 — Sharpened reviewer prompts | M | M | 2 prefix file content rewrites; minor prompt-template edits | _(N/A)_ |

**Sequencing:** 1 → 2 → 3 → 4 (per design doc §7). Task 3 depends on Task 2 (anchor sits in B3's variable-suffix shape). Task 4 depends on Task 2 (edits prefix files Task 2 creates). Task 1 is independent.

The Complexity column doubles as the input to B1's tier-aware dispatch — Task 1 itself will use it once shipped, and Tasks 2–4 use it for their own dispatches.

---

## File Structure

| File | Status | Responsibility |
|------|--------|----------------|
| `skills/subagent-driven-development/SKILL.md` | Modified (T1, T2, T3) | Skill body — Model Selection (T1), prefix-hook documentation (T2), Plan Anchor format (T3) |
| `skills/subagent-driven-development/implementer-prompt.md` | Modified (T2, T3) | Variable-suffix structure for implementer dispatches |
| `skills/subagent-driven-development/spec-reviewer-prompt.md` | Modified (T2, T4) | Variable-suffix structure for spec-review dispatches |
| `skills/subagent-driven-development/code-quality-reviewer-prompt.md` | Modified (T2, T4) | Variable-suffix structure for code-quality dispatches |
| `skills/subagent-driven-development/prefixes/implementer.md` | New (T2) | Methodological prefix for implementer dispatches (Code Organization, Self-Review, Report Format) |
| `skills/subagent-driven-development/prefixes/spec-reviewer.md` | New (T2), rewritten (T4) | Methodological prefix for spec-review dispatches |
| `skills/subagent-driven-development/prefixes/code-quality-reviewer.md` | New (T2), rewritten (T4) | Methodological prefix for code-quality dispatches |
| `.claude/hooks/preToolUse/subagent-prefix-prepend.mjs` | New (T2) | PreToolUse hook: detects role marker, prepends matching prefix file |
| `.claude/hooks/preToolUse/subagent-prefix-prepend.test.mjs` | New (T2) | Unit tests for the hook |
| `.claude/settings.json` | Modified (T2) | Register the new hook |
| `skills/writing-plans/SKILL.md` | Modified (T1) | Task Reference template — adds Complexity column |

---

## Task 1: B1 — Plan-time tier classifier

**Files:**
- Modify: `skills/subagent-driven-development/SKILL.md` (Model Selection section — currently around lines 103–116)
- Modify: `skills/writing-plans/SKILL.md` (Task Reference template/example)
- Modify: `rules/planning.md` (Plan Doc Requirements — Task Reference table columns list)

**No tests required** — documentation/skill-body change. Verification = artifact inspection (next task using the new column will exercise it).

- [ ] **Step 1: Read current Model Selection section to confirm position and content.**

  Run: `Read skills/subagent-driven-development/SKILL.md offset 103 limit 18`

  Expect: complexity table (Trivial / Standard / Complex → Haiku / Sonnet / Opus), and a "Per-dispatch requirement" paragraph mandating the `model:` parameter.

- [ ] **Step 2: Update the Model Selection section** in `skills/subagent-driven-development/SKILL.md`. Replace the existing section with the following content (preserving the existing complexity table; adding the plan-time-source paragraph and frontmatter-pin note):

  ```markdown
  ## Model Selection

  Use the least powerful model that can handle each role to conserve cost and increase speed.

  **Selecting the model:**

  | Complexity | Examples | Model |
  |---|---|---|
  | Trivial (S — Haiku-eligible) | doc edit, jira transition, test-runner output parsing, single-file rename, config tweak | claude-haiku-4-5-20251001 |
  | Standard (M) | feature implementation, multi-file change, debugging | claude-sonnet-4-6 |
  | Complex (L) | architecture decisions, cross-cutting refactor, design judgment | claude-opus-4-7 |

  **Source of complexity:** The plan doc's Task Reference table includes a Complexity column with values S / M / L. The orchestrator reads this column at dispatch time and picks the model accordingly (S → Haiku, M → Sonnet, L → Opus). If the plan predates this convention and the column is absent, default to M (Sonnet) and log the fallback.

  **Frontmatter pinning wins.** Some agents are pinned to a specific tier in their frontmatter (e.g., `researcher` and `test-runner` pin to Haiku). The PreToolUse `agent-model-pinning.mjs` hook (Tier 1, A1) overrides the orchestrator's `model:` choice with the pinned value when present. The plan-time tier becomes a soft default in those cases — A1's hook is the source of truth.

  **Per-dispatch requirement:** Each implementer dispatch must explicitly set the `model:` parameter on the Task tool AND echo the choice as `**Model:** <name> — <rationale>` in the prompt body (see `./implementer-prompt.md`). Parent-context model selection must not silently propagate — every task gets a deliberate, visible choice.
  ```

- [ ] **Step 3: Read current Task Reference template in writing-plans/SKILL.md to confirm position.**

  Run: `Grep "Task Reference" skills/writing-plans/SKILL.md -n`

  Expect: a markdown table example showing columns `# | Task | Size | Scope | Jira Key`.

- [ ] **Step 4: Add Complexity column to the Task Reference template** in `skills/writing-plans/SKILL.md`.

  Find the example table (header row `| # | Task | Size | Scope | Jira Key |`) and update to add a Complexity column immediately after Size:

  ```markdown
  | # | Task | Size | Complexity | Scope | Jira Key |
  |---|------|------|------------|-------|----------|
  | 1 | ... | S/M/L | S/M/L | files/components | _(assigned at plan-gate)_ |
  ```

  Add a one-line note above or below the table:

  > Complexity is the input to tier-aware dispatch (see `subagent-driven-development` Model Selection): S → Haiku, M → Sonnet, L → Opus. Size is independent of complexity — a small but architecturally complex task may be `Size: S, Complexity: L`.

- [ ] **Step 5: Update `rules/planning.md` Plan Doc Requirements section** to include the Complexity column in the authoritative columns list (adherence WARNING — without this, rule and skill template silently disagree).

  Find the line:

  > **Task Reference table** — **Authoritative durable progress record.** Columns: #, Task, Size, Scope, Jira Key.

  Replace with:

  > **Task Reference table** — **Authoritative durable progress record.** Columns: #, Task, Size, Complexity, Scope, Jira Key. Complexity (S/M/L) drives tier-aware dispatch — see `subagent-driven-development` Model Selection. Size is independent of complexity (a small but architecturally complex task may be `Size: S, Complexity: L`).

- [ ] **Step 6: Commit.**

  ```
  Skill { skill: "git-manager", args: "commit files: [skills/subagent-driven-development/SKILL.md, skills/writing-plans/SKILL.md, rules/planning.md] type: feat description: 'add plan-time Complexity column for tier-aware dispatch (B1)'" }
  ```

---

## Task 2: B3 — Canonical role-prefix files + auto-prepend hook

**Files:**
- New: `skills/subagent-driven-development/prefixes/implementer.md`
- New: `skills/subagent-driven-development/prefixes/spec-reviewer.md`
- New: `skills/subagent-driven-development/prefixes/code-quality-reviewer.md`
- New: `.claude/hooks/preToolUse/subagent-prefix-prepend.mjs`
- New: `.claude/hooks/preToolUse/subagent-prefix-prepend.test.mjs`
- Modify: `.claude/settings.json` (register hook)
- Modify: `skills/subagent-driven-development/SKILL.md` (document the marker convention + hook)
- Modify: `skills/subagent-driven-development/implementer-prompt.md`
- Modify: `skills/subagent-driven-development/spec-reviewer-prompt.md`
- Modify: `skills/subagent-driven-development/code-quality-reviewer-prompt.md`

This task lands the cache-hit infrastructure. Reviewer prefix content at this stage is the methodological content carried over from the existing prompt templates verbatim — Task 4 sharpens it.

### Step 2.1: Create the three prefix files (extract methodological content from existing prompt templates)

- [ ] **Step 2.1a: Create `skills/subagent-driven-development/prefixes/implementer.md`** with the following content (the methodological/evergreen content from the existing implementer-prompt template, with frontmatter):

  ```markdown
  ---
  role: implementer
  version: 1
  ---

  You are an implementer subagent in a coordinated workflow.

  ## Before You Begin

  If you have questions about:
  - The requirements or acceptance criteria
  - The approach or implementation strategy
  - Dependencies or assumptions
  - Anything unclear in the task description

  **Ask them now.** Raise any concerns before starting work.

  **While you work:** If you encounter something unexpected or unclear, **ask questions**.
  It's always OK to pause and clarify. Don't guess or make assumptions.

  ## Your Job

  Once you're clear on requirements:
  1. Implement exactly what the task specifies
  2. Write tests (following TDD if task says to)
  3. Verify implementation works
  4. Commit your work
  5. Self-review (see below)
  6. Report back

  ## Code Organization

  You reason best about code you can hold in context at once, and your edits are more
  reliable when files are focused. Keep this in mind:
  - Follow the file structure defined in the plan
  - Each file should have one clear responsibility with a well-defined interface
  - If a file you're creating is growing beyond the plan's intent, stop and report
    it as DONE_WITH_CONCERNS — don't split files on your own without plan guidance
  - If an existing file you're modifying is already large or tangled, work carefully
    and note it as a concern in your report
  - In existing codebases, follow established patterns. Improve code you're touching
    the way a good developer would, but don't restructure things outside your task.

  ## When You're In Over Your Head

  It is always OK to stop and say "this is too hard for me." Bad work is worse than
  no work. You will not be penalized for escalating.

  **STOP and escalate when:**
  - The task requires architectural decisions with multiple valid approaches
  - You need to understand code beyond what was provided and can't find clarity
  - You feel uncertain about whether your approach is correct
  - The task involves restructuring existing code in ways the plan didn't anticipate
  - You've been reading file after file trying to understand the system without progress

  **How to escalate:** Report back with status BLOCKED or NEEDS_CONTEXT. Describe
  specifically what you're stuck on, what you've tried, and what kind of help you need.
  The controller can provide more context, re-dispatch with a more capable model,
  or break the task into smaller pieces.

  ## Before Reporting Back: Self-Review

  Review your work with fresh eyes. Ask yourself:

  **Completeness:**
  - Did I fully implement everything in the spec?
  - Did I miss any requirements?
  - Are there edge cases I didn't handle?

  **Quality:**
  - Is this my best work?
  - Are names clear and accurate (match what things do, not how they work)?
  - Is the code clean and maintainable?

  **Discipline:**
  - Did I avoid overbuilding (YAGNI)?
  - Did I only build what was requested?
  - Did I follow existing patterns in the codebase?

  **Testing:**
  - Do tests actually verify behavior (not just mock behavior)?
  - Did I follow TDD if required?
  - Are tests comprehensive?

  If you find issues during self-review, fix them now before reporting.

  ## Report Format

  When done, report:
  - **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
  - What you implemented (or what you attempted, if blocked)
  - What you tested and test results
  - Files changed
  - Self-review findings (if any)
  - Any issues or concerns

  Use DONE_WITH_CONCERNS if you completed the work but have doubts about correctness.
  Use BLOCKED if you cannot complete the task. Use NEEDS_CONTEXT if you need
  information that wasn't provided. Never silently produce work you're unsure about.
  ```

- [ ] **Step 2.1b: Create `skills/subagent-driven-development/prefixes/spec-reviewer.md`** by extracting the methodological content (everything that's not per-task variable) from the existing `spec-reviewer-prompt.md` template:

  ```markdown
  ---
  role: spec-reviewer
  version: 1
  ---

  You are reviewing whether an implementation matches its specification.

  ## CRITICAL: Do Not Trust the Report

  The implementer finished suspiciously quickly. Their report may be incomplete,
  inaccurate, or optimistic. You MUST verify everything independently.

  **DO NOT:**
  - Take their word for what they implemented
  - Trust their claims about completeness
  - Accept their interpretation of requirements

  **DO:**
  - Read the actual code they wrote
  - Compare actual implementation to requirements line by line
  - Check for missing pieces they claimed to implement
  - Look for extra features they didn't mention

  ## Your Job

  Read the implementation code and verify:

  **Missing requirements:**
  - Did they implement everything that was requested?
  - Are there requirements they skipped or missed?
  - Did they claim something works but didn't actually implement it?

  **Extra/unneeded work:**
  - Did they build things that weren't requested?
  - Did they over-engineer or add unnecessary features?
  - Did they add "nice to haves" that weren't in spec?

  **Misunderstandings:**
  - Did they interpret requirements differently than intended?
  - Did they solve the wrong problem?
  - Did they implement the right feature but wrong way?

  **Verify by reading code, not by trusting report.**

  ## Report Format

  - ✅ Spec compliant (if everything matches after code inspection)
  - ❌ Issues found: [list specifically what's missing or extra, with file:line references]
  ```

- [ ] **Step 2.1c: Create `skills/subagent-driven-development/prefixes/code-quality-reviewer.md`** with baseline content carried over from the existing `code-quality-reviewer-prompt.md` template (which is thin — Task 4 will fill it out properly):

  ```markdown
  ---
  role: code-quality-reviewer
  version: 1
  ---

  You are reviewing implementation quality after spec compliance has passed.

  **In addition to standard code quality concerns, check:**
  - Does each file have one clear responsibility with a well-defined interface?
  - Are units decomposed so they can be understood and tested independently?
  - Is the implementation following the file structure from the plan?
  - Did this implementation create new files that are already large, or significantly grow existing files? (Don't flag pre-existing file sizes — focus on what this change contributed.)

  ## Report Format

  Return: Strengths, Issues (Critical/Important/Minor), Assessment.
  ```

### Step 2.2: Create the PreToolUse hook

- [ ] **Step 2.2a: Create `.claude/hooks/preToolUse/subagent-prefix-prepend.mjs`** matching the structure of the existing `agent-model-pinning.mjs` (stdin → JSON parse → emit `updatedInput` with modified prompt).

  > **Schema reminder:** The PreToolUse hook for Agent dispatches receives a flat input object with top-level fields `subagent_type`, `prompt`, `description`, `model` — NOT a nested `tool_input` wrapper. This matches the existing `agent-model-pinning.mjs` pattern (it reads `input?.subagent_type`, `input?.prompt`, etc. directly from the parsed JSON). Hook is scoped to Agent dispatches by the matcher in `.claude/settings.json`, so no `tool_name` check is needed in the hook body.

  Implementation:

  ```javascript
  #!/usr/bin/env node
  /**
   * PreToolUse hook — Subagent role-prefix auto-prepend.
   *
   * Event:   PreToolUse on Agent tool (scoped via settings.json matcher)
   * Purpose: Detect role marker on first non-empty line of prompt, read matching
   *          prefix file, prepend bytes to the prompt, strip the marker line.
   *          Yields byte-identical prefix across same-role dispatches → automatic
   *          prompt-cache hits.
   *
   * Marker syntax: `[role: implementer]` / `[role: spec-reviewer]` / `[role: code-quality-reviewer]`
   * No marker → pass through (covers architect, researcher, test-* dispatches and any
   * Agent dispatch authored without the marker).
   *
   * DESIGN DECISION — missing prefix file emits permissionDecision: "deny":
   *   The existing agent-model-pinning.mjs hook never blocks (always exits 0). This
   *   hook deliberately deviates: a missing prefix file is a deployment error that
   *   would silently produce a cache miss AND a malformed dispatch. Failing loud
   *   forces the operator to notice immediately. The CLAUDE_DISABLE_WORKFLOW_HOOKS
   *   env var is the recovery path.
   *
   *   Schema precedent: graph-tools-enforcement.mjs:206-212 emits the same
   *   { hookSpecificOutput: { hookEventName, permissionDecision: "deny",
   *   permissionDecisionReason } } shape for its block-symbol-search path.
   *   The schema is verified against the harness by that hook's working behavior.
   *
   * Log file: .claude/logs/subagent-prefix.jsonl
   */

  import { readFileSync, readSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
  import { resolve, dirname, join } from 'node:path';
  import { fileURLToPath } from 'node:url';

  const __filename = fileURLToPath(import.meta.url);
  const REPO_ROOT = resolve(dirname(__filename), '..', '..', '..');
  const PREFIX_DIR = join(REPO_ROOT, 'skills', 'subagent-driven-development', 'prefixes');
  const LOG_FILE = join(REPO_ROOT, '.claude', 'logs', 'subagent-prefix.jsonl');
  const SEPARATOR = '\n\n---\n\n';
  const MARKER_RE = /^\[role:\s*(implementer|spec-reviewer|code-quality-reviewer)\]\s*$/;

  // Emergency disable
  if (process.env.CLAUDE_DISABLE_WORKFLOW_HOOKS) {
    process.exit(0);
  }

  // Read stdin (cross-platform; mirror agent-model-pinning.mjs pattern exactly)
  let rawInput = '';
  try {
    rawInput = readFileSync('/dev/stdin', 'utf8');
  } catch {
    try {
      const buf = [];
      const chunk = Buffer.alloc(65536);
      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          const n = readSync(0, chunk, 0, chunk.length, null);
          if (n === 0) break;
          buf.push(chunk.slice(0, n).toString('utf8'));
        } catch { break; }
      }
      rawInput = buf.join('');
    } catch {
      process.stderr.write('[prefix-hook] malformed input, passing through\n');
      process.exit(0);
    }
  }

  let input;
  try { input = JSON.parse(rawInput); }
  catch {
    process.stderr.write('[prefix-hook] malformed input, passing through\n');
    process.exit(0);
  }

  // Read prompt from top-level (matches agent-model-pinning.mjs schema)
  const prompt = typeof input?.prompt === 'string' ? input.prompt : '';
  if (!prompt) process.exit(0);

  // Find first non-empty line; only inspect THAT line for a marker
  const lines = prompt.split('\n');
  let markerIdx = -1;
  let role = null;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.length === 0) continue;
    const m = trimmed.match(MARKER_RE);
    if (m) { markerIdx = i; role = m[1]; }
    break; // only the first non-empty line is inspected
  }

  if (role === null) process.exit(0);

  // Read prefix file
  const prefixPath = join(PREFIX_DIR, `${role}.md`);
  if (!existsSync(prefixPath)) {
    process.stderr.write(`[prefix-hook] missing prefix file: ${prefixPath}\n`);
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `Subagent prefix file missing: ${prefixPath}. Cannot assemble prompt.`
      }
    }) + '\n');
    process.exit(0);
  }

  const prefixBytes = readFileSync(prefixPath, 'utf8');

  // Parse version from frontmatter
  const versionMatch = prefixBytes.match(/^---\s*\n[\s\S]*?\nversion:\s*(\S+)\s*\n[\s\S]*?\n---/);
  const version = versionMatch ? versionMatch[1] : 'unknown';

  // Strip marker line; keep surrounding content. Preserve leading whitespace before the marker if any.
  const suffix = lines.slice(0, markerIdx).concat(lines.slice(markerIdx + 1)).join('\n').replace(/^\n+/, '');

  // Assemble: full prefix bytes (including frontmatter) + separator + suffix
  const assembled = `${prefixBytes.replace(/\n+$/, '')}${SEPARATOR}${suffix}`;

  // Audit log (failure non-fatal)
  try {
    if (!existsSync(dirname(LOG_FILE))) mkdirSync(dirname(LOG_FILE), { recursive: true });
    appendFileSync(LOG_FILE, JSON.stringify({
      ts: new Date().toISOString(),
      role,
      prefix_version: version,
      suffix_first_60: suffix.slice(0, 60).replace(/\n/g, ' ')
    }) + '\n');
  } catch { /* non-fatal */ }

  // Emit modified input. Build updatedInput by spreading top-level fields and overriding prompt.
  const { ...rest } = input;
  const updatedInput = { ...rest, prompt: assembled };
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      updatedInput
    }
  }) + '\n');
  process.exit(0);
  ```

  > **Note:** The hook reads `input.prompt` from the TOP LEVEL of the parsed JSON, matching `agent-model-pinning.mjs:107` (`const modelSet = input?.model`) and `:119–125` (`input?.[field]` for prompt/description). Do NOT introduce a `tool_input` wrapper — that schema is for non-Agent tool inputs and would silently fail.

- [ ] **Step 2.2b: Make the hook executable** (no-op on Windows, but harmless):

  Run: `Bash chmod +x .claude/hooks/preToolUse/subagent-prefix-prepend.mjs`

- [ ] **Step 2.2c: Register the hook in `.claude/settings.json`.**

  The existing `PreToolUse` array has two matcher blocks — one for `"matcher": "Agent"` (with `agent-model-pinning.mjs`) and one for `"matcher": "Grep|Glob"` (with `graph-tools-enforcement.mjs`). The new hook also fires on Agent dispatches.

  **Append a second hook entry inside the existing `"matcher": "Agent"` block's `hooks` array** (do NOT create a second `Agent` matcher block — same matcher with multiple hooks is the cleaner pattern):

  ```json
  {
    "matcher": "Agent",
    "hooks": [
      {
        "type": "command",
        "command": "node .claude/hooks/preToolUse/agent-model-pinning.mjs",
        "timeout": 5
      },
      {
        "type": "command",
        "command": "node .claude/hooks/preToolUse/subagent-prefix-prepend.mjs",
        "timeout": 5
      }
    ]
  }
  ```

  Both hooks run on every Agent dispatch in the order listed.

### Step 2.3: Write hook tests

- [ ] **Step 2.3a: Create `.claude/hooks/preToolUse/subagent-prefix-prepend.test.mjs`** matching the test pattern in the existing `agent-model-pinning.test.mjs` (which uses `node:test`, spawnSync, and a `runHook(inputObj)` helper). Test input shape mirrors that file: a flat JSON object passed to stdin (e.g., `{ subagent_type: "general-purpose", prompt: "..." }` — no `tool_input` wrapper).

  Test cases:

  1. **implementer marker → prefix prepended (full file bytes including frontmatter).** Input: `{ subagent_type: "general-purpose", prompt: "[role: implementer]\n\nTask 1: foo\n## Task Description\nbar" }`. Expected: `parsed.hookSpecificOutput.updatedInput.prompt` starts with the FULL bytes of `skills/subagent-driven-development/prefixes/implementer.md` (read with `readFileSync(prefixPath, "utf8")` in the test for comparison) — frontmatter included — then a `\n\n---\n\n` separator, then `Task 1: foo\n## Task Description\nbar`. Hook exits 0; `permissionDecision: "allow"`.

  2. **spec-reviewer marker → prefix prepended.** Same shape with `[role: spec-reviewer]`. Assert against `prefixes/spec-reviewer.md` bytes.

  3. **code-quality-reviewer marker → prefix prepended.** Same shape. Assert against `prefixes/code-quality-reviewer.md` bytes.

  4. **No marker, Agent dispatch → pass-through.** Input: `{ subagent_type: "architect", prompt: "Review the plan." }`. Expected: stdout is empty (hook exits 0 without writing). The hook is registered only on Agent matcher, so non-Agent tools never reach it — covered structurally, not in this test.

  5. **Marker present but prefix file missing → deny.** Setup: temporarily rename `prefixes/implementer.md` → `prefixes/implementer.md.bak`. Send case 1 input. Expected: `parsed.hookSpecificOutput.permissionDecision === "deny"` and `permissionDecisionReason` contains the missing path. Teardown: rename back.

  6. **Log line written.** After case 1, `.claude/logs/subagent-prefix.jsonl` contains a line whose JSON parse yields `{ role: "implementer", prefix_version: "1", suffix_first_60: <first 60 chars of suffix>, ts: <ISO string> }`. Strategy: read the log file with `readFileSync` after running case 1, parse the LAST line, assert. No env override or temp path — match the existing test pattern (real path, no cleanup; the log is append-only and tests run against the real path). Note: tests are non-isolating — running them creates real log entries. Acceptable trade-off; matches the existing `agent-model-pinning.test.mjs` convention.

  7. **CLAUDE_DISABLE_WORKFLOW_HOOKS=1 → pass-through.** Pass `{ CLAUDE_DISABLE_WORKFLOW_HOOKS: '1' }` as env override. Send case 1 input. Expected: stdout empty, exit 0, no modification.

  Mirror the assertion style and runner setup of `agent-model-pinning.test.mjs` exactly. Run with `node .claude/hooks/preToolUse/subagent-prefix-prepend.test.mjs`.

- [ ] **Step 2.3b: Run the test suite.**

  Run: `Bash node .claude/hooks/preToolUse/subagent-prefix-prepend.test.mjs`
  Expected: all cases pass (7/7).

  If any fail, debug with `systematic-debugging` per the global rule, fix root cause, re-run.

  > **Note on test ordering:** `node:test` runs `test()` calls sequentially in registration order by default. Case 6 (log-line assertion) runs after case 1 because it's registered later — no concurrency configuration needed. If a future refactor adds `--test-concurrency` flags, case 6 may need explicit ordering.

### Step 2.4: Restructure the three prompt template files

- [ ] **Step 2.4a: Restructure `skills/subagent-driven-development/implementer-prompt.md`** so it documents only the variable-suffix shape, not the methodological content (now in the prefix file). Replace the current file body with:

  ````markdown
  # Implementer Subagent Prompt Template

  Use this template when dispatching an implementer subagent.

  The methodological prefix is auto-prepended by `.claude/hooks/preToolUse/subagent-prefix-prepend.mjs` when the prompt's first non-empty line is `[role: implementer]`. Dispatch authors construct only the variable suffix below — the prefix is stable across dispatches and shows up in the prompt cache.

  ```
  Task tool (general-purpose):
    description: "Implement Task N: [task name]"
    model: <selected per Task Reference Complexity column; A1 frontmatter pinning may override>
    prompt: |
      [role: implementer]

      Task N: [task name]
      **Model:** <chosen-model> — <one-line rationale, e.g. "mechanical: 1 file, clear spec">
      Work from: <directory>

      ## Task Description

      [FULL TEXT of task from plan — paste it here, don't make subagent read file]

      ## Context

      [Scene-setting: where this fits, dependencies, architectural context]

      [Optional: any task-specific guidance, e.g., "this task touches a hook — match existing patterns in .claude/hooks/preToolUse/"]
  ```

  **What the auto-prepended prefix contains** (`prefixes/implementer.md`, version-tracked):
  - Role declaration
  - Before You Begin (ask-before-guessing guidance)
  - Code Organization principles
  - When You're In Over Your Head (escalation criteria)
  - Self-Review checklist (Completeness / Quality / Discipline / Testing)
  - Report Format (Status enum, what to include)

  **Variable suffix authoring rules:**
  - First non-empty line MUST be the marker `[role: implementer]`. The hook strips it.
  - The Plan Anchor block (Task 3 / B2) sits immediately above `Task N:` once that task ships.
  - Everything else is per-task variable content — never methodological.
  ````

- [ ] **Step 2.4b: Restructure `skills/subagent-driven-development/spec-reviewer-prompt.md`** the same way. Replace the file body with:

  ````markdown
  # Spec Compliance Reviewer Prompt Template

  Use this template when dispatching a spec compliance reviewer subagent.

  **Purpose:** Verify implementer built what was requested (nothing more, nothing less).

  The methodological prefix is auto-prepended by `.claude/hooks/preToolUse/subagent-prefix-prepend.mjs` when the prompt's first non-empty line is `[role: spec-reviewer]`. Dispatch authors construct only the variable suffix below.

  ```
  Task tool (general-purpose):
    description: "Review spec compliance for Task N"
    prompt: |
      [role: spec-reviewer]

      ## What Was Requested

      [FULL TEXT of task requirements]

      ## What Implementer Claims They Built

      [From implementer's report]
  ```

  **What the auto-prepended prefix contains** (`prefixes/spec-reviewer.md`, version-tracked):
  - Role declaration
  - "Do Not Trust the Report" verification stance
  - Scope: missing requirements / extra work / misunderstandings
  - Report Format (✅ compliant / ❌ issues with file:line)

  **Variable suffix authoring rules:**
  - First non-empty line MUST be the marker `[role: spec-reviewer]`.
  - Only "What Was Requested" + "What Implementer Claims" go in the suffix.
  ````

- [ ] **Step 2.4c: Restructure `skills/subagent-driven-development/code-quality-reviewer-prompt.md`** similarly:

  ````markdown
  # Code Quality Reviewer Prompt Template

  Use this template when dispatching a code quality reviewer subagent.

  **Purpose:** Verify implementation is well-built (clean, tested, maintainable).

  **Only dispatch after spec compliance review passes.**

  The methodological prefix is auto-prepended by `.claude/hooks/preToolUse/subagent-prefix-prepend.mjs` when the prompt's first non-empty line is `[role: code-quality-reviewer]`. Dispatch authors construct only the variable suffix below.

  **Dispatch contract:** Use the Agent tool (subagent_type as appropriate for code review in the current repo's plugin set — e.g., `general-purpose` or a code-reviewer subagent). The `[role: ...]` marker MUST be the first non-empty line of the `prompt` parameter — anything before it (template references, comments) breaks the hook's marker detection.

  ```
  Agent dispatch:
    subagent_type: <code-reviewer agent>
    prompt: |
      [role: code-quality-reviewer]

      Use template at requesting-code-review/code-reviewer.md

      WHAT_WAS_IMPLEMENTED: [from implementer's report]
      PLAN_OR_REQUIREMENTS: Task N from [plan-file]
      BASE_SHA: [commit before task]
      HEAD_SHA: [current commit]
      DESCRIPTION: [task summary]
  ```

  **What the auto-prepended prefix contains** (`prefixes/code-quality-reviewer.md`, version-tracked):
  - Role declaration
  - In-addition-to-standard checks (file responsibility, decomposition, plan structure adherence, change-bounded file size)
  - Report Format (Strengths / Issues / Assessment)

  **Variable suffix authoring rules:**
  - First non-empty line MUST be the marker `[role: code-quality-reviewer]`. Anything before the marker (including the legacy `Task tool (superpowers:code-reviewer):` directive, if used) blocks the hook from firing.
  - The `Use template at requesting-code-review/code-reviewer.md` reference goes INSIDE the prompt (after the marker) as a directive to the subagent, not before the marker as a meta-comment.
  - Only the per-task SHA range and task identifier go in the suffix below the template reference.
  ````

### Step 2.5: Document the marker convention + hook in SKILL.md

- [ ] **Step 2.5: Add a new "Prompt Templates and Auto-Prepended Prefixes" section** to `skills/subagent-driven-development/SKILL.md`, replacing the current "## Prompt Templates" section.

  Run: `Grep "^## Prompt Templates" skills/subagent-driven-development/SKILL.md -n` to confirm the current line position before editing. Replace the section's body (heading + the three bullet links to template files) with:

  ```markdown
  ## Prompt Templates and Auto-Prepended Prefixes

  Each role has two artifacts:

  | Role | Prefix file (auto-prepended) | Variable-suffix template |
  |---|---|---|
  | Implementer | `./prefixes/implementer.md` | `./implementer-prompt.md` |
  | Spec reviewer | `./prefixes/spec-reviewer.md` | `./spec-reviewer-prompt.md` |
  | Code quality reviewer | `./prefixes/code-quality-reviewer.md` | `./code-quality-reviewer-prompt.md` |

  The `.claude/hooks/preToolUse/subagent-prefix-prepend.mjs` hook detects a `[role: <name>]` marker on the first non-empty line of the prompt parameter, reads the matching prefix file byte-for-byte, and prepends it (with a `---` separator) before the dispatch lands.

  **Why:** byte-identical prefix bytes across same-role dispatches yield automatic prompt-cache hits (cache-read = 0.1× input cost). Mid-session edits to a prefix file change its bytes; the next dispatch caches a new prefix. Visible — each prefix file carries a `version:` field in frontmatter; the hook logs `(role, prefix_version, suffix_first_60_chars)` per dispatch to `.claude/logs/subagent-prefix.jsonl` so cache invalidation is auditable.

  **Authoring discipline:** when constructing a dispatch prompt, write only the variable suffix following the role's prompt-template file. The first non-empty line must be the marker. The hook does the rest. Do NOT paste the methodological prefix manually — that would defeat the point of the hook (orchestrator drift was the original failure mode).

  **Rollback:** `CLAUDE_DISABLE_WORKFLOW_HOOKS=1` disables the hook (along with all other workflow hooks).
  ```

### Step 2.6: Commit

- [ ] **Step 2.6: Commit Task 2.**

  ```
  Skill { skill: "git-manager", args: "commit files: [skills/subagent-driven-development/prefixes/implementer.md, skills/subagent-driven-development/prefixes/spec-reviewer.md, skills/subagent-driven-development/prefixes/code-quality-reviewer.md, .claude/hooks/preToolUse/subagent-prefix-prepend.mjs, .claude/hooks/preToolUse/subagent-prefix-prepend.test.mjs, .claude/settings.json, skills/subagent-driven-development/SKILL.md, skills/subagent-driven-development/implementer-prompt.md, skills/subagent-driven-development/spec-reviewer-prompt.md, skills/subagent-driven-development/code-quality-reviewer-prompt.md] type: feat description: 'add canonical role-prefix files + auto-prepend PreToolUse hook (B3)'" }
  ```

---

## Task 3: B2 — Re-anchoring block in variable suffix

**Files:**
- Modify: `skills/subagent-driven-development/SKILL.md` (add Plan Anchor format documentation)
- Modify: `skills/subagent-driven-development/implementer-prompt.md` (insert Plan Anchor in the variable suffix structure)

**No tests** — documentation change. Verification = artifact inspection (Plan Anchor section appears in skill body; implementer-prompt template includes the anchor block).

- [ ] **Step 3.1: Add a "Plan Anchor (re-anchoring block)" section** to `skills/subagent-driven-development/SKILL.md`. Place it immediately AFTER the "Prompt Templates and Auto-Prepended Prefixes" section added in Task 2. Content:

  ````markdown
  ## Plan Anchor (re-anchoring block)

  Counters orchestrator and implementer drift across long sessions. The orchestrator authors a small (~60–80 token) anchor block and prepends it to the variable suffix of every implementer dispatch. Reviewers don't get one — they're short-lived and narrow-scoped.

  **Block format:**

  ```
  ## Plan Anchor
  Plan goal: <one sentence from plan doc Context section>
  This task's contribution: <one sentence on why this task exists>
  Recent completed tasks (last 3–5): <task IDs + one-line names, no summaries>
  ```

  **Position:** First block of the variable suffix, immediately after the `[role: implementer]` marker line, before the `Task N:` line. The implementer reads "what's the goal" before "what's the task," matching how a human briefs a colleague.

  **Author:** Orchestrator (this skill / this context). Re-read the plan doc's Context section before each implementer dispatch — the re-read is itself part of B2 and counters orchestrator-level drift.

  **Sizing rule (anti-bloat):**
  - Recent completed tasks list: cap at the last 3–5 tasks; digest format only (IDs + one-line names, never per-task summaries).
  - Older completed tasks decay in salience and don't earn a slot.
  - Total anchor token budget: ~60 tokens typical, ~80–100 even on plans with 20+ completed tasks.

  **Scope:** Implementer dispatches only. Spec-reviewer and code-quality-reviewer dispatches do NOT get an anchor.
  ````

- [ ] **Step 3.2: Update `skills/subagent-driven-development/implementer-prompt.md`** (touched in Task 2) to insert the Plan Anchor block in the variable-suffix structure.

  **Edit 1 — example prompt body.** Find the example block in the file. The Task 2 version contains these lines:

  ```
        [role: implementer]

        Task N: [task name]
  ```

  Replace those three lines (preserving the indentation) with:

  ```
        [role: implementer]

        ## Plan Anchor
        Plan goal: <one sentence from plan doc Context section>
        This task's contribution: <one sentence on why this task exists>
        Recent completed tasks (last 3–5): <task IDs + one-line names>

        Task N: [task name]
  ```

  **Edit 2 — Variable suffix authoring rules bullet.** Find the existing bullet (written by Task 2):

  > - The Plan Anchor block (Task 3 / B2) sits immediately above `Task N:` once that task ships.

  Replace with:

  > - The Plan Anchor block sits immediately above `Task N:`. Cap at last 3–5 completed tasks; digest only (IDs + one-line names, never per-task summaries). Authored by the orchestrator from the plan doc's Context section.

- [ ] **Step 3.3: Commit.**

  ```
  Skill { skill: "git-manager", args: "commit files: [skills/subagent-driven-development/SKILL.md, skills/subagent-driven-development/implementer-prompt.md] type: feat description: 'add Plan Anchor re-anchoring block to implementer dispatches (B2)'" }
  ```

---

## Task 4: B4 — Sharpened reviewer prompts

**Files:**
- Modify: `skills/subagent-driven-development/prefixes/spec-reviewer.md` (rewrite content; bump version)
- Modify: `skills/subagent-driven-development/prefixes/code-quality-reviewer.md` (rewrite content; bump version)
- Possibly modify: `skills/subagent-driven-development/spec-reviewer-prompt.md`, `code-quality-reviewer-prompt.md` (only if suffix structure needs aligning)

**No tests** — content rewrite. Verification = artifact inspection (the rewritten prefix files contain positive narrow scope, concrete out-of-lane example, and pass condition per design doc §6).

- [ ] **Step 4.1: Rewrite `skills/subagent-driven-development/prefixes/spec-reviewer.md`.** Bump version from `1` to `2` and replace body with sharpened framing per design doc §6 ("Spec-reviewer scope"):

  ```markdown
  ---
  role: spec-reviewer
  version: 2
  ---

  You are reviewing whether an implementation matches its specification — and ONLY that.

  ## You check ONLY:

  - **Completeness against the spec.** Every requirement listed actually implemented?
  - **Missing requirements.** Anything in the spec that the implementer didn't address?
  - **Over-build.** Anything the implementer built that wasn't requested? Extra features, "nice to haves," gold-plating?
  - **Misunderstandings.** Did the implementer interpret a requirement differently than intended? Solve the wrong problem?

  Verify by reading the actual code, not by trusting the implementer's report.

  ## What's NOT your lane

  If you find yourself reasoning about whether the code is well-structured, well-tested, or maintainable — **that's the code-quality reviewer's lane.** Note your observations as a flag for them to investigate; do NOT gate on those concerns. Pass-through if the spec is met, even if you have quality concerns.

  *Concrete example:* The implementer added a feature using a single 200-line function instead of decomposing it. If the function meets the spec, that's a pass for spec compliance. The 200-line function is code-quality's problem, not yours.

  ## Pass condition

  Every spec requirement implemented. No extra features beyond spec. Implementer's interpretation matches intent.

  ## Report Format

  - ✅ **Spec compliant** if every requirement is met and nothing extra was added.
  - ❌ **Issues found:** list specifically what's missing or extra, with `file:line` references. Separate "missing" from "extra" so the implementer knows what to add vs. remove.
  - 📌 **Out-of-lane flags** (optional): observations for the code-quality reviewer. These do NOT gate.
  ```

- [ ] **Step 4.2: Rewrite `skills/subagent-driven-development/prefixes/code-quality-reviewer.md`.** Bump version from `1` to `2` and replace body with sharpened framing per design doc §6 ("Code-quality-reviewer scope"):

  ```markdown
  ---
  role: code-quality-reviewer
  version: 2
  ---

  You are reviewing implementation quality after spec compliance has passed and tests pass — and ONLY quality. Test passing means correctness for today's behavior is established. Your job is forward-looking: will this code cause problems later?

  ## You check ONLY:

  - **File responsibility & interfaces.** Does each file have one clear responsibility with a well-defined interface? Are the boundaries between units clean?
  - **Future maintainability.** Will another developer (or another agent) be able to understand this in three months without reading every internal detail? Are names accurate? Is the structure transparent?
  - **Test coverage and assertion quality.** Do the tests actually verify behavior (not mock behavior)? Are the assertions meaningful, or do they trivially pass?
  - **Structural debt this change introduced.** Did this implementation grow an existing file beyond its intent, or introduce coupling that will be expensive to undo?

  ## What's NOT your lane

  If a function appears to behave correctly but you suspect the spec was misinterpreted — **that's the spec reviewer's lane.** Pass-through. If tests pass and the code looks ugly but works, focus on whether the ugliness will cause future bugs, not on whether tests should've caught it. Don't re-litigate correctness; tests already established it.

  *Concrete example:* The implementer added a feature that passes its tests but uses a global mutable variable for state. The feature works today. Your job: flag the global as future-bug fragility (next change will hit it). Do NOT flag it as "this might not actually behave correctly" — tests cover that.

  Don't flag pre-existing file sizes — focus on what THIS change contributed.

  ## Pass condition

  Code is structured for future maintenance. Tests verify behavior, not mocks. No significant structural debt introduced by this change.

  ## Report Format

  - **Strengths:** what this implementation got right (clean decomposition, meaningful tests, etc.).
  - **Issues:** Critical / Important / Minor. For each, explain WHY it's a future-bug risk or maintenance burden, with `file:line`.
  - **Assessment:** Approved / Approved-with-followups / Issues require fix.
  ```

- [ ] **Step 4.3: Verify the variable-suffix templates still align.**

  Run: `Read skills/subagent-driven-development/spec-reviewer-prompt.md` and `Read skills/subagent-driven-development/code-quality-reviewer-prompt.md`.

  Check: nothing in the variable suffix conflicts with the new prefix scope. The suffix templates set up only "What Was Requested" / "What Implementer Claims" (for spec) or SHA range (for code-quality). No conflict expected — but if the suffix mentions any responsibility now exclusively in the prefix's "you check ONLY" list, edit it out.

  If no edits needed, skip to Step 4.4.

- [ ] **Step 4.4: Commit.**

  ```
  Skill { skill: "git-manager", args: "commit files: [skills/subagent-driven-development/prefixes/spec-reviewer.md, skills/subagent-driven-development/prefixes/code-quality-reviewer.md] type: feat description: 'sharpen reviewer role boundaries with positive narrow scope (B4)'" }
  ```

  (Add the prompt-template files to the commit only if Step 4.3 changed them.)

---

## Testing Plan

### Unit Tests

Task 2 is the only task with testable automated behavior. The plan specifies 7 test cases for `.claude/hooks/preToolUse/subagent-prefix-prepend.test.mjs`. All are write-new — no existing test covers this hook.

- [ ] **Case 1 — implementer marker, prefix prepended.** Input: flat JSON `{ subagent_type: "general-purpose", prompt: "[role: implementer]\n\nTask 1: foo\n## Task Description\nbar" }`. Assert `hookSpecificOutput.permissionDecision === "allow"`, `updatedInput.prompt` starts with full bytes of `prefixes/implementer.md` (read via `readFileSync` in-test for comparison), followed by `\n\n---\n\n` separator, then the suffix with the marker line stripped. Write new.

- [ ] **Case 2 — spec-reviewer marker, prefix prepended.** Same shape with `[role: spec-reviewer]`. Assert against `prefixes/spec-reviewer.md` bytes. Write new.

- [ ] **Case 3 — code-quality-reviewer marker, prefix prepended.** Same shape. Assert against `prefixes/code-quality-reviewer.md` bytes. Write new.

- [ ] **Case 4 — no marker, Agent dispatch, pass-through.** Input: `{ subagent_type: "architect", prompt: "Review the plan." }`. Assert stdout is empty, exit 0. Write new.

- [ ] **Case 5 — marker present, prefix file missing, deny.** Temporarily rename `prefixes/implementer.md` to `.bak`. Send case-1 input. Assert `permissionDecision === "deny"` and `permissionDecisionReason` contains the missing file path. Restore file in teardown (use try/finally to guarantee cleanup even on test failure). Write new.

- [ ] **Case 6 — log line written.** After case 1 completes, read `.claude/logs/subagent-prefix.jsonl`, parse the last line, assert it contains `{ role: "implementer", prefix_version: "1", suffix_first_60: <first 60 chars>, ts: <ISO string> }`. Note: tests are non-isolating; log entries persist across runs — this matches the `agent-model-pinning.test.mjs` convention. Write new.

- [ ] **Case 7 — CLAUDE_DISABLE_WORKFLOW_HOOKS=1, pass-through.** Pass env override `{ CLAUDE_DISABLE_WORKFLOW_HOOKS: "1" }`. Send case-1 input. Assert stdout empty, exit 0. Write new.

Run with: `node .claude/hooks/preToolUse/subagent-prefix-prepend.test.mjs`

All 7 cases must pass before the Task 2 commit is made.

### Manual Verification Steps

**Task 1 (B1 — Complexity column):**
- [ ] Open `skills/subagent-driven-development/SKILL.md` and confirm the Model Selection section contains the Complexity column, the "Source of complexity" paragraph referencing the Task Reference table, and the "Frontmatter pinning wins" paragraph mentioning `agent-model-pinning.mjs`.
- [ ] Open `skills/writing-plans/SKILL.md` and confirm the Task Reference example table header includes `Complexity` between `Size` and `Scope`, with an accompanying note explaining S/M/L → model mapping.
- [ ] Open `rules/planning.md` and confirm the Task Reference columns list reads `#, Task, Size, Complexity, Scope, Jira Key` with the independence note.
- [ ] Confirm the three files' treatments of Complexity are consistent (same S → Haiku, M → Sonnet, L → Opus mapping) — no silent disagreement.

**Task 2 (B3 — prefix files + hook):**
- [ ] Confirm `.claude/hooks/preToolUse/subagent-prefix-prepend.mjs` is registered in `.claude/settings.json` inside the existing `"matcher": "Agent"` block's `hooks` array (not as a second `Agent` matcher block).
- [ ] Confirm the three prefix files exist under `skills/subagent-driven-development/prefixes/` and each contains valid frontmatter with `role:` and `version: 1`.
- [ ] Confirm each restructured prompt template (`implementer-prompt.md`, `spec-reviewer-prompt.md`, `code-quality-reviewer-prompt.md`) documents only the variable-suffix shape — no duplicated methodological content that now lives in the prefix files.
- [ ] Confirm `SKILL.md` now contains a "Prompt Templates and Auto-Prepended Prefixes" section with the role → prefix → variable-suffix table.

**Task 3 (B2 — re-anchoring block):**
- [ ] Confirm `SKILL.md` contains a "Plan Anchor (re-anchoring block)" section placed after the prefix section, with the block format, position rule, sizing rule (3–5 tasks, cap at ~80–100 tokens), and scope rule (implementer dispatches only).
- [ ] Confirm `implementer-prompt.md`'s example prompt body shows the `## Plan Anchor` block between the `[role: implementer]` marker and the `Task N:` line.

**Task 4 (B4 — sharpened reviewer prompts):**
- [ ] Open `prefixes/spec-reviewer.md` — confirm version is `2`, body contains a "You check ONLY" list, a "What's NOT your lane" section with the 200-line-function concrete example, a Pass condition, and a Report Format that includes the `📌 Out-of-lane flags` item.
- [ ] Open `prefixes/code-quality-reviewer.md` — confirm version is `2`, body contains a "You check ONLY" list, a "What's NOT your lane" section with the global-mutable-variable concrete example, a Pass condition, and a Report Format with Strengths / Issues (Critical/Important/Minor) / Assessment.
- [ ] Confirm neither file's "you check ONLY" scope overlaps with the other (spec = completeness/over-build/misunderstanding; quality = maintainability/structure/tests) — no scenario handled by both.

### Log Monitoring Notes

- During first live use of the hook, check `.claude/logs/subagent-prefix.jsonl` after an implementer dispatch to confirm `prefix_version` matches the version field in the prefix file. A version mismatch indicates the log entry is reading a cached or old prefix file.
- If a dispatch is denied with "Subagent prefix file missing," check that `skills/subagent-driven-development/prefixes/` is present in the working tree — this would indicate a deployment gap, not a code bug.
- Tasks 1, 3, and 4 are documentation-only changes with no runtime failure modes to monitor.

### Test Conventions

- Test file naming: `<hook-name>.test.mjs` co-located with the hook in `.claude/hooks/preToolUse/`
- Assertion style: `node:assert/strict` with `assert.equal`, `assert.ok`, `assert.notEqual`
- Test structure: flat `test()` calls (no describe blocks), sequential registration order
- `runHook(inputObj, envOverrides)` helper: `spawnSync('node', [HOOK_PATH], { input: JSON.stringify(inputObj), encoding: 'utf8', env: { ...process.env, ...envOverrides }, timeout: 10_000 })`
- Input schema: flat JSON object at top level (`{ subagent_type, prompt, description, model }`) — no `tool_input` wrapper
- Output assertion: parse `JSON.parse(stdout)` then walk `hookSpecificOutput.permissionDecision` / `hookSpecificOutput.updatedInput`
- Pass-through assertion: `assert.equal(stdout.trim(), '')` — empty stdout means the hook exited without emitting
- Run command: `node .claude/hooks/preToolUse/subagent-prefix-prepend.test.mjs`

---

## Closure path

When all 4 tasks are ✅:

1. Invoke `plan-management:close-subplan` with `closeout-summary` / `closeout-decisions` / `closeout-gotchas`. Skill atomically: appends a `[subplan-close]` journal entry to the parent journal, marks the parent task corresponding to this sub-plan ✅ (the spawn-subplan task; close-subplan resolves the linkage from `.claude/active-plan`), refreshes the parent handoff, and reverts `.claude/active-plan` to the parent plan.
2. **Verify parent plan is fully complete before invoking the parent terminal close.** Read `plans/orchestrator-routing-v2/orchestrator-routing-v2-plan.md`'s Task Reference table — every row must be ✅. The parent's status snapshot at the time this sub-plan was spawned showed Tasks 1–10 already ✅, so this is expected to pass; if any parent task regressed to non-✅ during sub-plan execution, surface the discrepancy to the user before proceeding.
3. Run `plan-management:close-subplan` (terminal-state path) on the parent — clears `.claude/active-plan`, sets parent handoff Status to "All tasks complete; awaiting closeout."
4. Run `finishing-a-development-branch` to open the PR.
5. GitHub issue closure pass per parent plan's Issue → Task Mapping table.

---

## References

- [Design doc — §2 architecture, §3–§6 per-piece detail, §7 sequencing rationale, §8 risks, §9 verification, Research Appendix](./tier2-subagent-driven-dev-v2-design.md)
- Parent plan: `plans/orchestrator-routing-v2/orchestrator-routing-v2-plan.md`
- Form A sub-plan rule: `rules/plan-docs.md` §Sub-Plans
- Existing hook pattern reference: `.claude/hooks/preToolUse/agent-model-pinning.mjs` (A1's hook — same input/output schema)
