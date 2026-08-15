# Rule Conventions

Authoring reference for rules — `rules/<name>.md` files injected automatically into every session
(global) or into sessions touching matching files (path-scoped). A rule is not invoked like a
skill: it has no trigger keyword and no on-demand loading. It is either always present, or present
whenever its `paths:` pattern matches — and that always-on nature is what its authoring bar has to
account for.

Deciding whether the constraint you're documenting should be a rule at all — versus a skill, an
agent, or a hook — happens before this file is relevant. See `../SKILL.md`'s
artifact-selection guidance first; everything below assumes that call has already been made.

## Contents

- [The Cost Model, Not a Line Count](#the-cost-model-not-a-line-count)
- [Global vs. Path-Scoped](#global-vs-path-scoped)
- [Structure](#structure)
- [Testing: Observational](#testing-observational)
- [Rationale: an Unverified Data Point](#rationale-an-unverified-data-point)
- [Common Mistakes](#common-mistakes)

## The Cost Model, Not a Line Count

A prior version of this guidance set a `<50 lines` bar. Drop it — a numeric cap describes a
symptom, not the actual constraint, and it invites padding a rule out to just under the number
instead of asking whether each line belongs.

The real constraint: **a rule is always-on injected content.** A global rule loads into every
session, including the overwhelming majority where its subject never comes up. A path-scoped rule
loads into every session that merely touches a matching file, whether or not the constraint it
states is relevant to what that session is doing. Every line in the file is paid for repeatedly,
by sessions that get no value from it. So the bar is: *every line must earn its place in the
sessions where the rule does not apply* — not just in the session where it does.

In practice: no rationale paragraph a decision table could replace, no background explaining why
the constraint exists (that belongs in a design doc or ADR, not the rule itself), and no example
beyond the minimum needed to disambiguate the constraint. If a rule needs three worked examples to
be followed correctly, the wording isn't scannable yet — tighten it before adding more text to
explain it.

## Global vs. Path-Scoped

| | Global (no frontmatter) | Path-scoped (`paths:` frontmatter) |
|---|---|---|
| Loads into | Every session | Sessions touching a matching file |
| Choose when | The constraint is universal — routing directives, hard prohibitions, lifecycle governance | The constraint only matters for a specific directory or file type |
| Cost of getting it wrong | A directory-specific constraint loaded globally wastes tokens in every unrelated session | A constraint scoped too narrowly is silently absent from the sessions that needed it |

A path-scoped rule declares its match patterns in frontmatter; everything below the closing `---`
is structured identically to a global rule — only the loading condition differs:

```yaml
---
paths:
  - "src/api/**"
  - "CLAUDE.md"
---
```

## Structure

**Single concern per file.** A rule covering two unrelated constraints gets half-followed — a
reader scanning for one of them skims past the other. Split into two files instead of combining.

**Decision tables and short procedural steps, not narrative prose.** A rule is scanned, not read.
A paragraph justifying why a constraint exists gets skipped; a table mapping situation to required
action gets followed.

**Hard constraint language.** State the requirement as binding, not advisory:

```markdown
# weak — reads as optional
Avoid deleting user data without confirmation when possible.

# binding — reads as a constraint
Never delete user data without explicit user confirmation.
```

## Testing: Observational

Rules have no eval loop and no automated scoring — this is the one place a rule's validation
cycle deliberately does not mirror a skill's or an agent's. (If you're looking for that eval
cycle, `references/pressure-testing.md` covers skills, agents, and hooks; rules aren't part of it,
and nothing below is a substitute for it.) Instead:

1. Start 2–3 real sessions that would trigger the rule — every session for a global rule, or one
   touching a matching file for a path-scoped rule.
2. Observe whether the constraint is actually followed, without pointing at the rule or prompting
   for compliance directly.
3. If it's violated, treat the rule as ambiguous, not the session as wrong — rewrite and
   re-observe.

Pass criteria: the constraint holds across the observed sessions without being invoked explicitly.
There's no pass rate to compute and no harness to run — "did it happen" over 2–3 tries is the
whole test.

## Rationale: an Unverified Data Point

One piece of evidence sometimes cited for why hand-written context files outperform generated ones
is a study reporting roughly **+4% for human-written context files versus roughly −3% for
auto-generated ones.** This figure is **academic and unverified against official documentation** —
unlike everything above it in this file, it has not been confirmed, and it must never be presented
as a rule or a pass/fail bar. It appears here only as a labeled data point that happens to support
the cost-model argument above: one more reason to write rules deliberately, not something to cite
as settled fact or to test a rule against.

## Common Mistakes

| Mistake | Why it fails |
|---|---|
| Reintroducing a `<50 lines` (or any numeric) size bar | Replaced by the cost model — see [The Cost Model, Not a Line Count](#the-cost-model-not-a-line-count). A count invites padding to the limit; the real question is whether each line earns its place in sessions where the rule doesn't apply. |
| Narrative prose explaining why a constraint exists | Skipped during a scan. Use a decision table or numbered steps instead. |
| Advisory language ("avoid", "prefer", "should") | Reads as optional and gets treated as optional. Use "never" / "always". |
| One file covering two unrelated constraints | Readers skim past whichever one they weren't scanning for. Split into two files. |
| Global scope for a directory- or filetype-specific constraint | Wastes context in every session that never touches the relevant files. Use `paths:` instead. |
| Building an eval loop or scoring harness for a rule | Rules are tested observationally (2–3 live sessions) — that cycle belongs to skills, agents, and hooks, not rules. |
| Citing the human-written/auto-generated context-file study as settled fact | It's an unverified academic data point, included as rationale only — see [Rationale: an Unverified Data Point](#rationale-an-unverified-data-point). |
