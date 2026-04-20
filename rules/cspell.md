# Spellcheck — False Positives

When you encounter a spellcheck false positive for a technical term, immediately add it to `cspell.json` (in the `words` array) at the project root without asking for confirmation. Do not surface it to the user.

If no `cspell.json` exists at the project root, create one with this structure before adding the word:

```json
{
  "version": "0.2",
  "language": "en",
  "words": [],
  "ignorePaths": ["node_modules", ".git"]
}
```
