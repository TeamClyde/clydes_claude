# Content Generation via Claude.ai Subscription

The app ships zero API calls and we want to keep it that way. To build out
the phase content from `learning-plan.md`, paste these prompts into a new
chat at https://claude.ai (use your subscription — **not** the API), then
save the JSON output into `app/src/data/`.

## Shared JSON Schema

Every batch (phrases, particles, verbs, adjectives, vocab) returns the
same record shape so importers stay simple:

```jsonc
{
  "jp": "おはよう",          // hiragana / katakana, no kanji unless field below
  "kanji": null,             // string or null — optional kanji form
  "romaji": "ohayou",        // Hepburn romanization
  "meaning": "morning!",     // short, colloquial English gloss
  "pos": "expression",       // see allowed values below
  "tags": ["greeting", "casual", "phase-1"],
  "notes": "Drop the お for very casual 'よう' between close friends.",
  "example": {
    "jp": "おはよう、元気?",
    "romaji": "ohayou, genki?",
    "en": "Morning! How's it going?"
  }
}
```

**Allowed `pos` values:**
`noun`, `verb-u`, `verb-ru`, `verb-irregular`, `adj-i`, `adj-na`,
`particle`, `expression`, `adverb`, `counter`, `pronoun`, `interjection`.

**Tagging convention:** include `phase-1`, `phase-2`, or `phase-3`, plus a
category tag (`greeting`, `food`, `time`, etc.), plus `casual` or `formal`
where it disambiguates.

## Prompt: Phase 1 — Survival Phrases (target: ~40)

```text
You are helping me build a Japanese learning app for a complete beginner
who wants to actually SPEAK with people — colloquial Japanese over textbook
Japanese.

Generate 40 essential "survival phrases" a beginner would use in their
first weeks of conversation. Focus on what young/casual native speakers
actually say in 2026, not the stiff phrases textbooks teach.

Cover: greetings (multiple registers), goodbyes, thanks, apologies,
yes/no/maybe, "I don't understand", "say that again", "I'm sorry I'm late",
ordering food, asking prices, asking where the bathroom is, basic small
talk openers, expressing feelings (tired, hungry, happy, surprised),
and reactions (cool, gross, no way, really?).

Output ONLY a JSON array of records in this schema, nothing else:

[
  {
    "jp": "<hiragana/katakana, no kanji>",
    "kanji": null,
    "romaji": "<Hepburn>",
    "meaning": "<short English gloss>",
    "pos": "expression",
    "tags": ["phase-1", "<category>", "casual" or "formal"],
    "notes": "<usage note — when to use it, who says it, what to avoid>",
    "example": {
      "jp": "<one short sentence using this phrase>",
      "romaji": "<Hepburn>",
      "en": "<English>"
    }
  }
]

Allowed `pos`: noun, verb-u, verb-ru, verb-irregular, adj-i, adj-na,
particle, expression, adverb, counter, pronoun, interjection.

Strictly valid JSON. No trailing commas. No commentary before or after.
```

Save the result as `app/src/data/phase1/phrases.json`.

## Prompt: Phase 1 — Particles (target: ~15)

```text
Generate the 15 most essential Japanese particles for a beginner, in the
schema below. For each particle the `meaning` should be a short
functional gloss (e.g., "topic marker", "object marker", "location of
existence"), and `notes` should explain the *one* most common beginner
mistake or distinction (e.g., は vs が, に vs で).

The `example` should be a single sentence that makes the particle's role
obvious from context.

Output ONLY a JSON array:

[
  {
    "jp": "<the particle as it's written>",
    "kanji": null,
    "romaji": "<wa/ga/wo/etc>",
    "meaning": "<functional gloss>",
    "pos": "particle",
    "tags": ["phase-1", "particle"],
    "notes": "<the one beginner mistake to avoid>",
    "example": {
      "jp": "<sentence>",
      "romaji": "<Hepburn>",
      "en": "<English>"
    }
  }
]

Strictly valid JSON, no commentary.
```

Save as `app/src/data/phase1/particles.json`.

## Prompt: Phase 1 — Essential Verbs (target: ~30)

```text
Generate 30 essential Japanese verbs every beginner needs. Include the
"big four" irregular/auxiliary verbs (する, ある, いる, なる) plus the
most common motion, transaction, perception, and communication verbs.

For each verb:
- `jp` is the dictionary form in hiragana (e.g., "たべる", not 食べる).
- `kanji` is the kanji form if commonly used, otherwise null.
- `pos` is one of: verb-u, verb-ru, verb-irregular.
- `notes` should include the casual/colloquial conjugation a friend would
  actually use (e.g., "casual past tense: 食べた; super-casual present
  progressive: 食べてる"). Beginners need to hear the LIVED form, not
  just the dictionary form.
- `example` uses the verb in a short, natural sentence.

Output ONLY a JSON array in the schema. Strictly valid JSON, no commentary.

[
  {
    "jp": "<dictionary form, hiragana>",
    "kanji": "<kanji form or null>",
    "romaji": "<Hepburn>",
    "meaning": "<English gloss, e.g. 'to eat'>",
    "pos": "verb-u" | "verb-ru" | "verb-irregular",
    "tags": ["phase-1", "verb"],
    "notes": "<casual conjugations and usage note>",
    "example": { "jp": "...", "romaji": "...", "en": "..." }
  }
]
```

Save as `app/src/data/phase1/verbs.json`.

## Prompt: Phase 1 — Common Adjectives (target: ~25)

```text
Generate 25 common Japanese adjectives a beginner encounters every day.
Mix i-adjectives and na-adjectives. Include the obvious sensory ones
(big, small, tasty, hot, cold) and the everyday emotional ones (fun,
boring, tired, easy, hard).

For each:
- `pos` is "adj-i" or "adj-na".
- `notes` shows the colloquial negative and past forms (e.g., for おいしい:
  "neg: おいしくない, past: おいしかった, neg-past: おいしくなかった").

Output ONLY a JSON array in the standard schema. Strictly valid JSON,
no commentary.
```

Save as `app/src/data/phase1/adjectives.json`.

## Prompt: Phase 2 — Vocabulary by Category (target: ~200 across 8-10 batches)

Run one chat per category so each batch stays focused. Categories:
`food`, `family`, `time`, `places`, `transportation`, `body`, `weather`,
`work-school`, `emotions`, `numbers-counters`.

```text
Generate 20 essential Japanese vocabulary words in the "<CATEGORY>"
category for a beginner. Prefer words actually used in daily speech in
2026 — skip archaic terms.

Use the shared schema:

[
  {
    "jp": "<hiragana or katakana>",
    "kanji": "<kanji form or null>",
    "romaji": "<Hepburn>",
    "meaning": "<short English gloss>",
    "pos": "noun" | "verb-u" | "verb-ru" | "verb-irregular" | "adj-i" | "adj-na" | "adverb" | "counter",
    "tags": ["phase-2", "<CATEGORY>"],
    "notes": "<one-sentence usage note: when to use it, common collocations>",
    "example": { "jp": "...", "romaji": "...", "en": "..." }
  }
]

Strictly valid JSON, no commentary.
```

Save each as `app/src/data/phase2/<category>.json`.

## Prompt: Phase 3 — Colloquial Variations (target: ~30 per subgroup)

Run four batches: `casual-endings`, `contractions`, `fillers`, `slang`.

```text
Generate 30 examples of Japanese "<SUBGROUP>" — the kind young native
speakers use in casual chat that beginners almost never learn from
textbooks. Examples of SUBGROUP framing:

- "casual-endings": だ, だよ, だね, じゃん, でしょ, だろ, ぞ, ぜ, さ, etc.
  with usage notes on register and gender associations where applicable.
- "contractions": 〜てる (← 〜ている), 〜とく (← 〜ておく), 〜ちゃう
  (← 〜てしまう), じゃ (← では), なきゃ (← なければ), etc.
- "fillers": えーと, あのー, まあ, やっぱり, とりあえず, なんか, ていうか,
  そういえば, etc.
- "slang": やばい, めっちゃ, 全然 (positive-use), だるい, ウケる,
  キモい, リア充, etc.

For each item, `notes` MUST include:
1. What it means literally (or what it replaces).
2. Who uses it (age, gender, formality).
3. A common mistake a learner might make using it wrong.

Output ONLY a JSON array in the standard schema with `pos` set to
`expression` or `interjection` as appropriate and tags
`["phase-3", "<SUBGROUP>"]`.

Strictly valid JSON, no commentary.
```

Save as `app/src/data/phase3/<subgroup>.json`.

## After You Get a Batch Back

1. Save the JSON file at the path above.
2. Validate it (we'll add a `npm run validate-content` script — see
   `TODO.md`). Until then, paste into a JSON validator.
3. Skim for obvious errors (Claude.ai is usually right but spot-check
   a few entries against a dictionary).
4. The importer (also in TODO) will fold the new file into the deck
   automatically.

## Why Subscription, Not API
- Free under your existing Claude plan.
- Conversational refinement: "make these more casual," "swap out anything
  archaic," "add 5 more focused on restaurants."
- No keys to manage, no rate limits to plan around, no Vercel function.
- The app itself stays 100% local and API-free.
