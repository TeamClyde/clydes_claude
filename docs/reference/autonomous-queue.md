# Autonomous Work Queue

Durable state for the scheduled backlog worker. The repository is the only
storage that survives between fires (each run is a fresh container), so this
file is both the work list and the resume mechanism.

**Design:** `plans/autonomous-backlog-scheduling/autonomous-backlog-scheduling-design.md`
**Run ledger:** `docs/reference/autonomous-run-ledger.md`
**Quality ledger:** `docs/reference/autonomous-quality-review.md`

## Rules a run must follow

1. **Claim before working.** The first action after reading this file is
   committing `pending` → `in-progress` with the run ID. That commit is the lock.
2. **`done-when` is always an executable command plus an expected exit code.**
   Never a prose claim. A row whose success cannot be expressed as a command is
   not scoped tightly enough for unattended work.
3. **Weight budget is 2 per fire.** Two weight-1 rows may batch. A weight-2 or
   weight-3 row may only be taken as the *first* row of a fire, and then the
   fire stops — those rows own the whole fire.
4. **`attempts` increments only on a GATE failure.** Never on a resource-driven
   release (limit, watchdog, context exhaustion). At `attempts` = 2 the row flips
   to `blocked`. Counting a resource abort would drive a healthy row to `blocked`
   after two unlucky fires and silently discard real work.
5. **`deferrals` increments when a constrained fire skips this row** for a
   cheaper one. At `deferrals` >= 3 the row is forced to the front of the next
   unconstrained fire and reported under `[ATTENTION]` in the daily mail.
6. **`base` defaults to `main`.** Rows that fix defects living on an unmerged
   branch must name that branch — on `main` the code does not exist.
7. **Nothing merges.** Output is a PR whose body carries `Closes #N`.

## Status values

`pending` · `in-progress` · `done` · `blocked`

## Queue

| id | issues | weight | base | status | attempts | deferrals | files | done-when | decide |
|----|--------|--------|------|--------|----------|-----------|-------|-----------|--------|
| q001 | 116 | 1 | main | done | 0 | 0 | `skills/docs-refresh/SKILL.md` | `grep -q '^allowed-tools:.*Agent' skills/docs-refresh/SKILL.md` → 0 **and** `grep -q '^allowed-tools:.*Task' skills/docs-refresh/SKILL.md` → 1 | yes |
| q002 | 113, 151 | 3 | `fix/verify-chunking` | pending | 0 | 0 | `scripts/lib/verify.mjs`, `scripts/lib/verify.test.mjs` | `npm test` → 0 | yes |
| q003 | 144 | 2 | `chore/refresh-reference-artifacts` | pending | 0 | 0 | `README.md` | `npm run harvest:check` → 0 | yes |

### Row notes

- **q001** — the Wave-0 proof unit. `skills/docs-refresh/SKILL.md:4` grants `Task`,
  which is not a tool in this environment; the tool is `Agent`, as the skill's own
  body says at `:58`, and as all 43 other skills use. Two-sided assertion: `Agent`
  present **and** `Task` absent. The second `grep` is expected to exit **1** —
  that non-zero exit is the pass condition.
  Shipped by run `run-20260730T053122Z` (2026-07-30T05:31:22Z) on branch
  `fix/docs-refresh-agent-tool-116` as PR #164. Evidence in the run ledger.
- **q002** — #113 and #151 are defects *in* `fix/verify-chunking` (pushed, green at
  `a388254`, unmerged). Base must be that branch; on `main` the code does not exist.
  Five issues touch `verify.mjs`, so these are serialized as one solo row.
- **q003** — `harvest:check` cannot pass on `main` while PR #111 is unmerged.
  Adding the README counts to #111's branch completes that PR rather than
  conflicting with it.

**Why only three rows.** q001 is the Wave-0 proof unit. q002 and q003 are seeded now — ahead of
their waves — for one reason only: they are the two rows in the whole backlog that need a
**non-default `base`**, and recording that here is what stops a later fire from branching them
off `main`, where their code either does not exist (#113/#151) or cannot pass (#144). No fire
will pick them up, because the worker routine does not exist yet.

The remaining Wave 1–4 rows are added only after the proof unit produces a real PR. That
includes #114 and #148 — the two Wave-0 siblings not chosen as the proof unit.
