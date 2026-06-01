# <technology> — Stack Hat

> Catalog entry for the `<technology>` stack hat. Copy this file to
> `stacks/<technology>.md` and fill both sections. The `<technology>` filename
> (without `.md`) is the value repos put in `project.json` `"stacks": [...]`.
>
> **Authoring contract (the SessionStart hook depends on it):**
> - Two H2 sections are required: `## Tooling` and `## Hat`.
> - The hook extracts **only** `## Hat` at session start — keep it ≤ ~25 lines
>   of concise, specialist guidance (best-practice reminders + "leverage tool X
>   for Y" pointers). It is additive to SE-fundamentals, never a restatement.
> - `## Tooling` is consumed by setup automation (Phase 2), not at runtime.
> - A section ends at the next `## ` heading. Do not use H2 headings inside a
>   section — use H3 (`###`) or lists instead.

## Tooling

- **MCPs:** <relevant MCP servers, or "none">
- **CLI tools:** <tier-1 lint/format/type/test tools with install commands>
- **VSCode extensions:** <extension IDs>

## Hat

- <specialist best-practice bullet>
- <tooling-leverage reminder, e.g. "use <tool> for <task> instead of guessing">
