# Source-Text Assertions — Guarding `indexOf`

Tests that assert against a file's own source text (rather than importing it) are legitimate when
the module cannot be imported — e.g. a Workflow bundle that reads top-level globals and ends in a
top-level `return`. They fail silently in three distinct ways, all rooted in an unguarded
`indexOf` result reaching `slice()` or a comparison.

| Mechanism | Why it is silent |
|---|---|
| `slice(start, -1)` | `-1` means "to the second-to-last character", NOT "not found". The block silently expands to ~EOF and any `doesNotMatch` guards inside it stop bounding anything. |
| `-1 < someIndex` is **true** | An ordering assertion passes when the thing being ordered does not exist at all. |
| End marker resolves earlier than start | No `-1` anywhere, but `slice(21325, 10499)` returns `''`, so every assertion inside the block passes against an empty string. |

These are **false passes**, not failures. A vacuous assertion reports green while testing nothing.

## The idiom

Always bound a region at both ends, and assert both markers resolve before slicing:

```js
const start = BODY.indexOf('<start marker>');
const end   = BODY.indexOf('<end marker>');
assert.ok(start !== -1 && end > start, '<markers> must resolve');
const block = BODY.slice(start, end);
```

For an ordering assertion, assert both operands resolve before comparing:

```js
const a = BODY.indexOf('<first thing>');
const b = BODY.indexOf('<second thing>');
assert.ok(a !== -1 && b !== -1, 'both anchors must resolve');
assert.ok(a < b, '<first> must precede <second>');
```

## Two rules

1. **Bound regions at both ends, and assert both markers resolve.** A one-ended slice changes
   meaning as the file grows, and runs to EOF when the marker is absent.
2. **Never anchor an assertion to a string a later task introduces.** An assertion referencing its
   own future code cannot have worked at the commit it shipped in.

## Scope

Applies to every test that slices or searches source text, and to plan docs that embed such
assertions. Prefer moving logic into an importable pure module over adding a source-text assertion.
