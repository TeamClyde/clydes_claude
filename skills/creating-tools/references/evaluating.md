# Evaluating a Component

Two measurements you can actually run, for the two ways a component fails.

`references/pressure-testing.md` covers the qualitative cycle — baseline, three scenarios, close
the loopholes. It answers *"does this guidance hold under pressure?"* by reading transcripts. This
file covers the two things you can put a **number** on instead, using the tooling vendored under
`scripts/`.

Reach for these when reading transcripts has stopped being enough: when you are choosing between
two drafts, when someone asks whether the component earns its context cost, or when a skill you
believe is good is not being invoked.

## Contents

- [Which measurement answers which question](#which-measurement-answers-which-question)
- [Suite A — behavioral A/B](#suite-a--behavioral-ab)
- [Suite B — trigger rate](#suite-b--trigger-rate)
- [What neither suite tells you](#what-neither-suite-tells-you)
- [Provenance and upstream](#provenance-and-upstream)
- [Common mistakes](#common-mistakes)

## Which measurement answers which question

| Question | Suite | Needs |
|---|---|---|
| Does the component make the work *better*? | A — behavioral A/B | subagents, a browser for review |
| Does it *load* when it should, and stay quiet when it shouldn't? | B — trigger rate | the `claude` CLI on `PATH` |

They fail independently, which is why both exist. A skill can be excellent and never fire — that
is a Suite B failure, and it is silent: no error, no red suite, just a session where the guidance
was absent. A skill can also fire reliably and change nothing about the output, which is a Suite A
failure and costs context on every load. Neither measurement detects the other's failure.

Rules are out of scope for both. A rule has no trigger to measure and nothing to A/B against —
see `references/rule-conventions.md`.

## Suite A — behavioral A/B

**The one non-negotiable: run the baseline in the same batch.** For each test prompt you dispatch
*two* subagents — one with the component, one without (or one with the previous version, when you
are revising rather than creating). Without the paired run you cannot distinguish "the component
helped" from "the model was going to do that anyway," and that distinction is the entire point.
Spawn both in the same turn rather than collecting the with-runs first and the baselines later —
same conditions, same queue, no drift between the halves.

### Layout

Work in a scratch directory outside the skill. One directory per iteration, one per test case:

```
<workspace>/iteration-1/<eval-name>/
  with_skill/outputs/       what the component-equipped run produced
  without_skill/outputs/    the baseline (or old_skill/outputs/ when revising)
  eval_metadata.json        the prompt and its assertions
  timing.json               tokens and duration, per run
  grading.json              per-assertion verdicts
```

Name each case for what it tests, not `eval-0`. You will be reading these names in a results table
later, and `handles-ambiguous-artifact-type` is worth more there than an index.

### Flow

1. **Write the prompts first, assertions second.** Draft 2–3 prompts a real user would plausibly
   type, and get them agreed before running anything — a test set aimed at the wrong behavior
   produces confident numbers about nothing. Assertions can be drafted while the runs are in
   flight.
2. **Dispatch the pairs.** Each subagent gets the prompt, the component path (or nothing, for the
   baseline), and an output directory.
3. **Capture timing as each run returns.** Token count and duration arrive in the completion
   notification and are not persisted anywhere else. Write them to `<workspace>/…/timing.json` as
   they land, not in a batch at the end — by then they are gone.
4. **Grade.** Dispatch a grader with `scripts/grader.md` as its prompt. It reads the transcript and
   the output files and returns a verdict plus cited evidence per assertion.
5. **Aggregate.** From the skill directory:
   `python -m scripts.aggregate_benchmark <workspace>/iteration-1 --skill-name creating-tools`
   This produces pass-rate, wall time and token counts as mean ± stddev per configuration, with
   the with/without delta.
6. **Review the outputs, not just the numbers.** `python scripts/generate_review.py <workspace>/iteration-1
   --benchmark <workspace>/iteration-1/benchmark.json` opens a viewer with outputs side by side and
   a feedback box. Use `--static <path>` where there is no browser. Pass `--previous-workspace` on
   later iterations to show the prior output beneath each new one.

`scripts/analyzer.md` is a post-hoc pass over the aggregate, looking for what the means hide —
assertions that pass regardless of configuration (they discriminate nothing and should be
rewritten or dropped), and high-variance cases that are probably flaky rather than informative.
`scripts/comparator.md` is the stronger version when two drafts are close: it shows a judge both
outputs without saying which is which.

### Grade the assertions, not only the outputs

The grader is deliberately told to criticize the test set as it works. The reasoning is worth
internalizing even when you grade by hand: *a passing grade on a weak assertion is worse than
useless, because it manufactures confidence.* An assertion that passes in both the with-skill and
baseline runs is measuring the model, not the component. Rewrite it or delete it.

## Suite B — trigger rate

This is the measurement to run whenever a description changes, and the one this repo has the most
reason to care about — a description that must fire across several distinct intents is carrying
load that used to be split.

### How it works, because the mechanism explains the result

There are two modes, and picking the wrong one produces a confident, meaningless number.

**Probe mode (upstream default).** The runner writes a throwaway command file containing **only
the description** — never the body — then runs `claude -p "<query>"` and watches the response
stream for a tool call naming that file. It measures the description in isolation, which is what
you want when scoring a *hypothetical* description you have not committed yet.

**Live mode (`--live`, local addition).** Probe mode has an assumption that is easy to miss: the
skill under test must not already be available. When it *is* installed — the normal case for a
skill living in the repo you are working in — the real skill competes with the probe and wins. The
model fires the real one, the probe goes untouched, and the run records "did not trigger." That
false negative is indistinguishable from a badly-written description. It happened on the first
real run here.

`--live` drops the probe and asks the honest question: given the description as committed, does
the real skill fire? Use it to measure what you have. Use probe mode to score what you are
considering. `--live` and `--description` are mutually exclusive, because a live run has nothing
to inject a hypothetical into — which also means `run_loop`'s optimizer is probe-mode only.

**Run a positive control before believing any number.** Point the runner at one query that
obviously should fire and confirm it reports a trigger. Two Windows bugs in the original tooling
both surfaced as a clean 0% rather than as an error — the harness had never launched a single
query. A suite that cannot detect a trigger reports the same thing as a description that never
fires, and only the control tells them apart.

Each query runs three times by default, because triggering is stochastic rather than
deterministic. A query passes when its trigger rate lands on the correct side of the threshold —
so a description that fires two times in three on a should-trigger query counts as a pass, and one
that fires once in three does not.

### The eval set is the part that needs your judgement

Twenty queries, roughly half should-trigger and half not. The tooling cannot help you here and
the result is only as good as this input.

- **Should-trigger queries should mostly not name the artifact.** If every positive case says "write
  me a skill", you have proven the description matches the word "skill". The valuable cases are the
  oblique ones — how someone describes the problem before they know what the answer is.
- **Should-not-trigger queries must be near-misses.** A query about Fibonacci proves nothing. Aim
  for things that share vocabulary but need something else entirely, so the description is forced
  to discriminate rather than pattern-match.
- **Write them the way people type.** Lowercase, abbreviations, a file path, a bit of backstory,
  the occasional typo. Sanitized prompts measure a sanitized world.

Review the set in a browser first — `assets/eval_review.html` is a template for that; substitute
the eval JSON, the component name and the current description into its placeholders, then edit and
export.

### The queries are executed, not simulated

Worth internalizing before your first run: each query is handed to a real `claude -p` session with
the tool access that session normally has, **in the repository you launched from**. A query is not
a string matched against a description — it is a task, and the model will attempt it.

This bites on the should-not-trigger half, because those queries are by design plausible work. A
run of the set above included *"write a python script that walks all our markdown files and reports
any broken relative links"* — and a subsequent `git status` showed exactly that script, written into
`scripts/`, unasked. It was correct, 129 lines, and completely uninvited.

So: **`git status` after every run**, and prefer queries that ask for something inert (an
explanation, a decision) over ones that ask for a file. Nothing was harmed here because the repo
was clean and the artefact was obvious, but a query phrased as "fix X" or "delete Y" would have
been carried out just as faithfully.

### Running it

```
python -m scripts.run_loop \
  --eval-set <workspace>/trigger-evals.json \
  --skill-path . \
  --model <the model id running this session> \
  --max-iterations 5 --verbose
```

It splits the set 60/40 into train and held-out test (stratified, seeded), scores the current
description, asks Claude to rewrite it against the failures, and repeats. **The winner is chosen
by held-out test score, not train score** — that is the overfitting guard, and it is the reason
the loop is worth more than hand-editing the description until the numbers look good.

Match `--model` to the model actually running your sessions. Triggering is a property of the model
reading the listing, so a rate measured on a different one does not transfer.

`python -m scripts.run_eval` is the single-shot version: score one description, change nothing.
Use it to confirm a hand-written description before committing to a full loop, and to measure
what is actually committed:

```
python -m scripts.run_eval \
  --eval-set <workspace>/trigger-evals.json \
  --skill-path . --live --runs-per-query 3 --num-workers 6 --verbose
```

Read the two halves separately — a single pass rate hides the shape. Failing should-not-trigger
queries means the description is too broad and will crowd out other skills; failing should-trigger
queries means it is too narrow and the skill is silently absent when it was needed. They are
different defects with different fixes, and a description can be excellent at one while failing
the other. The first measurement taken here scored 10/10 on the negatives and 1/10 on the
positives: flawless precision, almost no recall.

### It will cost you description budget

A description that triggers well is usually longer than one that does not, because trigger surface
is made of words. The registration checklist in `../SKILL.md` §4 already covers what to do when the
result does not fit — shorten it if you can, raise the ceiling and record why if you cannot. Expect
to do one of the two; a better-triggering description that never lands because it did not fit is
not an improvement.

## What neither suite tells you

Worth stating plainly, because the numbers are persuasive out of proportion to what they cover.

- **A green trigger rate on twenty queries is not coverage.** It is twenty queries. The set you
  wrote encodes what you already thought of, which is the same blind spot the component has.
- **Suite A measures the runs you dispatched.** Two or three prompts, graded against assertions you
  wrote, is a sample — a real improvement can show no delta because no prompt exercised it.
- **Neither one reads the component.** They observe behavior. A component can score well while
  containing a dead reference, a stale path, or a contradiction with a sibling file — those belong
  to review and to the gates in `../SKILL.md` §4, and no amount of benchmarking substitutes.

Treat a number from either suite as evidence, not as a verdict.

## Provenance and upstream

Everything under `scripts/` and `assets/` was vendored 2026-08-14 from the official
`skill-creator` plugin, unmodified apart from a provenance header on each file. It is stdlib-only
Python, which is why vendoring it added no dependency.

Copied rather than re-authored, deliberately: it is tested third-party code, and paraphrasing it
would have made it harder to diff when upstream changes. That is the opposite of the rule this
skill applies to prose, and the difference is the point — re-author guidance, copy working code
and say where it came from.

The trade-off you are now holding: this is a fork. Upstream fixes do not arrive on their own. If
the plugin is installed at some later date, diff before assuming either side is current.

## Common mistakes

| Mistake | Why it bites |
|---|---|
| Running with-skill only, no baseline | You cannot tell improvement from what the model already did. The comparison IS the measurement. |
| Grading before writing down timing | Tokens and duration arrive once, in the completion notification, and are not recoverable afterwards. |
| Assertions that pass in both configurations | They discriminate nothing. The grader is instructed to flag them; do not overrule it because the number looks good. |
| Should-trigger queries that all name the artifact | Proves the description matches a keyword, not that it matches an intent. The oblique phrasings are the test. |
| Should-not-trigger queries that are obviously unrelated | Free passes. Only near-misses tell you whether the description discriminates. |
| Picking the description with the best train score | That is the overfitting the held-out split exists to prevent. Take the loop's `best_description`. |
| Measuring trigger rate on a different model | Triggering is the reading model's behavior. The rate does not transfer. |
| Treating a green benchmark as review | Neither suite reads the file. Dead references and internal contradictions score fine. |
