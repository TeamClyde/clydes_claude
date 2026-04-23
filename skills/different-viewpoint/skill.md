---
name: different-viewpoint
description: >
  Thinking tool — full CIA Phoenix Checklist sweep on a problem. Takes a problem statement and
  an optional hypothesis. Without a hypothesis, runs in problem-definition mode: surfaces what
  the unknown actually is before solutions are considered. With a hypothesis, runs the checklist
  with the hypothesis as context and flags answers that contradict or challenge it. The mechanism
  is answering ALL questions in order, including ones that seem irrelevant — those are often the
  ones that shift framing. Triggers on "different viewpoint", "phoenix checklist", "challenge my
  thinking", "am I solving the right problem", "stress test this solution", "full sweep".
argument-hint: "<problem statement> [hypothesis: <your current theory>]"
allowed-tools: Read, Write
---

# Different Viewpoint

Full CIA Phoenix Checklist sweep. Works through all questions in order — problem section first,
then plan section. Do not skip questions that seem obvious or irrelevant. The mechanism that
makes this work is committing written answers to questions you think you already know.

**Announce at start:** "I'm using the different-viewpoint skill to run a full Phoenix Checklist sweep."

---

## Input

**Problem statement** (required): The challenge you're facing — a feedback item, a design
decision, a bug you can't explain, or a direction you want to validate.

**Hypothesis** (optional): Your current theory about the solution or cause. Prefix with
`hypothesis:` in your args. Example:
> `/different-viewpoint the writing-plans skill is being skipped too often hypothesis: the trigger description doesn't match how users phrase the request`

---

## Two Modes

**Problem-definition mode** (no hypothesis supplied):
Answer each question without a solution in mind. Goal: surface what the actual unknown is
before any solution is considered. Many problems are mis-stated — this mode finds that.

**Hypothesis-challenge mode** (hypothesis supplied):
Answer each question with the hypothesis as background context. After each answer, note whether
it **supports**, **challenges**, or is **neutral** to the hypothesis. Goal: find the questions
where an honest answer makes the hypothesis look wrong.

---

## Phase 1 — Problem Section

Work through each question in order. Write an answer for every one. Do not skip.

**1. Why is it necessary to solve this problem?**

**2. What benefits will you receive by solving it?**

**3. What is the unknown?**

**4. What is it you don't yet understand?**

**5. What information do you already have?**

**6. What isn't the problem?**

**7. Is the information you have sufficient? Insufficient? Redundant? Contradictory?**

**8. Where are the boundaries of the problem?**

**9. Can you separate the various parts of the problem? List them.**

**10. Have you seen this problem before?**

**11. Have you seen this problem in a slightly different form?**

**12. Think of a familiar problem with the same or similar unknown. What is it?**

**13. Suppose you found a related problem that's already been solved. Could you use it?**

**14. Can you restate the problem in multiple different ways? (aim for at least 3)**

**15. What are the best, worst, and most probable cases you can imagine?**

---

## Phase 2 — Plan Section

Continue in order. Do not skip.

**16. Can you solve the whole problem? Or just part of it?**

**17. What would you like the resolution to be? Can you picture it clearly?**

**18. How much of the unknown can you determine from what you already have?**

**19. Can you derive something useful from the information you have?**

**20. Have you used all available information?**

**21. Have you taken into account all essential aspects of the problem?**

**22. Can you separate the steps in the problem-solving process?**

**23. What creative approaches could you use to generate ideas?**

**24. How many different kinds of results can you see?**

**25. How many different ways have you tried to solve this problem?**

**26. What have others done with this type of problem?**

**27. Can you intuit the solution? Can you check the result?**

**28. What should be done? How? Where? When?**

**29. Can you use this problem to solve some other problem?**

**30. What makes this problem unique from similar ones you've seen?**

**31. What milestones could mark your progress?**

**32. How will you know when you are successful?**

---

## Save Output

Generate a slug from the first 4–5 words of the problem statement (lowercase, hyphenated).
Write the complete Q&A to `plans/phoenix/<slug>.md`. Create the directory if it doesn't exist.

---

## Return to User

Do not return all 32 answers. Return only the **frame-shifting answers** — those where:
- The answer contradicted the starting assumption or hypothesis
- The answer revealed something you didn't know you didn't know
- The answer changed how the problem should be stated

Format each frame-shifting answer:

> **Q[N] — [question text]**
> Answer: [what the answer surfaced]
> Shift: [how this changes the framing or challenges the hypothesis]

If no answers shifted the framing, return: "Checklist complete. No frame shifts detected —
current framing appears sound." This is a valid and useful result.

---

## Gotchas

1. Do not skip questions that seem irrelevant — those are the mechanism.
2. In hypothesis-challenge mode, a "supports" result is not a win. The sweep looks for
   challengers, not validators.
3. Save the full Q&A to `plans/phoenix/` before returning the summary.
4. Generate the slug from the problem statement, not the hypothesis.
5. The `plans/phoenix/` directory may not exist yet — create it on first use.
