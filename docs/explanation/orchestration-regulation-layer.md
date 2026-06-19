# Orchestration Layer — The Regulation Design ("The Third Leg")

> **Status:** Design dossier — captured research + rationale. *Not yet planned or built.*
> **Created:** 2026-06-18
> **Purpose:** Preserve the full reasoning, research, and design for a fail-successfully
> orchestration layer so a future session (or future-you) can build it without re-deriving
> any of it. The ultimate goal is to build this *into this repo* as a proper orchestration
> layer.
> **Related:** the active planning artifact `plans/orchestration-layer-foundation/` (gitignored,
> ephemeral); friction issue **#76** (the deep-research deadlock that started this); the
> auto-memory `project_orchestration_third_leg`. This document is the durable, self-contained
> source of truth — read it first.

A note on how to read this: §1–§5 are the *concept* (what we're building and why). §6–§8 are the
*evidence* (research findings, a worked example, tool constraints). §9 is the *build spec*. §10 is
*open questions*. §11 is a *glossary* — if any term is unfamiliar, jump there; the doc is written
to be self-contained.

---

## Table of Contents

1. [The core problem: determinate meets indeterminate](#1-the-core-problem)
2. [The conceptual model: three legs](#2-the-conceptual-model-three-legs)
3. [Why a third leg is forced into existence (the transformer grounding)](#3-why-a-third-leg-is-forced)
4. [The third leg, precisely: STATE + a RETURN PATH](#4-the-third-leg-precisely)
5. [The operational form: a per-unit lifecycle state machine](#5-the-operational-form)
6. [Research findings (deep-research output, distilled)](#6-research-findings)
7. [Worked example: the deep-research harness](#7-worked-example)
8. [Known Claude Code tool constraints](#8-known-tool-constraints)
9. [What to build (the spec for future-you)](#9-what-to-build)
10. [Open questions](#10-open-questions)
11. [Glossary](#11-glossary)
12. [Provenance](#12-provenance)

---

## 1. The core problem

Software has always been **deterministic**: given the same input it does the same thing, exactly,
every time. Reality is **not** deterministic. This is the oldest flaw in software — a rigid,
exact machine meets a messy, variable world, and it breaks at every edge case it didn't anticipate.

LLM agents introduce something new: **indeterminacy *inside* the software.** An LLM given the same
prompt can return different output each time; it can misread, skip, stall, or produce a confident
wrong answer. So we now have a deterministic substrate (our code) driving a non-deterministic one
(the agents), and **the seam between them is where the system breaks.**

The orchestration layer *is* that seam. The problem this document addresses:

> **How do you get a deterministic *guarantee* out of non-deterministic *components* — so the
> combined system doesn't break (freeze, lose work, or silently emit garbage) when the two meet?**

Note the goal is **not** to remove indeterminacy (that would kill the cognition that makes agents
useful). The goal is to *tolerate and harness* it while still delivering reliable behavior.

**The trigger.** This investigation started when a `deep-research` workflow **deadlocked** (friction
issue **#76**): one agent hung at a synchronization barrier and froze the entire run. That deadlock
was the *symptom* — the visible moment the system seized for lack of the thing this document names.
#76 is not the target; the target is the whole class of determinate↔indeterminate failures.

---

## 2. The conceptual model: three legs

A useful metaphor, and the spine of the whole design:

| Leg | Is | Properties |
|-----|----|-----------|
| **Bones** | **Code** (hooks, workflow scripts, the harness skeleton) | Rigid, deterministic, exact control flow. The scaffold. |
| **Muscle** | **LLM agents** | Does the heavy lifting; judgment; **non-deterministic**. The work. |
| **The third leg** | **(this document)** | Neither structure nor work. Keeps the system from seizing when the other two meet. |

The investigation spent considerable effort hunting for what the third leg *is*. The path —
recorded so you don't repeat the dead ends:

- **"Fat"** (a third tissue — reserve, cushioning, signaling). Right *instinct* (the system needs a
  third kind of stuff), wrong *details*. Biologically, fat is **connective tissue — the same category
  as bone** (passive storage/structure). It cannot regulate. The body's actual regulator is a
  *different* tissue type (nervous/endocrine). So "fat" pointed at the passive half only.
- **"Buffer / reactance"** (the EE framing). Closer: a capacitor/inductor is a genuine *third class*
  of circuit element (stores and returns energy, vs. the resistor that only dissipates). But again
  this is the **passive** element; active regulation in a circuit needs an op-amp **with feedback**.
- **Resolution:** the third leg is **not a single passive thing**, and it is **not purely passive.**
  It is a small *family* with two halves:
  - a **passive substance** (the only genuinely-new material), and
  - an **active return path** (built from code + cognition, "bent backward").

See §4 for the precise statement.

### What was explicitly rejected (and why)

- **Timeouts / slack / loose-coupling *alone*** — these merely *loosen* the existing forward link
  (make the muscle looser). They prevent the freeze but **lose the work** (see §7, run 1). Necessary,
  not sufficient.
- **A pure "control plane" as more code** — a supervisor is just deterministic code (± cognition)
  pointed at the system. It's a *recombination* of the existing two legs, not a new kind. (It is,
  however, where the *active* members live — see §4.)

---

## 3. Why a third leg is forced into existence

This is grounded in how transformers actually work, because it explains *why* the passive leg is
not optional.

Four facts about an LLM agent:

1. **Everything it works with is one flat pile of tokens** (the context window). If it isn't in the
   window, it doesn't exist for that pass.
2. **It reads the whole window at once, by relevance** (attention), not sequentially. Relevance is
   *computed* fresh every pass, not stored.
3. **The window is finite and re-scanned in full every pass.**
4. **It is amnesiac by construction.** Between calls it remembers *nothing*. Each subagent has its
   own private window in its own sealed room. The *only* way information crosses from one agent (or
   one moment in time) to another is for some non-cognitive process to **materialize it as tokens
   and place it into the other's window.**

Fact 4 is load-bearing:

> The muscle has judgment but **no state** — it cannot remember, only re-read. Therefore coordination
> can **never** be muscle-to-muscle. It must be **muscle → (external store) → muscle.** A persistent,
> external, re-readable store is not a nice-to-have; it is the **only physically possible coordination
> channel** between stateless agents.

That store is the passive third leg. It is distinct *in kind* because it is the only **passive**
element in the system: bones *execute*, muscle *cognizes*, the store merely *persists*.

---

## 4. The third leg, precisely

The third leg has two halves. Keep them distinct.

### 4a. Passive half = STATE

In the EE sense, **the state of a system is the energy stored in its passive (reactive) elements** —
the capacitor's voltage, the flywheel's spin *are* the state variables. The software analogue:

> **The passive leg is the system's externalized, persisted *state* — the distilled current
> condition, held outside and across all the active processes.**

Critically, this is **not** "memory/context" in the naive sense (the whole transcript). A capacitor
stores *one number* that summarizes everything about the past that still matters — not the full
history of every electron. Likewise:

> **State = the state *variables* (the few values that determine what happens next), NOT the
> transcript.**

A combinational (stateless) system — only sources and resistors — has no memory, no dynamics, no
ride-through; it is brittle by construction. *That is code + LLM with no third leg.* Adding state
gives the system history-dependence and the ability to ride through a transient.

Already half-present in this repo: `.claude/active-plan` (one path = the "what am I working on" state
variable), the plan doc's Task Reference ✅ column (completion state), the journal, and the gate-map
(the system's *model of itself* — see Conant–Ashby in §11).

### 4b. Active half = a RETURN PATH (feedback)

Code flows forward (input→process→output, toward the task). Cognition flows forward (prompt→answer).
The third thing is the **backward arrow**: output *sensed* and fed back to modulate behaviour. This
is **feedback / regulation / a closed loop** — the system acting on itself.

Every member of the **regulatory family** is an instance of "route information about what just
happened back into what happens next":

| Member | Role |
|--------|------|
| **Buffer** | Hold finished work so producers/consumers needn't be synchronized; decouple in time |
| **Sensor / observability** | *Measure* state — you cannot correct what you cannot sense (the member #76 lacked) |
| **Governor** | Sense error vs. an invariant, correct toward it |
| **Redundancy / quorum** | Replicate the unreliable worker, reconcile to a reliable result |
| **Supervisor / restart** | Watch for death/hang, restart or abandon gracefully |

The active half is built from **code + cognition, bent backward.** By **Ashby's Law of Requisite
Variety** (§11), regulating a *cognitive* (high-variety) worker may require a *cognitive* regulator —
i.e., the governor is sometimes itself an LLM (an LLM-as-judge/critic). So "distinct in kind from
cognition" is only partly true: distinct *role*, partly shared *substance*.

### 4c. The two halves are duals

You cannot have one without the other:

- Feedback is **impossible** without a stored value to compare against (the setpoint + the state
  estimate live in the passive store).
- A store that **nothing reads back** is a dead-letter log, not regulation.

> **The passive store is the *noun*; the return path is the *verb* that acts on it.**

A hard rule that falls out of this: **pair every store with a reader.** If you add state that no
control loop consumes, you've built a logging sink, not a third leg.

---

## 5. The operational form

A **state machine** is the concrete assembly of all of the above. It is the device that lets a
deterministic skeleton host non-deterministic work:

- **States + transitions are deterministic** → bone.
- **What happens *inside* a state (the work) is non-deterministic** → muscle.
- **The persisted current-state is inert and external** → the passive leg.
- **Transition logic ("given state + sensed event, go where?") reads sensed events** → the return path.

### The per-unit lifecycle FSM (the membrane around each indeterministic call)

Wrap **each** `agent()`/tool call in its own little machine. This is the core primitive and the #76
fix. *(Corrected version — `VALIDATING` feeds a repair-retry, not a terminal failure; see §6.3.)*

```
                  ┌──────────┐
        ┌────────►│ PENDING  │◄───────────────┐ retry-with-repair (budget remains)
        │         └────┬─────┘                │
        │              │ dispatch             │
        │         ┌────▼─────┐                │
        │         │ RUNNING  │  ← LLM works here (non-deterministic)
        │         └────┬─────┘                │
        │   ┌──────────┼───────────┐          │
        │ output    deadline      crash       │
        │ received  exceeded        │         │
        │   │          │            │         │
        │ ┌─▼────────┐ │            │         │
        │ │VALIDATING│ │            │         │
        │ └─┬──────┬─┘ │            │         │
        │ pass   fail  │            │         │
        │   │      └───┼────────────┼─────────┤   (validation failure = a CONTROL SIGNAL,
        │   │          │            │         │    not a dead end → loop back with the
        │ ┌─▼───────┐ ┌▼─────────┐ ┌▼──────┐  │    reason injected as repair context)
        │ │SUCCEEDED│ │TIMED_OUT │ │FAILED │  │
        │ └─────────┘ └────┬─────┘ └───┬───┘  │
        │  persist          └──────────┴──────┘ budget remains? → retry; else ↓
        │  result                          ┌──────────┐
        │  to store                        │ABANDONED │ (gracefully give up; quorum
        │                                  └──────────┘  may already be met without it)
```

**Terminal states:** `SUCCEEDED`, `ABANDONED`. Each transition's *effect* is one regulatory member:

| Transition | Member |
|---|---|
| `PENDING → RUNNING` | scheduler / dispatch |
| `RUNNING → VALIDATING` | **sensor** (output arrived) |
| `VALIDATING → SUCCEEDED` + persist | **buffer** (capture state) |
| `VALIDATING → (repair) → PENDING` | **governor** (validation as feedback — see §6.3) |
| `RUNNING → TIMED_OUT` (watchdog) | **governor/sensor** — *the member #76 lacked* |
| `RUNNING → FAILED` (crash) | **supervisor** (sense death) |
| `FAILED/TIMED_OUT → PENDING` (retries left) | **supervisor** (restart) |
| `→ ABANDONED` | **supervisor** (graceful give-up) |

### Why this kills #76

Two properties, both falling straight out of the machine:

1. **The barrier waits on a *quorum of terminal states*, not on every unit reaching `SUCCEEDED`.**
   A watchdog forces any over-deadline `RUNNING` unit to `TIMED_OUT → ABANDONED`. One straggler can
   never hold the loop.
2. **`SUCCEEDED` persists its output immediately.** Abandoning a straggler therefore loses nothing —
   the buffer makes the give *non-lossy*. (Slack alone bends; the store is what makes bending safe.)

### Durability & resume

Because state is external and transitions are deterministic, a crashed run reloads the store and
continues from the last terminal states. Use **step-memoization** for this, not deterministic-replay
(§6.1).

---

## 6. Research findings

A `deep-research` run (adversarially verified; see §7 for how, and the caveats) produced these. They
**confirmed** the design above and **sharpened** one part of it.

### 6.1 Durability: use step-memoization, not deterministic-replay

**Durable execution** = a workflow that survives a crash and resumes without redoing finished work.
Two ways to build it:

- **Deterministic replay (Temporal-style):** on resume, re-run the workflow code from the top,
  skipping side-effects by reading a recorded log. Requires the code path to be *identical* every
  run — which **breaks on non-determinism** (LLM calls, randomness, time). Also the log grows
  unbounded (Temporal caps ~50k events / 50MB).
- **Step-memoization (Inngest-style):** store each step's result keyed by id; on resume, skip steps
  that already have a stored result. Never re-runs the whole function; doesn't care if a step was
  unpredictable, because it saved the *result*, not the *path*.

> **Because LLM calls are non-deterministic, use step-memoization.** Deterministic replay literally
> breaks on the thing that makes agents useful. *(Confidence: high.)*

This *is* the passive state store from §4a — the research told us which flavor to build.

### 6.2 Model each call as a discrete, independently-retriable, persisted step

Each `agent()` call = one durable step: run once, persist output by id, on resume read the persisted
output. **Trap:** the non-deterministic part (the LLM call) **must live *inside* the saved step**, so
its variable output is captured once. If it leaks outside a saved step, resume re-rolls the dice and
corrupts everything downstream. *(Confidence: high.)* This is the per-unit FSM of §5.

### 6.3 Validation = a control signal feeding repair-retry, NOT a terminal gate

**This is the one finding that *changed* the design.** The naive design validates output and routes
pass→`SUCCEEDED` / fail→`FAILED` (a yes/no gate). That is wrong for two reasons:

1. **A gate catches only *detectable* faults** — malformed output, missing fields, crashes, timeouts.
   It **cannot** catch *wrong-but-plausible* output (a confident hallucination that passes every
   schema check). ~75% of multi-agent failures are **silent semantic errors** that throw no
   exception. A schema check gives **false confidence**: it certifies the *shape*, never the *truth*.
2. **Throwing a failed result away wastes it.** Feed the failure back as information ("invalid
   because X") and **retry with that correction injected** — validation as a *proofreader who hands
   the draft back*, not a *bouncer*.

> **The `VALIDATING` state routes failures to `RETRYING` with repaired context, reaching `ABANDONED`
> only after the retry budget is spent.** Validation *is* the sensor + comparator of the return path —
> the passive store holds state; validation is the active read that closes the loop. *(Confidence:
> high; best-sourced finding.)*

**Where guards give false confidence (the explicit list):**
- Schema validation / self-consistency catch only detectable faults; silent semantic failures need
  active validation.
- Validators have a **non-zero false-negative floor** and a false-rejection (over-retry) risk →
  thresholds must be tuned.
- **Durable-execution guards** give false confidence: durability prevents *losing* work, not work
  being *wrong*. ~42% of failures are specification failures and ~37% inter-agent coordination —
  neither is touched by durability.

### 6.4 Hand-roll the FSM; adopt heavy infra only for hard crash-resumability

Heavy durable-execution frameworks (Temporal, Inngest, etc.) are industrial infrastructure for
long-running, cross-machine, mission-critical workflows. For short Claude Code runs where re-running
is cheap, that's overkill — **hand-roll a minimal FSM + a persisted step-result map.**

> **Durability ≠ regulation.** A framework gives you the *passive* half (persistence/resume) for
> free. The *active* half — timeout, barrier, retry, abandon — you build **regardless**. Adopting
> Temporal would **not** have fixed #76, because the hang was never a durability problem.
> *(Confidence: medium — synthesis.)*

### 6.5 Caveats (respect these)

- **Refuted numbers — do not cite.** The verifiers *refuted* the headline statistics from the primary
  self-healing paper ("reduces silent failures to 0.0%"; "98.8% vs 94.5% task success"). Only the
  *qualitative direction* survives (validation-in-the-loop helps; targeted recovery plausibly beats
  uniform retry). Treat as architecture guidance, not measured guarantees.
- **Vendor docs.** Findings 6.1/6.2 rest partly on Inngest's own marketing docs — treat
  step-memoization as *one validated pattern*, not the only correct one.
- **Preprints.** Strongest sources are 2025–2026 arXiv preprints, not independently replicated; this
  is a fast-moving area.
- **The research GAP.** The run found **almost no evidence** on the fan-out barrier mechanics we care
  most about (quorum thresholds, hedged requests, supervisor-restart policy) and **none** on XState,
  AWS Step Functions, LangGraph, Restate, or Erlang/OTP supervision trees. That knowledge is largely
  unwritten where web search reaches — **but we answered it empirically ourselves** (§7).

### 6.6 Useful sources

- Inngest — durable execution / step memoization: `inngest.com/docs/learn/how-functions-are-executed`,
  `…/versioning`
- Temporal (by contrast) — durable execution / deterministic replay: `temporal.io/blog/what-is-durable-execution`
- LangGraph persistence: `docs.langchain.com/oss/python/langgraph/persistence`
- Azure Durable Task for AI agents (two-pattern model): `learn.microsoft.com/azure/durable-task/sdks/durable-task-for-ai-agents`
- Validation-in-the-loop (primary): arXiv `2606.01416`; corroborating: `2505.18585` (RvLLM),
  `2503.11951` (SagaLLM), `2511.14435` (Watchdogs and Oracles), `2503.18666` (AgentSpec)
- Silent-failure / MAS reliability: arXiv `2601.00481` (~75% silent semantic failures; LLM-judge
  attribution diverges across judge models)

---

## 7. Worked example: the deep-research harness

The `deep-research` harness is a near-perfect specimen of the system this document critiques, which
makes it the ideal first thing to fix.

### Its structure
`Scope` (1 agent) → `pipeline`(Search → URL-dedup → Fetch+extract) → `Verify` (3-vote adversarial,
**one hard barrier**) → `Synthesize` (1 agent). Each `agent()` uses a `schema:` (forces structured
output, runtime re-prompts on shape mismatch). A `null` agent result is treated as abstain (verify)
or drop (fetch). Verify "survives" a claim only on ≥2 valid votes with <2 refuting (a quorum rule).

### Mapped to the three legs
- **Bones:** the JS script (phase order, pipeline/parallel structure, dedup, ranking, quorum math).
- **Muscle:** every `agent()` call.
- **State:** mostly *ephemeral* in-memory variables during the run; the only durable state is the
  Workflow tool's journal (`resumeFromRunId` = step-memoization, inherited from the runtime, not owned
  by the harness).
- **Return path:** **almost entirely absent.** It is an **open-loop** (feedforward) system: scope →
  fan out → collect → synthesize → done. **#76 was that open loop seizing.**

### Per-call FSM, as actually implemented
A degenerate `RUNNING → { SUCCEEDED | null }`. No `VALIDATING`-with-repair, no `RETRYING`, no
`TIMED_OUT` (originally), no `ABANDONED`-after-budget. The two ends exist; the regulating middle —
the return path — does not.

### What it does well
- **Adversarial multi-vote verification** is genuine *semantic* validation (skeptics attack content),
  the deep kind §6.3 demands.
- **Quorum tolerance** is a real redundancy member.
- **`pipeline` for search→fetch** has no barrier, so one slow fetch doesn't block others. Brittleness
  is concentrated in the one **hard verify barrier** — exactly where it deadlocked.

### Its gaps (vs. §5/§6)
- Open-loop: no return path. **Verify is used as a terminal gate, not a repair loop** — a refuted or
  abstained claim is discarded, never sent back to seek better evidence (the §6.3 anti-pattern).
- No per-agent timeout originally (the #76 cause).
- No supervisor/restart; no retry of abstained/timed-out work.
- State is ephemeral within a run.

### The experiment (empirical proof of the design)

Two runs, after adding a feature-detected per-agent timeout (`withTimeout(agent)→null`) and putting
the high-count leaf agents on haiku:

| | Run 1 | Run 2 |
|---|---|---|
| Config | 25 claims × 3 votes (~75 agents at one barrier), 150s timeout | **5 claims × 3 votes (15 — under the ~16 concurrency cap)**, 240s timeout |
| Deadlock? | **No** (cured) | **No** |
| Timeouts | 23 | 4 |
| Outcome | Completed but **empty** (1/12 adjudicated; synthesis timed out) | **Completed with a real report** (3/5 confirmed) |

**Lessons:**
- **Liveness fixed by the timeout alone** — no freeze in either run. The minimal change cured #76.
- **But a bare timeout is lossy.** Run 1 cascaded: `Promise.race` frees the *await* but **not the
  concurrency slot** — orphaned timed-out agents kept holding slots, starving the rest. The bare
  timeout (the rejected "slack") gives liveness, not non-lossiness — *exactly as the design predicts.*
- **Run 2 worked because of the full pattern:** keeping the fan-out **under the concurrency cap** (no
  queue to starve) **plus 3-vote quorum** that absorbed the residual ~1-abstain-per-claim. Even under
  the cap there's a *baseline* per-agent flakiness (tool bugs, §8) that never reaches zero — so
  **redundancy is load-bearing, not optional.**

> **The empirical result: watchdog-timeout + quorum-redundancy + fan-out-under-the-cap = a working
> fail-successfully barrier.** We answered the fan-out-fault-tolerance question (the §6.5 research
> gap) by *living* it.

**Caveat for the future build:** `Promise.race` is *fake* abandonment — it stops *waiting* on the
agent but does not *kill* it or free its slot. Real preemption needs runtime support (see §8); from
inside a script the only mitigation is keeping the fan-out small enough that slot starvation can't
set in.

---

## 8. Known Claude Code tool constraints

A web check (GitHub `anthropics/claude-code`) confirmed #76 is a **known, actively-tracked gap in the
tool itself** — not our config, and **not the model** (it freezes on Opus too). Root causes live
*below* the workflow script, so script-level fixes are **blast-radius reduction, not cures.**

| Issue | What it is | Implication for us |
|---|---|---|
| **#49150** | `Task()` has no timeout → orchestrator hangs indefinitely, *especially on Windows* | This *is* #76. We're on Windows. Watchdog must be self-imposed. |
| **#37521** | Subagent freezes on **Opus 4.6** too — no timeout/error/recovery | The freeze is **not** a model/haiku problem. Don't "fix" it by upgrading the model. |
| **#68502** | HTTP 529 overload: parallel subagents hard-fail, no backoff; "fan-out steps fail first" | Keep concurrent fan-out low to avoid load-shedding. |
| **#14124** | Parallel subagents freeze on SQLite lock contention (`__store.db`) | Another reason to keep fan-out modest. |
| **#59962 / #20236** | Completed subagent work left stuck `in_progress`; `TaskOutput` hangs after completion | State-reconciliation is unreliable; don't trust "still running" naively. |
| concurrency cap | `agent()` capped at `min(16, cpu_cores − 2)` | Keep a fan-out batch ≤ the cap so nothing queues (the queued-timer cascade). |

Two takeaways:
1. **`setTimeout`/`clearTimeout` *are* available** in the workflow sandbox (`hasTimer: true`), so a
   script *can* self-impose timeouts. (Note: `Date.now`/`Math.random`/`new Date()` are banned to keep
   runs resumable.)
2. The community is asking Anthropic for **exactly our regulatory family** — timeout, watchdog,
   monitoring, abort, retry-with-backoff, graceful degradation, configurable concurrency,
   state-reconciliation. Our first-principles "third leg" is, item-for-item, the tool's own missing
   feature set. Some of this may eventually ship in the runtime, reducing what we must hand-build.

---

## 9. What to build (the spec for future-you)

The deliverable is a **reusable orchestration primitive**: the per-unit lifecycle FSM (§5) plus the
regulatory family (§4b), with the validation-as-feedback correction (§6.3). Suggested order, smallest
useful first:

1. **Per-unit lifecycle FSM** wrapping each `agent()`/tool call: `PENDING → RUNNING → VALIDATING →
   {SUCCEEDED | RETRYING(repair) | TIMED_OUT} → ABANDONED`.
2. **Watchdog (per-step timeout).** Feature-detect `setTimeout`; on timeout → terminal state, never a
   frozen await. (Accept that script-level timeout is non-preemptive; pair with #4.)
3. **Quorum/partial barrier.** Wait on a quorum of *terminal* states, not all-`SUCCEEDED`. Redundancy
   is load-bearing (§7).
4. **Fan-out under the concurrency cap.** Batch so a single `parallel()` stays ≤ `min(16, cores−2)`;
   nothing should queue behind a saturated pool.
5. **Durable step-result store** (step-memoization, §6.1): persist each step's output by id; resume
   reads it instead of re-invoking. Make state an *explicit, harness-owned* store (not ephemeral
   variables), with distilled state variables (§4a), not transcripts.
6. **Validation-as-feedback (§6.3):** route `VALIDATING` failures to `RETRYING` with the reason
   injected as repair context; `ABANDONED` only after the retry budget. Use *semantic* validation
   (LLM-judge / adversarial), not just schema — and remember the judge is itself fallible (§6.3, §11
   Ashby).
7. **Supervisor / observability:** sense hangs/deaths; log abandons and timeouts so the run is
   inspectable (you cannot regulate what you cannot sense).

**First refactor target:** the `deep-research` harness (§7) — turn its terminal verify *gate* into a
repair *loop*, give each step a real lifecycle, and make its state an explicit store.

**Success test (the falsification harness, not vibes):** **fault injection vs. stated invariants** —
deliberately inject stalls, invalid/hallucinated outputs, and crashes, and measure whether the
system's deterministic invariants still hold (it completes, returns valid shape, makes progress,
degrades gracefully). "Reduce metaphor to a measurable guarantee." This is the difference between a
design and an architecture.

**Repo integration:** this overlaps the `orchestration-layer-foundation` plan's **Phase 2**
("fail-successfully" + per-edge hard/soft gate classification). When building, reconcile with that
plan rather than duplicating it. The build itself is an **L-sized** effort → it should go through
`brainstorming` → `writing-plans` → `plan-gate` (architect review) before execution, per repo
workflow.

---

## 10. Open questions

1. **Fan-out barrier numbers.** What concrete quorum thresholds (proceed at N-of-M), timeout values,
   and hedged-request triggers are right? We have an empirical *pattern* (§7) but not tuned numbers,
   and the literature didn't supply them (§6.5).
2. **Framework comparison unmade.** XState, AWS Step Functions, LangGraph, Restate, Erlang/OTP
   supervision trees got zero surviving evidence — a real comparison for *this* use case is still
   owed if "adopt" is ever reconsidered over "hand-roll."
3. **Real preemption needs runtime support.** From a script you can stop *waiting* on an agent but not
   *kill* it (free its slot). Either keep fan-out small forever, or wait for Anthropic to ship
   abortable subagents (§8). Decide which.
4. **Tuning the `VALIDATING` guard.** How to balance the validator's false-negative floor against
   over-retry, and which self-consistency / LLM-as-judge configuration minimizes false confidence.
5. **Does the active regulator have to be an LLM?** Ashby's requisite variety (§11) implies a
   high-variety (cognitive) worker may need a cognitive regulator — but LLM-judges are themselves
   unstable across judge models (§6.5). How much regulation can a *cheap, deterministic* governor do?

---

## 11. Glossary

- **Determinate / deterministic** — same input → same output, exactly, every time. Code.
- **Indeterminate / non-deterministic** — output varies run-to-run. LLMs, reality.
- **Open-loop (feedforward)** — output is produced and never measured/corrected. Brittle to surprise.
- **Closed-loop (feedback)** — output is sensed and fed back to adjust behaviour. The "return path."
- **State (EE sense)** — the values stored in a system's passive elements that determine its future
  behaviour. *Not* the full history — the distilled current condition.
- **FSM (finite state machine)** — a system defined by a set of states and the deterministic
  transitions between them, driven by events.
- **Durable execution** — a workflow that survives crashes and resumes without redoing finished work.
- **Step-memoization** — durability by storing each step's result and skipping completed steps on
  resume (the "checklist on the fridge"). Tolerates non-determinism.
- **Deterministic replay** — durability by re-running the code from the top and replaying recorded
  side-effects (the "re-cook the recipe"). Breaks on non-determinism.
- **Idempotent** — safe to run more than once with the same effect; what lets retry be safe.
- **Quorum / partial barrier** — proceed once *enough* (N-of-M) results are in, rather than waiting
  for all. Tolerates stragglers.
- **Hedged request** — launch a duplicate of a slow task and take whichever finishes first; trades
  cost for tail-latency.
- **Supervisor** — a process whose only job is to watch workers and restart/abandon them on
  failure (cf. Erlang/OTP "let it crash" + supervision trees).
- **Schema validation** — checking output *shape* (fields/types). Shallow: catches malformed, not
  wrong-but-plausible.
- **LLM-as-judge** — using an LLM to evaluate another LLM's output (semantic validation). Deep but
  itself fallible/unstable across judge models.
- **Requisite variety (Ashby's Law)** — "only variety can absorb variety": a regulator must be at
  least as rich as the disturbances it controls. Implies regulating a cognitive worker may need a
  cognitive regulator.
- **Conant–Ashby theorem** — "every good regulator of a system must contain a model of that system."
  Why the gate-map / state store doubles as the system's self-model.
- **Concurrency cap** — the workflow runtime runs at most `min(16, cpu_cores − 2)` agents at once;
  excess queue.

---

## 12. Provenance

This document distills a single design session (2026-06-18). The reasoning trail and adversarial
challenges were captured in Phoenix-checklist sweeps at `plans/phoenix/` (gitignored, ephemeral —
their substance is folded into this doc). The deep-research experiment used a timeout-hardened copy
of the `deep-research` harness (runs `wf_916c0a9f`, then `wf_1b59f2e6`). Key facts also recorded in
the auto-memory `project_orchestration_third_leg`. The active (ephemeral) planning artifact is
`plans/orchestration-layer-foundation/`; this committed document is the durable source of truth and
should be kept current as the build proceeds.
