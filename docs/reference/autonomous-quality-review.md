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
