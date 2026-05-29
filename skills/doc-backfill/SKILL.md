---
name: doc-backfill
description: Use when bringing an existing repo's code up to the hybrid Explanation layout (docs/explanation/architecture.md + features/<slug>.md) for the first time. Reads codebase graph (codebase-memory-mcp) to identify C2 containers and C3 components; invokes doc-author per detected file; surfaces all drafts for user review in one pass. Whole-repo one-shot — no per-feature mode in v1. Triggers on "/doc-backfill", "backfill docs", "generate feature docs for repo", "bootstrap arc42 docs".
allowed-tools: Read, Skill, get_architecture, query_graph, search_graph, search_code
---

# doc-backfill — Whole-Repo Codegraph-Driven Doc Bootstrap

## Overview

One-shot skill that reads the codebase graph and produces a full first-pass of:

- `docs/explanation/architecture.md` (C1 + C2 system context)
- `docs/explanation/features/<slug>.md` per detected C3 component

Dispatches `doc-author` for every target. Never writes docs directly. User reviews all drafts before any commit.

## Hard Gates (enforce before every step)

| Gate | When | Violation behaviour |
|---|---|---|
| CODEBASE.md exists | Before codegraph harvest | Refuse — see Refuse Rules |
| User confirmed target list | Before generation | Stop and wait |
| User accepted each draft | Before each commit | Skip or defer — never auto-commit |

## Execution (no args)

### Step 1 — Preflight

Check that `.claude-init/CODEBASE.md` exists.

If missing → **refuse immediately:**

> Run `/infra-init` first to build the codegraph before `/doc-backfill` can run.

Do not proceed past this point without CODEBASE.md.

### Step 2 — Codegraph Harvest (single pass)

Read the canonical project name from the repo's `CLAUDE.md` under the "Codebase Knowledge Graph" section. Do NOT derive the name from the file path — the path-to-name conversion is lossy. If CLAUDE.md does not have that section, run `list_projects()` and match on `repo_path`.

With the project name in hand:

1. `get_architecture(project=<name>)` — entry points, module clusters, top-level boundaries.
2. `query_graph(project=<name>, cypher="MATCH (a)-[:IMPORTS]->(b) RETURN a, b")` — dependency edges across the graph.
3. `search_graph(project=<name>, filter=Route)` — external interface surfaces (routes, handlers, entrypoints).
4. `search_code(project=<name>, query=<heuristic-seeds>)` — fill sparse clusters the above three miss. Heuristic seeds: class/function names from entry-point files that didn't appear in clusters.

All four calls run once. No second pass.

### Step 3 — Component Identification

From the harvest data, identify:

**C2 candidates** (architecture.md): top-level service or binary boundaries. Multiple services collapse into one `architecture.md` — do not create one per service.

**C3 candidates** (features/*.md): graph clusters that meet the cohesion threshold:
- Cluster size ≥ 3 nodes (files or functions)
- Internal edge density ≥ external edges (more calls within the cluster than across it)
- A recognisable domain name can be derived from the dominant node names

Clusters that have nodes but do not meet the threshold are flagged as sparse. They surface as `<!-- TODO: sparse cluster — verify if standalone feature -->` in the architecture draft, not as separate feature files.

**Present summary to the user before generating anything:**

> Detected: 1 architecture + N features: [list of slugs]. Proceed / adjust / cancel?

**Wait for explicit confirmation.** If the user adjusts the list, use their version. If the user cancels, stop.

### Step 4 — Generation

Invoke `doc-author` for each target in order. **Do not write doc content directly.**

First:

```
Skill { skill: "doc-author", args: "target=docs/explanation/architecture.md mode=create context-source=codegraph accepted-adrs=[]" }
```

Then for each confirmed C3 candidate, where `<slug>` is derived from the cluster name (lowercase, hyphens, no special chars):

```
Skill { skill: "doc-author", args: "target=docs/explanation/features/<slug>.md mode=create context-source=codegraph accepted-adrs=[]" }
```

Collect all returned drafts. Do not commit anything yet.

### Step 5 — User Review Pass

Surface all drafts together. For each file show:

- Target path
- Draft content (or diff from scaffold if architecture.md scaffold already existed)
- Accept / edit / decline prompt

Wait for the user's decision on each file. Do not infer acceptance from silence.

### Step 6 — Commit (per accepted draft)

For each **accepted** draft, invoke `git-manager`:

```
Skill { skill: "git-manager", args: "commit files: [<target-path>] type: docs description: 'add <slug> explanation doc (codegraph backfill)' [no-plan-update]" }
```

For each **declined** draft: surface as future work. Do not commit. Do not delete. Log the declined path so the user has the list.

## C1 Actor Limitation

The C1 System Context section in `architecture.md` describes external actors (users, upstream services, third-party APIs). The codegraph has no data about external actors — it only sees internal code. `doc-backfill` always writes:

```html
<!-- TODO: list external actors — codegraph cannot detect these -->
```

for every external-actor placeholder. Never guess actor names or invent external systems.

## Refuse Rules

1. **`.claude-init/CODEBASE.md` missing** → refuse:
   > Run `/infra-init` first to build the codegraph before `/doc-backfill` can run.

2. **Codegraph returns no clusters** (all four calls return empty or minimal results) → surface error:
   > No components detected in codegraph. Verify `/infra-init` ran successfully.

## Gotchas

1. **Whole-repo one-shot only.** Per-feature mode (running doc-backfill for a single component) is v2. In v1 the only input is the full repo.
2. **C1 actors are always TODO.** Codegraph cannot detect external systems, upstream APIs, or human users. Never fill in actor names from inference.
3. **Never auto-commit.** The user reviews every draft before any commit. Step 6 only runs per-file after explicit acceptance in Step 5.
4. **Heuristic-flagged sparse clusters surface as TODO comments, not empty sections.** An empty section looks authoritative. A `<!-- TODO: sparse cluster -->` comment is honest and actionable.
5. **Skill works only with `context-source=codegraph`.** There is no journal-mode fallback. If the user wants to backfill from plan history instead of the codegraph, that is a manual `doc-author` invocation, not a `doc-backfill` invocation.

## What doc-backfill Does NOT Do

- Does NOT call `architecture-decision-records`. ADRs are populated via the normal plan-close flow as future work touches each component.
- Does NOT operate in per-feature mode (v2 work).
- Does NOT write any file directly — all writes go through `doc-author`.
- Does NOT commit without user review.
- Does NOT have a journal-source path — codegraph only.
