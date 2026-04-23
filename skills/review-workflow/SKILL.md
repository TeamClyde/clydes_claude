---
name: review-workflow
description: >
  Use when workflow friction issues have accumulated in TeamClyde/clydes_claude and you want
  to act on them — scanning the workflow system for context, proposing multi-angle fixes, and
  routing improvements to the right component. Run periodically or after several friction
  issues accumulate.
argument-hint: "(no arguments needed — reads open workflow-friction GitHub issues)"
allowed-tools: Read, Write, Edit, Glob, Agent
---

# review-workflow

Triage and act on accumulated workflow feedback from GitHub issues.

**Announce at start:** "I'm using the review-workflow skill to triage workflow feedback."

---

## The Process

### Step 1 — Load feedback

Spawn an Agent to fetch open issues:

> Run: `gh issue list --repo TeamClyde/clydes_claude --label "workflow-friction" --state open --json number,title,body,url`
> Parse the JSON and return each issue as: `#[number] [title] | Category: [value of **Category:** field in body] | URL: [url]`
> If the list is empty, return: "No open workflow-friction issues."

If the agent returns no open issues, respond: "No feedback logged yet. Use /feedback to capture
friction as you work." and stop.

### Step 2 — Group, analyze, and surface merge candidates

Group open issues by `Category`. For each group, note:
- How many issues
- Which skills appear most often
- Any pattern in the context (same repo? same plan type?)

Identify the top 2–3 highest-signal items using these signals:
- Same category appears 3+ times → systemic issue
- Same skill appears in 2+ issues → that skill needs work
- "circular-reasoning" or "missing-capability" issues → high priority regardless of count

Before continuing: look for issues that appear to share the same root cause even if
categorized differently. Surface any merge candidates to the user:

> "Issues #N and #M appear to share the same root cause ([one sentence explanation]).
> Treat as one item?"

Wait for user confirmation before merging. Do not merge silently.

### Step 3 — Explore scan (per item)

For each high-signal item (or merged group), run a targeted scan before proposing anything.

**3a. Read `docs/workflow-map.md`**

Use the map to identify which components are in scope for this item. Do not read every
component file — the map is the index.

**3b. Dispatch an Explore agent**

```
Agent {
  subagent_type: "Explore",
  prompt: "Given this workflow feedback: [issue title + body summary]. The components in scope appear to be: [component names from workflow-map]. Answer two questions: (1) Does any existing skill or agent already handle this concern, directly or partially? Could it be extended rather than replaced? (2) What other components reference or invoke [affected component]? Would changing it break or conflict with anything downstream?"
}
```

**3c. Handle the response**

- Findings returned: record them, proceed to 3d
- Nothing relevant returned: do not treat as clean — re-dispatch with broader framing:
  > "Look more broadly across the workflow — are there any components that handle similar
  > concerns, even indirectly? What patterns exist near this problem area?"
  Trust the second answer.
- Second dispatch also returns nothing: note "no related components found" and proceed.

**3d. Chain follow-up dispatches if needed**

If the Explore answer opens new threads ("component X also does Y, which might be relevant"),
dispatch a targeted follow-up Explore for those threads. Cap at 3 total Explore dispatches per
item. Trust each answer — do not re-read files the agent already covered.

### Step 3.5 — Size the fix

Using the Explore findings, determine whether this fix is M-sized or a minor tweak.

**M-sized — invoke `/different-viewpoint` before proposing:**
- Changes the core logic or decision flow of a skill (not just wording)
- Adds, removes, or reorders a step in a multi-step process
- Changes how two components interact or hand off to each other
- Introduces a new behavior or capability
- Affects a component that multiple other components reference

**Minor tweak — skip Phoenix, proceed to Step 4:**
- Adjusting wording, phrasing, or a sentence
- Updating a trigger description without changing scope
- Fixing a dead reference (name mismatch, path correction)
- Adding a Gotcha entry

**For M-sized items, invoke:**

```
Skill {
  skill: "different-viewpoint",
  args: "[issue title]. [One sentence describing the proposed fix direction based on Explore findings]"
}
```

Wait for completion. Use the frame-shifting answers to inform proposals in Step 4. "No frame
shifts detected" is a valid result — proceed with original direction.

### Step 4 — Propose fixes

For each item, generate proposals from the combined Explore findings and Phoenix output (if
run). Present as distinct angles — not a single recommendation.

**Angle 1 — Targeted fix:** Smallest change to the specific component exhibiting the behavior.
Lowest risk, fastest to execute. May not address root cause — note this explicitly.

**Angle 2 — Root cause fix:** Fix the underlying condition, which may be a different component
than the one in the feedback. Cite the specific Explore finding that supports this angle.

**Angle 3 — Structural fix:** A rule or governance change that prevents this class of problem
from recurring. Only propose when the Explore scan or Phoenix output surfaced a systemic
pattern. Do not default to this for every item.

Angles may converge on the same change from different directions — that is signal the fix is
sound. Present all angles with tradeoffs. Wait for user to choose or combine before executing.

Execute each approved fix using this routing table:

| Fix type | Action |
|----------|--------|
| Skill update | Invoke `writing-skills` skill with the proposed change |
| New skill | Route through `creating-tools` skill |
| CLAUDE.md edit | Edit directly using Edit tool |
| Memory entry | Write to memory using Write tool |
| Rule update | Edit directly using Edit tool |
| Agent update | Edit directly using Edit tool |

### Step 5 — Execute approved fixes

Execute one fix at a time. Do not batch.

After executing each fix, close the corresponding GitHub issue. Spawn an Agent:

> For each of the following issue numbers, run:
> ```bash
> gh issue comment [N] --repo TeamClyde/clydes_claude --body "Resolved: [brief description of fix applied]"
> gh issue close [N] --repo TeamClyde/clydes_claude
> ```
> Issues to close: [#N, #N, ...]

### Step 6 — Adversarial review

After all fixes are executed, run a critical challenge pass before committing. Do not summarize
or congratulate — assume something went wrong and look for it.

Check each of the following:

**1. Did the fix address the right problem?**
Does the change map back to the issue as originally stated, or did it drift to solving an
adjacent concern? If it drifted, flag it explicitly.

**2. Does it contradict the workflow map?**
Re-read the relevant rows in `docs/workflow-map.md`. Does anything just changed conflict with
how the map describes these components' connections or invocation patterns?

**3. Is it more complex than necessary?**
Could the same outcome have been achieved with a smaller change? If a new step was added where
editing an existing sentence would have worked, flag that.

**4. Does `workflow-map.md` need updating?**
If a component's behavior, invocation pattern, or connections changed, update the map now.

For any flag raised: surface it to the user with a specific question before proceeding.
Do not silently resolve flags.

### Step 7 — Commit changes

After the adversarial review passes (or all flags are resolved), invoke `git-manager`:

```
Skill { skill: "git-manager", args: "commit files: [<all modified skill/rule/agent/map files>] type: chore description: 'apply workflow improvements from feedback review'" }
```

Include every file touched in Steps 4–6, including `docs/workflow-map.md` if it was updated.

### Step 8 — Summary

Report: N issues reviewed, M resolved (closed), K deferred (and why). Include the commit hash.

---

## Notes

- Do not batch fixes — present one at a time and wait for approval
- Do not attempt fixes without user approval — propose first, execute second
- Closed GitHub issues are skipped in Step 2 (label filter returns only open issues)
- If a fix requires a plan doc (L-sized work), create one via brainstorming rather than
  executing inline
- The Explore scan in Step 3 runs per item, not once per session

## Gotchas

1. Run only when multiple issues have accumulated — single-issue reviews are too narrow.
2. Angle 3 (structural fix) only when Explore or Phoenix found a systemic pattern.
3. New skill creation routes through `creating-tools`, not direct `writing-skills`.
4. The adversarial review in Step 6 is not optional — even for obviously correct fixes.
5. "No frame shifts detected" from `/different-viewpoint` is valid — proceed with original
   direction, not a reason to keep re-running.
