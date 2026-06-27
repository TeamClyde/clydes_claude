# Proposal Angles — Full Reference

Supporting reference for `skills/review-workflow/SKILL.md` § Step 4 — Propose fixes.

---

## Three Angles

Present each high-signal item as distinct angles — not a single recommendation.

**Angle 1 — Targeted fix:** Smallest change to the specific component exhibiting the behavior.
Lowest risk, fastest to execute. May not address root cause — note this explicitly.

**Angle 2 — Root cause fix:** Fix the underlying condition, which may be a different component
than the one in the feedback. Cite the specific Explore finding that supports this angle.

**Angle 3 — Structural fix:** A rule or governance change that prevents this class of problem
from recurring. Only propose when the Explore scan or Phoenix output surfaced a systemic
pattern. Do not default to this for every item.

Angles may converge on the same change from different directions — that is signal the fix is
sound. Present all angles with tradeoffs. Wait for user to choose or combine before executing.

---

## Execution Routing Table

Execute each approved fix using this routing table:

| Fix type | Action |
|----------|--------|
| Skill update | Invoke `writing-skills` skill with the proposed change |
| New skill | Route through `creating-tools` skill |
| CLAUDE.md edit | Edit directly using Edit tool |
| Memory entry | Write to memory using Write tool |
| Rule update | Edit directly using Edit tool |
| Agent update | Edit directly using Edit tool |
