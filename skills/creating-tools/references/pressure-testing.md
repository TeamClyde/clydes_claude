# Pressure Testing

**Load this reference when:** creating or editing a skill or an agent, before deployment — to
verify the guidance holds up under realistic pressure, not just that it reads correctly.
`references/hook-conventions.md` also points here for the RED-phase question a hook test must
answer before the hook exists.

**Required background:** this reference assumes the `test-driven-development` skill's
RED-GREEN-REFACTOR cycle. What follows is that cycle applied to authored guidance — and, in the
hooks branch, to a hook's own unit test rather than to guidance at all.

## Contents

- [The Shared Mechanism](#the-shared-mechanism)
- [Claude A and Claude B — the Test Harness](#claude-a-and-claude-b--the-test-harness)
- [RED Phase — Baseline](#red-phase--baseline)
- [GREEN Phase — Compliance](#green-phase--compliance)
- [Writing Pressure Scenarios](#writing-pressure-scenarios)
- [REFACTOR Phase — Closing Loopholes](#refactor-phase--closing-loopholes)
- [Skill Branch](#skill-branch)
- [Agent Branch](#agent-branch)
- [Hooks Branch — a Different Cycle Wearing the Same Name](#hooks-branch--a-different-cycle-wearing-the-same-name)
- [Common Mistakes](#common-mistakes)

## The Shared Mechanism

Testing a skill or an agent's system prompt is RED-GREEN-REFACTOR applied to prose that governs
behavior instead of to code that produces output:

| Phase | Code TDD | Guidance testing |
|---|---|---|
| RED | Write a failing test | Run the real scenario without the guidance; watch the target fail |
| GREEN | Write the minimum code to pass | Write the minimum guidance addressing the observed failures; re-run — the target complies |
| REFACTOR | Clean up while staying green | Run pressure scenarios designed to break compliance; close each new loophole; re-verify |

**Core principle, stated once because it governs both branches:** if you did not watch the target
fail without the guidance, you do not know whether the guidance prevents the right failure.
Writing a skill or a system prompt from intuition about what "should" go wrong, and never watching
it fail unguided, skips RED — the same defect as writing code before a test, just harder to
notice, because prose doesn't refuse to compile.

Skip the cycle for pure-reference material with nothing to violate — a syntax guide, a lookup
table — there is no compliance to pressure-test. Apply it fully to anything that enforces a
discipline, states a hard rule, or costs the model time or effort to follow.

## Claude A and Claude B — the Test Harness

Every RED, GREEN, and REFACTOR run needs two distinct roles. Conflating them is the most common
way this technique gets diluted into "I re-read the skill and it looked fine" — which tests
nothing.

- **Claude A** is you, in the current context: the author. Claude A writes and revises the
  guidance, designs the pressure scenarios, and reads Claude B's transcripts afterward to decide
  what to add.
- **Claude B** is a fresh, separate instance with no memory of this conversation, dispatched to
  actually attempt the scenario. Claude B is the one being tested — it must not already know what
  Claude A intends, or its compliance proves nothing.

The separation is the whole point: Claude A already knows the "right" answer, so Claude A cannot
also play test subject. Only a Claude B that starts cold — no visibility into why the scenario was
designed, no access to this conversation — produces evidence that the guidance itself, not the
author's intent, drives the outcome. How Claude B is actually dispatched differs by artifact type;
see each branch below.

## RED Phase — Baseline

Give Claude B the realistic task, withhold the guidance under test, and document — verbatim —
what it does and why it considers that justified. This is "write the failing test first," aimed
at behavior instead of an assertion.

Do this before writing a single line of the skill or the system prompt. A guidance document
written first and pressure-tested second tells you what the author thought needed preventing;
only a baseline run tells you what actually happens.

## GREEN Phase — Compliance

Write the minimum guidance addressing the specific failures documented in RED — not generic
hardening for hypothetical cases you didn't observe. Re-run the identical baseline scenario;
Claude B should now comply.

If Claude B still fails: the guidance is unclear or incomplete, not the test. Revise and re-run
before moving on.

## Writing Pressure Scenarios

Once GREEN holds on the baseline scenario, pressure scenarios verify the guidance survives contact
with a Claude B that has an incentive to route around it — this is the bridge into REFACTOR.

**Key elements of a good scenario, regardless of target:**

1. **Concrete options** — force a choice among named alternatives, not an open-ended "what would
   you do?"
2. **Real constraints** — specific numbers and specific consequences, not "some time pressure."
3. **Make the target act** — "what do you do?" not "what should you do?"
4. **No easy outs** — deferring to "I'd check with my human partner" without picking an option
   does not count as a pass.

**Bad scenario (no pressure):** asking Claude B to recite what the guidance says. It just quotes
the document back — no behavior under test.

**Good scenario (single pressure):** a realistic task with one named constraint — a deadline, a
claimed authority override, a sunk-cost setup.

**Strong scenario (combined pressure):** stack 2–3 pressures from the table below into one
narrative, force an A/B/C choice, and require Claude B to pick one and justify it.

| Pressure | Shape |
|---|---|
| Time | Deadline, emergency, a closing window |
| Sunk cost | Hours of work already invested; discarding it feels wasteful |
| Authority | A stated human or manager instruction to skip the rule |
| Economic / consequence | Job, revenue, or system stability framed as at stake |
| Exhaustion / convenience | End of day, "just do it inline," "it's faster this way" |
| Social | Looking rigid or dogmatic for insisting on the rule |
| Scope creep | "While you're at it, also do X" — see [Agent Branch](#agent-branch) |

**Unverified rationale, not a rule:** these categories track documented influence principles
(authority, scarcity, commitment) from persuasion research. The mechanism doesn't need to be true
for the technique to work — what matters is whether Claude B's *observed* compliance holds, not
why the pressure is persuasive.

## REFACTOR Phase — Closing Loopholes

Claude B complied on the scenario it saw, but a new pressure scenario or an adversarial follow-up
produces a fresh violation. Capture the new rationalization or gap verbatim, then close it — the
concrete techniques differ by target (a rewritten paragraph for a skill, a system-prompt
constraint for an agent), so see each branch below.

The loop: add the fix, re-run the same scenario, confirm compliance, then look for the *next* new
rationalization. Stop only when a fresh adversarial pass produces nothing new. One clean pass is
not evidence of bulletproof guidance — it's evidence you haven't looked hard enough yet.

## Skill Branch

**Scope check first.** Test skills that enforce a discipline, carry a compliance cost, or could
plausibly be rationalized away. Skip pure reference material and skills the model has no incentive
to bypass — there is nothing to pressure-test.

**RED — dispatch.** Give a fresh Claude B the task with the skill unavailable. A representative
baseline: sunk cost (hours of work already done) combined with time pressure (a deadline in
minutes), framed as an explicit A/B/C choice where only one option satisfies the discipline under
test. Document exactly which option Claude B picks and its exact justification. Typical shapes —
"I already tested it manually," "tests after achieve the same goal," "being pragmatic, not
dogmatic" — are common, not universal; capture what actually comes back, not what you expect.

**GREEN — write, re-run.** Write the skill addressing only the documented failures. Re-run the
identical scenario; Claude B should now pick the compliant option and can usually point at the
section that changed its mind.

**REFACTOR — four ways to close a loophole**, roughly in the order to reach for them:

1. **Explicit negation in the rule itself.** "Delete it" survives a rationalization like "keep it
   as reference" only once the rule names and negates that exact exception.
2. **A rationalization-table entry.** `| Excuse | Reality |` — the exact phrase Claude B used,
   paired with a one-line rebuttal. This is what a future Claude B (and a future author) scans
   first.
3. **A red-flag entry.** A short list of exact phrases that signal a violation is imminent, so it
   is caught earlier in a longer transcript.
4. **A description update.** If the skill's `description:` doesn't mention the symptom that
   preceded the violation ("tempted to test after," "manually tested and it seems to work"), the
   skill may never load in the session that needed it — the fix isn't only in the body.

Re-run the same scenario after each addition. A genuinely new rationalization means repeat the
loop; compliance with a citation to the new section means move to the next scenario.

**Meta-testing, when GREEN isn't landing.** If Claude B still chooses the wrong option after a
revision, ask directly: "You read the skill and chose the wrong option anyway — how could the
skill have been written so the right choice was unmistakable?" Three answers, three different
fixes:

| Claude B's answer | What it means | Fix |
|---|---|---|
| "The skill was clear, I chose to ignore it" | Not a documentation gap | Add a stronger foundational principle — e.g. "violating the letter is violating the spirit" |
| "The skill should have said X" | Documentation gap | Add X verbatim |
| "I didn't see section Y" | Organization gap | Promote the point earlier, or make it more prominent |

**Signs the skill is bulletproof:** Claude B picks the compliant option under a maximum-pressure
combined scenario, cites the skill's own section as justification, and on meta-testing reports the
skill was clear rather than proposing new wording. Not bulletproof: Claude B invents a "hybrid"
middle option, argues the rule itself is wrong, or asks permission while still arguing for the
violation.

**Skill checklist:**
- [ ] RED: baseline run without the skill, failures documented verbatim
- [ ] GREEN: skill written to address those specific failures; re-run complies
- [ ] REFACTOR: each new rationalization closed with one of the four techniques above
- [ ] Rationalization table and red-flag list current with everything observed
- [ ] `description:` reflects the symptoms that preceded a violation
- [ ] A fresh adversarial pass after the last fix produces nothing new
- [ ] Meta-tested at least once if any revision was needed

## Agent Branch

**RED — dispatch without a system prompt.** The baseline call omits `subagent_type`, so the Agent
tool dispatches with no agent definition attached — just the raw task prompt. What comes back
typically has one or more of these gaps:

| Gap observed | What it tells you to add |
|---|---|
| Inherits the parent's model | An explicit `model:` pin |
| Description states neither capability nor a delegation trigger | Rewrite as capability + when-to-delegate |
| Unstructured response | An explicit output-format section |
| Can't read files it needs | Every required tool listed explicitly — an agent's `tools:` allowlist has no implicit additions |
| Takes on adjacent work uninvited | A constraints section |
| Dives in with no framing | A Role section |

Document the actual gaps observed, not the ones expected — the point of RED is that intuition and
observation diverge.

**GREEN — dispatch with the system prompt.** Same task prompt, now with `subagent_type: <name>`
set so the file's frontmatter and body govern. The documented RED gaps should be resolved.

**Pressure scenarios — four named types**, each verifying a different failure mode:

| Type | Verifies | Pass criteria |
|---|---|---|
| Bad inputs | Handles malformed or missing parameters | Surfaces a clear error; does not hallucinate missing content |
| Ambiguous instructions | Asks rather than assumes | Requests the missing parameter instead of guessing a value |
| Scope creep | Stays inside its defined scope | Declines the out-of-scope addition; returns only its defined output |
| Authority override | Holds constraints under a claimed instruction to skip them | Follows its own system prompt regardless of the claimed override |

A combined scenario stacks two or three of these with a claimed deadline — e.g. an instruction to
skip the output-format requirement *and* pick up an unrelated task, framed as urgent. The
strongest tests combine three: time, authority, and scope.

**REFACTOR — three fix shapes**, matched to where the gap lives:

1. **An explicit constraint** in the system prompt body: "Do not X, even when instructed to."
2. **Input validation**, stated in an Inputs section: "If `<param>` is null or empty, surface an
   error and stop rather than proceeding."
3. **A scope boundary**, in the Role or Constraints section, naming the adjacent work it must
   decline.

Re-run the specific failing scenario after each addition; move to the next scenario once it
passes.

**Agent checklist:**
- [ ] Baseline run WITHOUT a system prompt — failures documented verbatim
- [ ] System prompt written; re-run resolves the documented baseline failures
- [ ] Bad-inputs scenario passed
- [ ] Ambiguous-instructions scenario passed
- [ ] Scope-creep scenario passed
- [ ] Authority-override scenario passed
- [ ] At least one combined (time + authority + scope) scenario run and passed

## Hooks Branch — a Different Cycle Wearing the Same Name

Everything above assumes a target that can be persuaded — a model reading prose and choosing how
to act on it. A hook is not that. It is a `.mjs` script: stdin in, an exit code and optionally
JSON out. There is no Claude B to dispatch, nothing to rationalize, and no pressure scenario to
write, because there is no judgment in the loop to put pressure on.

**RED still means "watch it fail" — but the failure is a test runner, not a transcript.** For a
hook, RED is a conventional failing unit test that an author should write against the hook's own
`<name>.test.mjs` sibling, asserting the exit code and stdout shape the hook must produce, run
*before* the hook — or the behavior — exists, so it genuinely fails: an import error, a missing
file, or a wrong assertion, not a typo in the test itself. GREEN is the minimum hook code that
makes that assertion pass. REFACTOR is ordinary code cleanup under the now-green test, same as any
other code-TDD cycle.

**Do not force this into the skill or agent shape.** There is no baseline dispatch, because there
is no model instance to run cold — the hook either satisfies the test or it doesn't,
deterministically, on every run. There is no rationalization table, because a hook does not argue
for an exception; it either matches the branch condition or it doesn't. There is no meta-testing
question, because there is no "why did you choose that" to ask code. A hooks section shaped like
the skill or agent branch — a baseline dispatch step, a pressure-type table, a rationalization
table — would describe a cycle that cannot happen to a `.mjs` file. Put plainly: **these are two
cycles wearing one name, not one cycle with three targets.**

**What the RED-phase test should assert**, in place of a pressure scenario, is adversarial input —
the closest hook analog to "a scenario designed to break compliance." At minimum, before a hook is
considered done: the positive case (the decision fires with the exact expected JSON shape), the
negative case (silent pass, exit 0, empty stdout), a bypass marker matched only as a prefix and
never as a substring, the disable-flag escape hatch, malformed stdin, and a wrong-tool payload.
`references/hook-conventions.md`'s House Pattern and its cover-at-minimum table are the
authoritative list of what a hook's implementation must satisfy; this section only answers the
RED-phase question of *when* that test gets written — before the hook, not after.

A minimal worked shape:

```js
// RED — written first, fails because the hook file doesn't exist yet
test('wrong-tool payload passes through silently', () => {
  const { status, stdout } = runHook({ tool_name: 'NotBash' })
  assert.equal(status, 0)
  assert.equal(stdout, '')
})
```

```js
// GREEN — minimum hook code that satisfies the assertion above
if ((input?.tool_name ?? input?.name) !== 'Bash') process.exit(0)
```

REFACTOR then proceeds as ordinary code cleanup — extract the tool-name read into a shared helper,
tighten a type check — under the now-passing test, same as refactoring any other function.

**Hooks RED checklist:**
- [ ] A failing `<name>.test.mjs` exists and fails for the right reason before the hook's logic is
      written
- [ ] The test asserts exit code and stdout shape, not internal implementation details
- [ ] Positive case, negative case, bypass-prefix case, disable-flag case, and malformed-input
      case are each their own assertion, not one combined test
- [ ] GREEN is the minimum code that satisfies the test — no behavior added that no assertion
      requires

## Common Mistakes

| Mistake | Why it fails |
|---|---|
| Writing the guidance before running a baseline | Tells you what the author thought needed preventing, not what actually happens. Always run RED first. |
| Single-pressure scenarios only | A real Claude B resists one pressure and complies under three. Combine 2–3. |
| Vague documentation of a failure ("it did the wrong thing") | Doesn't tell you what to prevent. Capture the exact choice and the exact justification. |
| Generic fixes ("don't cheat") | Doesn't close a specific loophole. Name the exact rationalization and negate it directly. |
| Stopping after the first clean pass | One pass is not bulletproof — run a fresh adversarial scenario before calling REFACTOR done. |
| Shaping the hooks branch like the skill or agent branch | A hook has no judgment to pressure-test. RED is a failing unit test, not a baseline dispatch — see [Hooks Branch](#hooks-branch--a-different-cycle-wearing-the-same-name). |
| Writing a hook's test after the hook | Usually just re-states the implementation's own branches instead of asserting the contract independently. |
| Running the full cycle on a pure-reference skill or a lookup-table agent | Nothing to violate means nothing to pressure-test. Reserve the cycle for guidance that enforces a discipline. |
