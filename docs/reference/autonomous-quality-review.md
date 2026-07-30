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
| _(no entries yet)_ | | | | | | |

**Verdict values:** `IMPROVEMENT` · `NEUTRAL CHURN` · `REGRESSION`
