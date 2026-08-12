# ADR-0014: Namespace notation — `:` addresses namespaces, and a mode is an argument

## Status

Accepted (2026-08-11, `component-reference-integrity` / `namespace-convention` slice 4).

## Related

Parent: docs/explanation/features/tool-authoring.md

## Supersedes

_(none)_

## Superseded by

_(none)_

## Context

One lexical shape in this corpus carried three disjoint meanings. Measured over all committed
markdown on `main` @ `6e1a797`, the `ns:name` form appeared 178 times under 29 distinct heads, and
the heads fell into three unrelated classes:

| Class | Tokens | Heads | What the colon meant |
|---|---|---|---|
| A **mode** of a local skill | 72 | `plan-management` | "the `<mode>` mode of this skill" |
| A skill provided by an **installed plugin** | 4 | `atlassian`, `aws-serverless`, `claude-md-management` | a real foreign namespace |
| A skill from a **removed** plugin | 28 | `superpowers` (16), `plugin-dev` (11), `skill-creator` (1) | a ledger entry / recurrence guard |

Only the second is what the notation is for. `:` is **platform-owned** — the harness itself
specifies *"Plugin skills use `plugin:skill`"* — so it is already spent on the namespace axis, and
the first class was quietly borrowing it to mean something else entirely.

The borrowing was not merely untidy; it was **unchecked**. The dangling-reference gate resolves the
head and returns as soon as the head names a real component
([reference-integrity.test.mjs](../../../scripts/reference-integrity.test.mjs)), so it never
examines the tail. A citation naming a real skill and an **invented mode that does not exist**
therefore passed `npm test` — the reader saw something that looked like a checked, dispatchable
identifier, and nothing in the repo had verified half of it.

Two further facts made the mode reading actively worse than prose:

- **Nothing dispatches it.** There is no runtime that accepts `<name>:<mode>` as a call. The
  parameter is literally named `status` (`skills/plan-management/SKILL.md:47`), so the colon form
  was notation for an invocation that does not exist in that shape.
- **Invocation is one shot.** `skill` and `args` are passed together, so the caller composes the
  args string *before* the skill body is in context. The citing document is therefore the only
  pre-load specification of the call — and the colon form hands the caller a token whose mapping to
  `status` is documented nowhere except inside the skill that has not been loaded yet.

## Decision

Five clauses. The first four are the rule; the fifth is what stops the migration from destroying
guards the repo already relies on.

1. A **bare** name references a component in the **current namespace**.
2. **`ns:name` qualifies a reference into a different namespace.** `:` is reserved for that axis and
   spent on nothing else. This is platform-owned notation.
3. The **platform namespace is implicit and unqualifiable.** `general-purpose`, `Explore`, `Plan`,
   `claude`, `statusline-setup` are bare **and** foreign. That is precisely why they require a
   positive declaration in `references.platformAgentTypes` rather than a prefix.
4. **Modes are arguments, not an addressing axis.** The canonical prose form **names the
   parameter**: `` `plan-management` `` with `` `status: divergence` ``.
5. **A colon-qualified reference to a REMOVED namespace is correct notation and must be preserved**
   where it serves as a ledger entry or provenance marker.

```mermaid
flowchart TD
    A["I need to cite a component"] --> B{"Is it in the<br/>current namespace?"}
    B -->|yes| C["Cite it BARE<br/>`plan-management`"]
    B -->|no| D{"Which foreign<br/>namespace?"}
    D -->|"a plugin"| E["`ns:name`<br/>`atlassian:triage-issue`"]
    D -->|"the platform"| F["Cite it BARE —<br/>unqualifiable.<br/>MUST be declared in<br/>platformAgentTypes"]
    D -->|"a REMOVED plugin"| G["`ns:name`, and PRESERVE it.<br/>It is a recurrence guard."]
    C --> H{"Am I naming a<br/>MODE as well?"}
    H -->|no| I["Done"]
    H -->|"yes — referential<br/>'X owns this behavior'"| J["Prose:<br/>`plan-management`'s<br/>`divergence` mode"]
    H -->|"yes — imperative<br/>'do this now'"| K["Literal invocation block:<br/>Skill { skill: 'plan-management',<br/>args: 'status: divergence …' }"]
```

### Why clause 3 exists

The obvious rule — "bare means local" — is **false in this corpus**, and it took three drafts to
notice. Five platform agent types are bare *and* foreign. The clause is not a patch on the rule; it
is the reason `references.platformAgentTypes` exists as a positive declaration at all. Stating it
makes this ADR describe the system that is actually there rather than the one it would be tidier to
have.

### Why clause 4 names the parameter

`args` is a **free-text string with no schema** — the harness appends it verbatim under an
`ARGUMENTS:` line and nothing parses it. Under the colon form, a reader had three inference steps to
make before they could issue the call: recognise the token is not a literal component name, split
it, and know that the tail means `status`. Under clause 4 the citing document simply hands over the
literal args string.

> ⚠ **The space after `status:` is load-bearing.** The tokenizer requires `[a-z]` immediately after
> a colon, so `status: divergence` emits no token — but closing that space *would* tokenize, and the
> check below would then fire on the very form this ADR prescribes. Verified against the real
> tokenizer, not assumed.

### Why clause 5 exists

The 28 removed-plugin citations are not defects — they are the mechanism that keeps a removed
namespace from silently coming back. Most sit in the declared historical ledger; the rest are
explicit provenance markers carrying a `ref-ok` reason, of the form *"do not replace this with a
citation to the plugin that was uninstalled."* A literal reading of "eliminate `ns:name` from the
corpus" would delete exactly the guards that record why the namespace is gone. **Consequence: none
of the 28 were touched by this migration.**

## Alternatives Considered

### A distinct sigil for the mode axis — REJECTED

Light research established a real principle: ecosystems use a distinct sigil per semantic axis
(npm `@scope/name`, Bazel `@repo//pkg:target`, Maven `group:artifact:version`), and overloading one
separator causes ambiguity.

**The principle does not apply here.** It holds when both axes are real addressing dimensions — in
Bazel you can actually invoke a target. Our mode axis addresses nothing invocable: modes are
argument *values*, and no dispatch targets one. A sigil would mean building a tokenizer rule, a
per-skill mode declaration, and a gate branch to validate a token with no runtime referent. It also
degrades under the plugin case, where it becomes a two-sigil compound.

### Full internal qualification, Ansible-FQCN style — DEFERRED, not dismissed

Ecosystems genuinely disagree. Node added `node:` but left it **optional**; Ansible made FQCN
**mandatory**, backed by routing redirects and an autofixer; Python **never** distinguished stdlib
from PyPI and treats it as unfixable debt; Go's split is **functional** (the domain is a real fetch
endpoint) rather than cosmetic; Kubernetes uses an opaque empty-string core group.

Ansible's mechanism does not transfer, because FQCN there *is* the resolution grammar — the runtime
resolves the qualified name. Our prose citations resolve nothing, so qualification would copy the
form without the function. Ansible also migrated in response to a collision that had actually
occurred; we have none — all component names are unique, and `harvest-components.mjs` already throws
on any name collision at generation time.

**Blast radius, measured with its corpus** — an unqualified count is not a fact. Exact-backtick
spans naming a component, over all committed markdown excluding the two generated inventory files:
**1,385 across 96 files**, versus the **70** sites this ADR actually changed. (Counting *all*
committed markdown gives 1,387 / 97; also excluding `plans/` gives 1,376 / 95. Same measurement,
three corpora.)

> Note for anyone re-deriving this: the figure was **1,325 / 96 before this migration**. Rewriting a
> colon citation into a bare backticked one *adds* an exact-backtick span, so bare
> `` `plan-management` `` spans went 53 → 113 and the FQCN blast radius grew by exactly 60. This
> decision moved the number it is measured against — which is a good reason to re-run the
> derivation rather than quote this line.

**Revisit when** either the notation becomes an actual resolution mechanism under an independent
harness, **or** a second namespace ships components whose names collide with local ones. The
`superpowers` removal is the local evidence that the second harm is real; it was solved by removing
the plugin and declaring the dead namespace, and the corpus shows that fix held completely. **This
repo's lever is declaration-plus-gate, not grammar.**

## Enforcement

A named invariant — the sixth box in the graph-invariant diagram at
[tool-authoring.md § Graph Invariants](../features/tool-authoring.md) — implemented in
`scripts/reference-integrity.test.mjs`: **no local component name may appear as the head of an
`ns:name` token.** Measured 2026-08-11: **70 occurrences before the migration, 0 after.**

Its corpus is deliberately **repo-wide minus `plans/`**, wider than the `CORPUS_ROOTS` the other
checks read, because 29 of the 70 sites lived under `docs/` which `CORPUS_ROOTS` does not read at
all. It can afford the wider corpus because it asks a strictly narrower question: one membership
test on the head, with no resolution attempt.

`colonEdgeName` in `scripts/lib/component-refs.mjs` is **deliberately kept** even though nothing now
feeds it. The check makes its input set *provably* empty; the guard is what makes that emptiness
*enforceable* if the check is ever relaxed. They are complements — do not delete either on the
grounds that the other exists.

### The collision class — read this before naming a component

npm script references tokenize as namespace references. Measured over the committed markdown:
`harvest:` appears 6 times, `verify:` 6, and `recall:` 1. None of those heads is a component name
today, so the check is silent on them. **Naming a component `harvest` would fire this check on every
mention of `npm run harvest:check`** — and that is not hypothetical, since a harvest script already
exists. The same applies to `verify`, `recall`, `engine` and `build`.

The escape hatch is an inline `<!-- ref-ok: <reason> -->` marker, honoured here exactly as the
dangling gate honours it: line-scoped, never file-scoped, and requiring a written reason.

### Scope of the claim — markdown only

The check reads committed markdown, so **the notation is retired from prose, not from the repo.** It
survives by design in **8 non-markdown sites** (measured 2026-08-11): the doc comments for the
`colonEdgeName` guard this ADR deliberately keeps, that guard's unit tests, the gate assertion that
owns the finding and must name the literal prefix to assert it is not double-reported, and two
comments recording the migration itself.

An unqualified "the notation is gone" would be exactly the kind of overclaim the
`component-reference-integrity` epic exists to stop.

## Consequences

- **70 citations across 17 files were rewritten.** Referential sites read as
  `` `plan-management` ``'s `` `divergence` `` mode; imperative sites name the parameter.
- **The graph did not move.** Every rewrite swapped a colon-rule resolution for a backtick-rule
  resolution of the same target, so the edge set held at **232 edges / 79 nodes** across every
  commit — asserted after each one, not assumed.
- **A stale-claim trap was closed and another opened.** The equivalence oracle in
  `scripts/harvest-components.test.mjs` pinned its delta against a frozen set; three of those pairs
  (`doc-author`, `executing-plans`, `writing-plans` → `plan-management`) reached their target *only*
  through the colon rule, so rewriting them moved the pair's provenance to the legacy extractor and
  dropped it out of the delta — while the edge itself was untouched. They are now pinned in a
  separate migrated set that asserts the edge still resolves.
- **Prose is now longer.** `` `plan-management` ``'s `` `divergence` `` mode costs more characters
  than the colon form. One site — `doc-author`'s frontmatter `description:` — sits under a hard
  character ceiling, and the ratchet was raised deliberately in the same commit rather than shipping
  on the remaining margin.
- **The reader gains a rule with one meaning.** A colon in a citation now means exactly one thing:
  the reference crosses a namespace boundary.
