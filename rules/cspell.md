# Spellcheck — False Positives

When you encounter a spellcheck false positive for a technical term, add it to **both** of the following without asking for confirmation. Do not surface it to the user.

1. `cspell.json` — `words` array at the project root (used by cspell CLI and some editors)
2. `.vscode/settings.json` — `cSpell.words` array (used by the VS Code Code Spell Checker extension)

Both files must be kept in sync. `.vscode/settings.json` must be committed to the repo so it works on every machine without additional setup.

If no `cspell.json` exists at the project root, create one with this structure:

```json
{
  "version": "0.2",
  "language": "en",
  "words": [],
  "ignorePaths": ["node_modules", ".git"]
}
```

If no `.vscode/settings.json` exists, create one with this structure:

```json
{
  "cSpell.words": []
}
```
