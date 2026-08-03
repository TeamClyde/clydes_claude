# Autonomous Quality Review

Answers a different question from the run ledger: **did the work matter.**
Written daily by a reviewer that did **not** write the code it judges — an
external oracle. Validation at one pipeline stage cannot reliably catch errors
introduced at an earlier stage, so the reviewer's independence is structural,
not cosmetic.

Reviewed **per PR**, never as a day-aggregate: a day of concatenated diffs is
the too-large-for-one-pass problem, and review quality degrades past roughly
1000 LOC.

Rubric, applied to each PR opened that day:

1. Does the diff actually address the linked issue *as stated*?
2. Improvement, **neutral churn**, or regression?
3. Anything broken or risked that the row's `done-when` would not catch?

`neutral churn` is a first-class verdict. For the `writing-*` cluster especially,
the real question is whether behavior changed at all.

The reviewer may also flag a unit whose `done-when` was simply the **wrong
assertion** — that gap between the two ledgers is the point of keeping them apart.

| Date | PR | Issue(s) | Addresses issue? | Verdict | Uncaught risk | Notes |
|------|----|----------|------------------|---------|---------------|-------|
| 2026-07-30 | [#162](https://github.com/TeamClyde/clydes_claude/pull/162) | 161 (part) | Partly, by declaration — covers #161's *second* problem (committed `.claude/` symlinks) and explicitly defers the prerequisite tiering to #163. Does not claim to close it. | `IMPROVEMENT` | The PR's own load-bearing assumption was untested locally; Step 2.1 `rm -f`s before it relinks. | ~750 of 825 changed lines are cspell re-sort churn. |
| 2026-07-30 | [#163](https://github.com/TeamClyde/clydes_claude/pull/163) | 160, 161 | Yes, both, as stated. | `IMPROVEMENT` | Test discovery is *narrower* than what it replaced; `setup.sh` has no automated test. | Three unrelated changes plus the queue scaffolds in one PR. |
| 2026-07-30 | [#164](https://github.com/TeamClyde/clydes_claude/pull/164) | 116 | Yes, exactly and only — one frontmatter token, nothing else in the file. | `IMPROVEMENT` (narrow) | **The `done-when` asserts the file's own text, not the behaviour the issue is about.** Separately, the queue lock never reached `main`. | First autonomous unit. Architect gate skipped on weight-1. |
| 2026-07-31 | _(none opened)_ | — | n/a — no PR was opened in the window | _no verdict_ | n/a | **No worker fire observed in 24h.** Nothing to review. See detail. |
| 2026-08-01 | _(none opened)_ | — | n/a — no PR was opened in the window | _no verdict_ | n/a | **Second consecutive day with no worker fire.** PR #164 now unmerged 56h. See detail. |
| 2026-08-02 | _(none opened)_ | — | n/a — no PR was opened in the window | _no verdict_ | n/a | **Third consecutive day with no worker fire.** PR #164 now unmerged ~80h. Pipeline is deadlocked, not slow. See detail. |
| 2026-08-03 | _(none opened)_ | — | n/a — no PR was opened in the window | _no verdict_ | n/a | **Fourth consecutive day with no worker fire.** PR #164 now unmerged ~105h. The only commits on `main` in four days are this review job's own. See detail. |

**Verdict values:** `IMPROVEMENT` · `NEUTRAL CHURN` · `REGRESSION`

---

## 2026-07-30 — detail

Reviewed one PR at a time, oldest first. No diff was read in aggregate.

### PR #162 — commit `.claude` symlinks + Windows materialisation guard

Mechanically correct and load-bearing. `git ls-files -s` confirms both entries
land as mode `120000` on `main`, so a fresh clone receives real symlinks.

**The unverified assumption is now settled — positively.** #162 merged ahead of
the rest of Wave −1 for one reason: nothing local could prove Claude Code
resolves a skill or agent through a symlinked *parent* `.claude/` directory, and
a negative answer would have forced relocating ~287 references. This review ran
in a fresh cloud sandbox, and `architect`, `git-manager`, `plan-gate`,
`test-runner` and the rest of this repo's components all resolved. The probe the
PR was opened to enable has returned: the approach works.

**Sharp edge the `done-when` would not catch.** Step 2.1 does `rm -f "$_link"`
*before* calling `make_symlink`. If the relink fails, the entry is gone —
neither symlink nor file — and recovery depends on the operator reading the
warn text and running `git checkout`. A guard whose stated purpose is that it
"can never destroy existing work" has one path that leaves the tree worse than
it found it. Low severity (the content is in git), but the ordering is
avoidable.

The dictionary re-sort is disclosed, not hidden — but it means the diff cannot
practically be reviewed by inspection, which is the failure mode that let the
`|| true` defect through in the sibling PR.

### PR #163 — portable test runner + tiered prerequisites

The diagnosis in both halves is measured rather than inferred, and the
`check_optional` / `set -e` defect the author caught by *running* the script —
not by reading it — is the most reassuring thing in the day's output.

**Uncaught risk 1 — discovery narrowed, and it can only fail silently.**
`run-tests.mjs` matches `*.test.mjs` only. Node 20's built-in directory scan,
which this replaces, also picked up `*-test.mjs`, `test.mjs`, and files under a
`test/` directory. A test added under any of those names is now skipped and
`npm test` still exits **0** — an undiscovered test makes the suite *greener*,
so no exit-code `done-when` can ever detect it. All 18 current files match, so
nothing is lost today; the risk is entirely forward-looking. Worth having the
runner assert a floor on the discovered-file count.

**Uncaught risk 2 — `setup.sh` remains untested.** The tiering was verified by a
hand-built shadow-PATH run described in prose. That procedure is not in the
repo, so no later fire can reproduce it, and the next edit to Step 1 gets no
signal at all. Given that a missed guard aborts *later* under `set -e`, this is
the highest-value missing test in the repo.

**Minor.** The `codebase-memory-mcp` install still shells out to `curl … | bash`
with no `HAVE_*` flag. It degrades safely — the call sits in an `if` condition,
so `set -e` is suppressed and a missing `curl` only warns — but `curl` is now
the one external dependency the tiering does not account for.

### PR #164 — `Task` → `Agent` in docs-refresh frontmatter

The diff is exactly what #116 asked for and touches nothing else. Verified
against the branch: `^allowed-tools:.*Agent` matches, `^allowed-tools:.*Task`
does not. The ledger's recorded exit codes are genuine.

**The `done-when` is the wrong assertion.** Both greps interrogate the file's
own text, so the edit that changes the token is the same act that satisfies the
check — it cannot fail for the reason the issue exists. Nothing here
demonstrates the claim in #116 that the `Task` grant was *inert* and produced a
permission prompt, nor that `Agent` removes one. The `npm test` → 0 in the
ledger covers no code path a markdown frontmatter edit can reach. The change is
still right, on consistency grounds (43 sibling skills, the skill's own body at
`:58`), and it is strictly safer than the status quo — hence `IMPROVEMENT`, not
`NEUTRAL CHURN`. But the evidence is for the token, not the behaviour, and this
is precisely the gap this ledger exists to record.

**The process finding is larger than the diff.** Queue Rule 1 makes the
`pending → in-progress` commit the lock. This run recorded that commit on the
feature branch, because `git-manager` requires human confirmation before pushing
to a protected branch and the run was unattended. The PR discloses this. The
consequences are real and unresolved:

- Until #164 merges, `main` shows `q001` as `pending` and the run ledger empty.
  A concurrent fire would re-claim work that is already done.
- A daily review reading `main` sees zero shipped units and an empty ledger —
  a real run is indistinguishable from a stall. This review only avoided that
  by reading open PRs rather than trusting the committed state.

The queue design needs an explicit answer for how an unattended run writes its
lock to `main`.

**Also stale:** the queue file's closing note still says "No fire will pick them
up, because the worker routine does not exist yet." A fire ran at 05:31Z and
shipped `q001`, so that sentence no longer holds.

### Could not assess

- Whether `Task` was genuinely non-functional as an alias, or whether
  docs-refresh actually hit a permission prompt before #164. Both are asserted
  in #116 and neither is tested; confirming would mean invoking the skill.
- Whether `setup.sh`'s tiering behaves as claimed on Windows/MSYS. No Windows
  host was available, and the Step 2.1 guard's whole purpose is a
  Windows-specific checkout mode.
- The `decide` column in the queue table is not defined in the file's own Rules
  section. All three rows read `yes`; the semantics are unknown to this reviewer.

---

## 2026-07-31 — detail

**No pull request was opened in the review window** (2026-07-30T14:11Z →
2026-07-31T14:11Z). Part 1 therefore has no diff to judge. The absence is the
finding, and it is recorded here rather than left as a silent gap, because an
empty review section and a clean review section must not look alike.

Confirmed rather than assumed:

- `search_pull_requests … created:>=2026-07-29` returns exactly three PRs —
  #162, #163, #164 — all opened on 2026-07-30 before 05:34Z and all already
  reviewed in the 2026-07-30 entry above. The newest, #164, was opened at
  05:33Z, roughly **33 hours** before this review.
- `git log --since='24 hours ago'` on `main` returns exactly one commit,
  `ee91420` at 2026-07-30T14:14Z — this review job's own commit from
  yesterday. No worker commit exists in the window.
- No new remote branch appeared. The six heads on `origin` are unchanged from
  yesterday.

### The pipeline is blocked on a human merge, not on work

PR #164 — the only output the autonomous worker has ever produced — has been
**open and unmerged for 33 hours**, last updated 2026-07-30T05:34Z. Everything
downstream follows from that:

1. **`main` still says nothing has been done.** The queue lock, the `q001` →
   `done` transition, and the run-ledger entry all live on
   `fix/docs-refresh-agent-tool-116`. On `main`, `q001` reads `pending` and the
   ledger reads `_(no entries yet)_`. The ledger row on the branch is sound —
   verbatim commands and real exit codes, exactly as the ledger's own rule
   demands — but it is not on the authoritative branch.
2. **The next fire would redo finished work.** A fire reading `main` sees
   `q001` as the only weight-1 row and would re-claim it. Yesterday's review
   predicted this precise outcome; 24 hours later it is still true.
3. **The queue was never expanded.** The queue file gates Wave 1–4 rows on the
   proof unit "produc[ing] a real PR." It has produced one — but because that
   PR is unmerged, `main` carries no evidence of it, and the three seed rows
   are all that remain.

This was the risk flagged at the end of the 2026-07-30 entry: *"a real run is
indistinguishable from a stall."* Today the two have converged — there is both
an unmerged real run **and** a stall, and only reading open PRs separates them.

### Could not assess

- **Whether a fire was attempted in the last 24 hours and aborted, or was never
  scheduled at all.** These are indistinguishable from the repository. There is
  no `.github/workflows/`, so the worker is an external scheduled task that
  leaves no trace on `main`; and by the queue's own design a resource-driven
  `released` row is written to a feature branch, never to `main`. An aborted
  fire and an absent fire produce byte-identical repository state. This is an
  observability gap in the design, not an artefact of this review.
- **The design doc the queue file cites**
  (`plans/autonomous-backlog-scheduling/autonomous-backlog-scheduling-design.md`)
  does not exist on `main`, so the queue's stated rationale cannot be checked
  against its source.

---

## 2026-08-01 — detail

**No pull request was opened in the review window** (2026-07-31T14:10Z →
2026-08-01T14:10Z). Part 1 again has no diff to judge. This is the **second
consecutive empty day**, which changes what the absence means: one quiet day is
noise, two is a pattern.

Confirmed rather than assumed:

- `search_pull_requests … repo:TeamClyde/clydes_claude is:pr created:>=2026-07-30`
  returns exactly three PRs — #162, #163, #164 — all opened 2026-07-30, all
  already reviewed in the 2026-07-30 entry. Nothing newer exists.
- Every branch tip on `origin` was inspected individually. The newest commit on
  *any* branch in the window is `9a67f71` on `main` at 2026-07-31T14:14Z — this
  review job's own commit from yesterday. No worker commit exists anywhere.
- The branch list is byte-identical to yesterday's: the same six heads at the
  same six SHAs. No fire created a branch, and none pushed to an existing one.

### The blocker has not moved in two days

PR #164 — still the only output the autonomous worker has ever produced — has
now been **open and unmerged for ~56 hours**, last updated 2026-07-30T05:34Z.
Every consequence recorded yesterday holds unchanged, so they are not restated
at length; what matters is that a full day passed with no movement:

1. `main` still shows `q001` as `pending` and the run ledger still reads
   `_(no entries yet)_`. The lock, the `done` transition and the ledger row all
   remain on `fix/docs-refresh-agent-tool-116`.
2. A fire reading `main` today would still re-claim finished work. This was
   predicted on 2026-07-30 and is now 48 hours old.
3. The queue is still three seed rows, because expansion is gated on the proof
   unit producing a PR that `main` can see.

### The done-when evidence is sound — and still not on `main`

Re-verified directly against the branch rather than taken from yesterday's
entry. `run-20260730T053122Z` records `grep … Agent` → **0**, `grep … Task` →
**1**, `npm test` → **0**, verbatim commands with real exit codes, exactly as
the ledger's own rule demands. The `grep`→1 is the intended pass condition, not
a failure. **This is not a condition-D finding**: the evidence is genuine and
complete. Its only defect is location. That distinction matters — a missing-
evidence finding and an unmerged-evidence finding call for opposite responses.

The `done-when` remains the wrong assertion for the reason given in the
2026-07-30 entry (both greps interrogate the text the edit itself changes). That
is a standing gap, not a new one.

### What is *not* wrong

No row is `blocked`. No row is stuck `in-progress` on `main`. No `attempts` or
`deferrals` counter has moved off zero on any row, and the ledger records no
`released` outcome. There is no starvation and no gate failure. The queue is not
absorbing repeated failures — **it is not being run at all**. Reporting these as
"clean" would be misleading: they are zero because nothing executed, not because
something executed successfully.

### Could not assess

- **Whether a fire was attempted and aborted, or was never scheduled.** Still
  indistinguishable from the repository, for the same structural reason as
  yesterday: there is no `.github/workflows/`, the worker is an external
  scheduled task, and a resource-driven `released` row is by design written to a
  feature branch that would never appear. An aborted fire and an absent fire
  produce byte-identical state. Two days of this makes the observability gap the
  more urgent design defect — the daily review cannot tell Jason *why* the
  pipeline is quiet, only that it is.
- The cited design doc is still absent from `main`.
- The `decide` column is still undefined in the queue's own Rules section.

---

## 2026-08-02 — detail

**No pull request was opened in the review window** (2026-08-01T14:07Z →
2026-08-02T14:07Z). Part 1 has no diff to judge for the **third consecutive
day**. Two empty days was a pattern; three, with the blocker unmoved and every
counter still at zero, is a **deadlocked pipeline** — and the distinction
matters, because a deadlock does not clear on its own.

Confirmed rather than assumed (nothing below is carried over from yesterday's
entry):

- `list_pull_requests … state:all sort:created desc` returns #164 as the newest
  PR in the repository, created 2026-07-30T05:33:35Z. Nothing newer exists.
- `git fetch --prune` then `git log --all --oneline --since='24 hours ago'`
  returns exactly one commit across **all** refs: `2d48fdf`, this review job's
  own commit from yesterday. No worker commit exists anywhere.
- All six `origin` heads are at the same SHAs as the two prior entries record.
  No fire created a branch and none pushed to an existing one.
- PR #164 read directly: `state: open`, `merged: false`, `updated_at`
  2026-07-30T05:34:09Z — **unchanged since the minute it was opened**, ~80.5
  hours ago. It has received no review, no comment, and no push.

### The system cannot recover without a human, and that is a design defect

This is the finding that three days of identical state makes legible, and it is
stronger than "the merge is late." The queue file gates expansion of Wave 1–4
rows on the proof unit "produc[ing] a real PR." The proof unit *did* produce
one. But the evidence of that lives entirely on
`fix/docs-refresh-agent-tool-116`, and the gate is evaluated against `main`,
where `q001` still reads `pending` and the ledger still reads
`_(no entries yet)_`. So:

- expansion is gated on the PR merging;
- the PR merges only when Jason merges it;
- and nothing in the pipeline escalates, retries, or degrades toward that.

The queue has no state meaning *"done, awaiting merge."* Its four status values
(`pending` · `in-progress` · `done` · `blocked`) cannot express the one
situation the system has actually been in for three days, which is why `main`
reports the row as `pending` — indistinguishable from never-attempted. **A
worker fire today would re-claim `q001` and redo finished work**, opening a
second PR against a file already fixed on an unmerged branch. That prediction
was first made on 2026-07-30; it is now 72 hours old and still live. Each empty
day makes it more likely that the next non-empty day produces a *collision*
rather than progress.

### One hypothesis narrowed

Prior entries recorded that an aborted fire and an absent fire are
byte-identical on `main`, and that remains true. But there is now a control:
**this review job has fired successfully 3/3 days** — `ee91420` (07-30T14:14Z),
`9a67f71` (07-31T14:14Z), `2d48fdf` (08-01T14:11Z), all committed and pushed to
`main` unattended. Whatever else is true, the account's scheduler runs unattended
jobs in this repository on time, and the token budget accommodates at least one
of them daily.

That does not clear the worker — its slot, weight budget and hour differ — but
it does make "the environment is globally rejecting scheduled runs" the *less*
likely explanation, and "the worker routine is not scheduled, or aborts before
it can write anything" the more likely one. Stated as a narrowing, not a
conclusion: it cannot be settled from the repository.

### What is *not* wrong — and why that is not reassurance

No row is `blocked`. No row is stuck `in-progress` on `main`. No `attempts` and
no `deferrals` counter has moved off zero on any of the three rows, and the
ledger records no `released` outcome. There is **no starvation, no gate failure
and no resource-driven release**. As in prior entries, these read as zero
because nothing executed — not because something executed successfully. Grading
this as a clean day would invert its meaning.

Likewise **no condition-D finding**: the `done-when` evidence for
`run-20260730T053122Z` was verified against the branch on 2026-08-01 and is
genuine and complete. Its defect is location, not integrity. The separate
standing criticism of that `done-when` — that both `grep`s interrogate the very
text the edit changed, so they assert the diff applied rather than that anything
behaves differently — is unchanged and still unaddressed.

### Could not assess

- **Whether a fire was attempted and aborted, or was never scheduled.** Still
  structurally invisible: no `.github/workflows/` exists, the worker is an
  external scheduled task, and a resource-driven `released` row is by design
  written to a feature branch that would never appear on `main`. Three days in,
  this observability gap is the most consequential defect in the design — the
  daily review can tell Jason the pipeline is quiet but never *why*, which is
  precisely the fact needed to fix it.
- The cited design doc
  (`plans/autonomous-backlog-scheduling/autonomous-backlog-scheduling-design.md`)
  is still absent from `main`, so the queue's rationale still cannot be checked
  against its source.
- The `decide` column is still undefined in the queue's own Rules section.

---

## 2026-08-03 — detail

**No pull request was opened in the review window** (2026-08-02T14:11Z →
2026-08-03T14:14Z). Part 1 has no diff to judge for the **fourth consecutive
day**. Part 2 completed in full.

Confirmed rather than assumed (nothing below is carried over from prior
entries):

- `list_pull_requests … state:all sort:created desc` returns #164 as the newest
  PR in the repository, created 2026-07-30T05:33:35Z. Nothing newer exists.
  Draft PRs are included in that listing, so a draft is not hiding the work.
- `git fetch --prune --all` then `git log --all --oneline --since='24 hours ago'`
  returns **zero commits across all refs** — not even this review job's own,
  since yesterday's landed at 14:11Z and the window opens at 14:14Z.
- All six `origin` heads are at the SHAs the prior three entries record. The
  newest non-`main` head is `b75131e` on `fix/docs-refresh-agent-tool-116` at
  2026-07-30T05:34Z. No fire created a branch and none pushed to an existing one.
- PR #164 read directly: `state: open`, `merged: false`, `updated_at`
  2026-07-30T05:34:09Z — unchanged since the minute it was opened, now
  **~104.7 hours** (4.4 days). No review, no comment, no push.

### The only thing moving in this repository is the observer

PR #164's recorded base is `0e91384`. `main` is now three commits past it —
`ee91420`, `9a67f71`, `2d48fdf`, `9d0373d` — and **every one of those is this
review job's own daily commit**. Four days of repository history contain no
production work of any kind: only the log of a reviewer reporting that there is
nothing to review.

That reframes the severity. The prior entries described a pipeline waiting on a
merge. What the fourth day shows is a system in which the *monitoring* half runs
flawlessly on schedule and the *working* half has never run twice. A monitor
that reliably reports its own liveness while the thing it monitors is dead is
the failure mode most likely to be mistaken for health — and the `[STALLED]`
subject line is the only thing preventing that mistake here.

None of the three commits conflicts with #164 (they touch
`autonomous-quality-review.md`; #164 touches `SKILL.md`, `autonomous-queue.md`
and `autonomous-run-ledger.md`). The PR should still merge cleanly — its
staleness is not yet a mechanical obstacle. GitHub reports `mergeable_state:
unknown`, which is an uncomputed cache, not a conflict.

### One hypothesis tested and *not* settled

Yesterday's entry narrowed the cause toward "the worker is not scheduled, or
aborts before it can write anything," and noted the question could not be
settled from the repository. This review attempted to settle it directly by
enumerating the account's scheduled jobs rather than inferring from repository
state.

**The attempt failed for a structural reason worth recording.** The available
cron-listing tool is scoped to jobs created *within the calling session*; it
returns "No scheduled jobs" here, and it does not even list *this* review job,
which is demonstrably scheduled and demonstrably firing. A negative result from
that tool is therefore evidence of nothing at all, and must not be read as
"the worker is not scheduled." The observability gap stands, and it is now
confirmed to be unreachable from inside a run — not merely unreached. Settling
it requires Jason inspecting the scheduler configuration directly.

### What is *not* wrong — and why that is not reassurance

No row is `blocked`. No row is stuck `in-progress`. `attempts` and `deferrals`
are `0` on all three rows, and the ledger still reads `_(no entries yet)_` with
no `released` outcome recorded. There is **no starvation, no gate failure and no
resource-driven release** — the two categories the daily brief keeps apart are
both empty, and they are empty because nothing executed. Grading this as a clean
day would invert its meaning; it is the emptiest day of the four.

No condition-D finding. The `done-when` evidence for `run-20260730T053122Z` was
verified against the branch on 2026-08-01 and is genuine and complete; its
defect is location, not integrity. The standing criticism of that `done-when` —
that both `grep`s interrogate the very text the edit changed, so they assert the
diff applied rather than that anything behaves differently — is unchanged and
still unaddressed.

### Could not assess

- **Whether a fire was attempted and aborted, or was never scheduled.** See the
  narrowing above: now actively probed and still structurally invisible. No
  `.github/workflows/` exists, the worker is an external scheduled task, and a
  resource-driven `released` row is by design written to a feature branch that
  would never appear on `main`.
- The cited design doc
  (`plans/autonomous-backlog-scheduling/autonomous-backlog-scheduling-design.md`)
  is still absent from `main` — the branch carrying it,
  `feature/autonomous-backlog-scheduling`, is unmerged — so the queue's
  rationale still cannot be checked against its source.
- The `decide` column is still undefined in the queue's own Rules section.
- The queue file's closing note still asserts "No fire will pick them up,
  because the worker routine does not exist yet." A fire ran on 07-30 and
  shipped `q001`, so that sentence has been false for four days. Flagged on
  07-30; still uncorrected, because the correction is on the unmerged branch.
