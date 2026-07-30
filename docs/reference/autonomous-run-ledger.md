# Autonomous Run Ledger — Conformance

Answers one question: **did it do the work.** Appended once per work unit by the
worker routine. Kept separate from `autonomous-quality-review.md`, which answers
whether the work mattered — merging the two hides the second question.

**Rule: every done-when entry is a command and its actual exit code, verbatim.
Never the agent's prose account of itself.** A ledger recording an agent's own
report of success is worth very little; silent regressions that report success
are the dominant production failure mode, and this repo has been burned by one.

Append newest last. Never edit a prior entry.

| Run ID | Timestamp (UTC) | Row | Issue(s) | Outcome | PR | done-when evidence (command → actual exit) | Gate (verdict, rounds, research fired?) | Files touched |
|--------|-----------------|-----|----------|---------|----|--------------------------------------------|------------------------------------------|---------------|
| _(no entries yet)_ | | | | | | | | |

**Outcome values:** `shipped` · `blocked` · `skipped` · `released` (resource-driven
abort — distinct from a gate failure, and does **not** increment `attempts`).
