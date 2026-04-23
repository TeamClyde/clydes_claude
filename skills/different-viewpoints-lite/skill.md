---
name: different-viewpoints-lite
description: >
  Thinking tool — adversarial 5-question Phoenix Checklist challenge against a problem and
  optional hypothesis. Unlike different-viewpoint (full sweep in order), this selects the 5
  questions most likely to falsify or expose flaws in current thinking. Without a hypothesis,
  selects questions most likely to surface what the real problem actually is. Selection is
  adversarial: most threatening questions, not most topically related. Triggers on "different
  viewpoints lite", "quick adversarial check", "challenge this hypothesis", "find the flaw",
  "stress test lite".
argument-hint: "<problem statement> [hypothesis: <your current theory>]"
allowed-tools: Read, Write
---

# Different Viewpoints Lite

Adversarial 5-question Phoenix Checklist challenge. Selects the questions most threatening to
current thinking — not the most related, the most falsifying.

**Announce at start:** "I'm using the different-viewpoints-lite skill to run an adversarial challenge."

---

## Input

Same format as `/different-viewpoint`. Problem statement required; hypothesis optional.

---

## Two Modes

**Problem-definition mode** (no hypothesis): Select 5 questions most likely to surface what
the actual unknown is. Prefer boundary questions, restatement, and "what isn't the problem."

**Hypothesis-challenge mode** (hypothesis provided): Select 5 questions whose honest answers
are most likely to falsify the hypothesis. Prefer scope questions, information-completeness
questions, and worst-case framing.

---

## Full Question Bank

**Problem questions:**
- P1. Why is it necessary to solve this problem?
- P2. What benefits will you receive by solving it?
- P3. What is the unknown?
- P4. What is it you don't yet understand?
- P5. What information do you already have?
- P6. What isn't the problem?
- P7. Is the information sufficient? Insufficient? Redundant? Contradictory?
- P8. Where are the boundaries of the problem?
- P9. Can you separate the parts of the problem? List them.
- P10. Have you seen this problem before?
- P11. Have you seen this problem in a slightly different form?
- P12. Think of a familiar problem with the same unknown.
- P13. Could you use a related solved problem?
- P14. Can you restate the problem in multiple ways?
- P15. What are the best, worst, and most probable cases?

**Plan questions:**
- S1. Can you solve the whole problem? Part of it?
- S2. What would the resolution look like?
- S3. How much of the unknown can you determine from what you have?
- S4. Can you derive something useful from the information you have?
- S5. Have you used all available information?
- S6. Have you taken into account all essential aspects?
- S7. Can you separate the problem-solving steps?
- S8. What creative approaches could you use?
- S9. How many different kinds of results can you see?
- S10. How many different ways have you tried?
- S11. What have others done with this type of problem?
- S12. Can you intuit the solution? Can you check the result?
- S13. What should be done, how, where, when?
- S14. Can you use this problem to solve some other problem?
- S15. What makes this problem unique?
- S16. How will you know when you are successful?

---

## Selection Criteria

Follow this three-step process. Do not select directly from the full 32.

**Step 1 — Identify threat categories**

Before looking at the question bank, name the 2–3 threat categories this specific hypothesis
is most vulnerable to. Choose from:
- Scope wrong (the problem or fix is broader/narrower than framed)
- Information incomplete (key facts not yet known)
- Wrong component/mechanism (the proposed fix targets the wrong part)
- Constraint missed (a hard limit that makes the fix unworkable)
- Timing/ordering error (sequence assumption is wrong)
- Success criteria undefined (no way to verify it worked)
- Reversibility not considered (fix creates a new, harder problem)

**Step 2 — Generate a candidate pool**

From those 2–3 threat categories, identify ~8 questions from the bank that probe those
specific threats. Ignore questions that are not relevant to the named categories.

**Step 3 — Apply negative constraint, then select 5**

From the candidate pool, select 5 with the highest damage potential for THIS hypothesis.

Before finalizing: if more than 2 of {P6, S16, P8, S6, P15} appear in your selection,
each must be explicitly justified as the most threatening question for this specific
hypothesis — or replaced with a more hypothesis-specific alternative. These 5 are a known
default set; defaulting to them signals the threat-category step was skipped.

Per-question reasoning must be tied to the specific hypothesis, not generic
("this is always a good question" is not valid justification).

---

## Answer Each Question Adversarially

For each of the 5 selected questions:
1. State the question and why it was selected (one sentence)
2. Answer it honestly, without softening
3. State explicitly: "If this undermines the hypothesis, here's how: [explanation]"

---

## Save Output

Slug from first 4–5 words of problem statement. Save to `plans/phoenix/<slug>-lite.md`.

---

## Return to User

After all 5 questions, give a verdict:

- **Hypothesis survived** — none of the 5 adversarial answers found a material flaw
- **Hypothesis weakened** — [N] answers raised concerns worth addressing before proceeding
- **Hypothesis challenged** — a significant flaw was found; recommend running full
  `/different-viewpoint` before acting

List which questions were selected and one-line reason for each.

---

## Gotchas

1. Selection must be adversarial, not topical. Picking comfortable questions defeats the purpose.
2. "Hypothesis survived" means this challenge didn't break it — not that it's correct.
3. If verdict is "challenged", always recommend the full sweep before acting.
4. Save before returning the verdict.
