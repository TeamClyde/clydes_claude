---
name: vet-reputation
description: Use when you need to assess whether an open-source tool is reputable, well-maintained, and trustworthy before installing it. Gate 1 of the install-vetting funnel.
allowed-tools: WebFetch, WebSearch
---

# vet-reputation — Install-Vetting Gate 1

## Overview

Reputation, quality, and maintenance signal assessment for open-source tools. Emits a GREEN / YELLOW / RED tier plus supporting evidence. **Advisory only — never blocks; the orchestrator or user decides.**

See `rules/install-vetting.md` for the tier definitions and the full 3-gate funnel this skill feeds.

## Two Modes

### Mode A — `score-named`

Input: a named candidate (`<package>` or `github.com/<owner>/<repo>`).

Steps:

1. **Resolve the GitHub source.** If given a package name (npm, PyPI, cargo), derive the upstream GitHub repo from the registry page or README before querying deps.dev.

2. **Fetch deps.dev v3 project record.**

   ```
   GET https://api.deps.dev/v3/projects/github.com%2F{owner}%2F{repo}
   ```

   Public endpoint — no auth required. Note: only the `/` separating `github.com` from the `{owner}/{repo}` path is percent-encoded as `%2F`; `{owner}` and `{repo}` themselves are inserted literally (the slash between owner and repo is NOT encoded). Example: `.../github.com%2Fpallets%2Fflask`.

   Returns top-level fields:
   - `starsCount`, `forksCount`, `openIssuesCount`
   - `license`

   Inside the `scorecard` sub-object:
   - `scorecard.overallScore` (0–10, OpenSSF Scorecard aggregate)
   - `scorecard.checks[]` — an array of objects shaped `{ "name": "...", "score": <int>, "reason": "...", ... }`. Extract these four injection-relevant checks by name: `Code-Review`, `Branch-Protection`, `Dangerous-Workflow`, `Token-Permissions`. The per-check value field is `score` (integer 0–10). A check that could not be run returns `score: -1` (e.g. when token permissions are insufficient) — treat `-1` as "check unavailable", NOT as a failing score ≤ 2.

3. **Fetch maintenance recency from GitHub API (unauthenticated).**

   ```
   GET https://api.github.com/repos/{owner}/{repo}
   ```

   Extract: `pushed_at` (last-commit date), `archived` flag.

4. **Apply the risk rubric** (see below) and emit the tier report.

### Mode B — `discover-from-need`

Input: a capability need (e.g., "a Python type checker", "a JavaScript linter").

Steps:

1. **WebSearch** for top candidates matching the need. Target 3–5 candidates from search results, registry pages, or curated lists. Prefer candidates with a known GitHub source.

2. **Score each candidate** using the Mode A steps above.

3. **Rank** by OpenSSF Scorecard aggregate score (descending), breaking ties by maintenance recency. Stars are a weak tiebreaker only — cite the fake-star caveat when stars factor in.

4. **Emit a ranked shortlist** with per-candidate tier + signals, and a recommendation for the top pick.

## Risk Rubric

Apply in order. First matching rule sets the tier.

| Condition | Tier |
|---|---|
| `archived: true` | RED — archived, no longer maintained |
| No GitHub source found; registry-only package | YELLOW — reduced confidence (registry signals only; no Scorecard) |
| `scorecard.overallScore` < 4.0 | RED |
| Any of `Code-Review`, `Branch-Protection`, `Dangerous-Workflow`, `Token-Permissions` has `score` ≤ 2 (excluding `-1` — treat `-1` as unavailable, not failing) | YELLOW (flag which check failed) |
| `pushed_at` > 18 months ago | YELLOW — stale maintenance |
| `scorecard.overallScore` ≥ 7.0 and none of the above | GREEN |
| `scorecard.overallScore` 4.0–6.9 and none of the above | YELLOW |

**Stars caveat (always cite when stars appear in output):** Star counts are a weak signal. Fake-star campaigns are well-documented; high star counts do not confirm trustworthiness and must not override Scorecard-based tier decisions.

**Registry-only packages:** When no GitHub source is available, score on registry signals (download trend, publish frequency, license, version history) at explicitly reduced confidence. State "Scorecard unavailable — registry signals only" in the report.

## Output Format

```
## vet-reputation: <package-or-repo>

Tier: GREEN | YELLOW | RED

### Signals
- OpenSSF Scorecard: <overallScore>/10
- Code-Review check: <score>/10
- Branch-Protection check: <score>/10
- Dangerous-Workflow check: <score>/10
- Token-Permissions check: <score>/10
- Stars: <starsCount> ⚠ weak signal — fake-star caveat applies
- Last commit: <pushed_at>
- Archived: <yes/no>
- License: <license>

### Summary
<1–3 sentences explaining the tier decision>

### Caveats
<Any reduced-confidence notes, missing data, or flags>

Advisory — this report informs; it does not install or block. Proceed to Gate 2 (vet-capability-fit) and Gate 3 (vet-security) via vet-install.
```

For `discover-from-need`, precede the per-candidate blocks with a ranked table:

```
## Candidate Shortlist — <stated need>

| Rank | Candidate | Tier | Scorecard |
|------|-----------|------|-----------|
| 1    | ...       | GREEN | 8.2/10  |
| 2    | ...       | YELLOW | 6.1/10 |
...

Recommendation: <name> (rank 1) — <one sentence why>
```

## Graceful Degradation

- deps.dev returns 404 or no `scorecard` field → state "Scorecard unavailable", fall back to GitHub signals alone; downgrade confidence to YELLOW floor.
- GitHub API rate-limited (unauthenticated) → state "GitHub signals unavailable — used registry/deps.dev only"; do not error the report.
- Neither source available → YELLOW with "Insufficient data to score" note.

Never let a fetch failure abort the report. Always emit a tier, even if confidence is low.

## Gotchas

1. **Advisory-only is load-bearing.** The skill emits a report; it never installs or blocks. State this explicitly in every output.
2. **Resolve GitHub source first.** deps.dev requires `github.com/{owner}/{repo}` — don't call it with a bare npm/PyPI package name. Derive the upstream repo first.
3. **All four injection-relevant checks matter independently.** A high aggregate Scorecard score does not excuse a `Dangerous-Workflow` score of 0 — surface each check score separately.
4. **Stars are a tiebreaker, not a signal.** Never upgrade a YELLOW to GREEN on star count alone. Always cite the fake-star caveat.
5. **Registry-only packages get reduced confidence.** Explicitly state "Scorecard unavailable" and keep the tier at YELLOW floor regardless of registry signals.
6. **Bootstrap exception.** Per `rules/install-vetting.md`: OSV-Scanner and Cisco mcp-scanner are the pre-trusted scanner set. Do not run this skill on them.
