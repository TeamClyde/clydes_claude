# TODO

Living checklist. Group by theme, ordered by what unlocks the most learning
value per unit of effort. Check items off in PRs.

## Content (use Claude.ai subscription, not API)

See `docs/content-prompts.md` for copy-paste prompts and the shared JSON
schema. Save each batch into `src/data/<phase>/<batch>.json`, then run the
importer (once it exists — see below).

### Prerequisite
- [ ] **Katakana set** — all 46 katakana with 3 colloquial example words each
      (loanwords are great here: ピザ, カフェ, スマホ). Same shape as
      `src/data/hiragana.ts`.
- [ ] **Combine into one importer** — `src/data/index.ts` exports a single
      `buildFullDeck()` that merges hiragana + katakana + any phase JSON
      files in `src/data/phase*/`.

### Phase 1 — Foundation (weeks 4-5)
- [ ] Survival phrases (~40) → `src/data/phase1/phrases.json`
- [ ] Particles (~15) → `src/data/phase1/particles.json`
- [ ] Essential verbs (~30) → `src/data/phase1/verbs.json`
- [ ] Common adjectives (~25) → `src/data/phase1/adjectives.json`

### Phase 2 — Patterns & vocab (weeks 6-8)
- [ ] food, family, time, places, transportation, body, weather, work-school,
      emotions, numbers-counters — ~20 each, one batch per category,
      `src/data/phase2/<category>.json`.
- [ ] Add **sentence-pattern** lessons (e.g., 〜たい, 〜ことができる,
      〜なければならない). Probably a new content type — design needed.

### Phase 3 — Colloquial (weeks 9+)
- [ ] Casual endings (~30) → `src/data/phase3/casual-endings.json`
- [ ] Contractions (~30) → `src/data/phase3/contractions.json`
- [ ] Fillers (~30) → `src/data/phase3/fillers.json`
- [ ] Slang / modern expressions (~30) → `src/data/phase3/slang.json`

### Content tooling
- [ ] **Schema validator** — `npm run validate-content` runs every JSON file
      in `src/data/**` against a Zod schema, fails CI on bad shape.
- [ ] **Dedupe checker** — flag any `jp` appearing in multiple files.
- [ ] **Importer** — at build time turn each JSON file into a typed export
      and stitch into the deck. Tag-based filters (`phase-1`, `food`, etc.)
      let the UI scope to a subset.

## Pronunciation reference (pick one path)

The MVP compares the user's two takes (reference vs attempt). To compare
against an *actual* native target we need one of:

- [ ] **Path A — Bake static MP3s.** Run `say -v Kyoko -o <word>.aiff` (Mac)
      or VoiceVox on the JLPT-N5 + phase content list. Convert to MP3,
      drop in `public/audio/<word>.mp3`, ship via Workbox precache.
      ~20 MB total. **Best quality**, single one-time bake.
- [ ] **Path B — Canonical pitch overlay.** Pull NHK pitch accent data
      (https://github.com/javdejong/nhk-pronunciation) into
      `src/data/pitch-accent.json`. Render the dictionary L/H pattern as
      a step function reference curve. No audio asset cost; works for any
      word in the NHK dictionary.
- [ ] Either path: extend `PronunciationMode` so the reference auto-loads
      from the chosen source instead of requiring the user to record one.

## Core app features

### Higher value
- [ ] **Daily streak + "due today"** — surface a card count and reminder
      on app open. Drives habit formation. Touches `useProgress`,
      `App.tsx` header, maybe a new `HomeMode`.
- [ ] **wanakana romaji→kana input** — for quiz "type the answer" format
      (we already have the dep installed).
- [ ] **Phase-aware filtering** — toggle in flashcards to limit the deck to
      Phase 1 only, then Phase 1+2, etc. Driven by `tags`.

### Medium value
- [ ] **Listening exercises** — play TTS, user types what they heard
      (wanakana converts romaji as they type).
- [ ] **Furigana support** — once kanji enter the deck, render ruby text
      for unknown kanji. The schema's `kanji` field already supports this.
- [ ] **Export / import progress** — JSON dump from settings; useful for
      moving between devices since IndexedDB is per-origin.

### Lower / later
- [ ] **Conversation mode** — the one place an LLM genuinely earns its keep.
      If we add it, it's the trigger to either:
      - stand up a tiny Vercel proxy (`api/claude.ts`) holding the key, or
      - ship a "paste your Anthropic key into Settings" option (BYO key,
        stays client-side).
- [ ] **Whisper.cpp WASM** — swap browser SpeechRecognition for higher
      accuracy on transcript. ~75 MB one-time download.
- [ ] **Gamification** — XP, badges. Defer until streak basics work.

## Polish / infra
- [ ] Real PWA icons (192px, 512px PNGs from a final logo).
- [ ] CI: GitHub Actions running `typecheck`, `test:run`, and `build`
      on PRs.
- [ ] Vercel deployment config + first deploy.
- [ ] Dark mode (Tailwind class strategy; the design is light-mode only
      right now).
- [ ] Replace `console.error` / `console.warn` with a tiny toast system
      so errors surface to the user.

## Notes
- **No API in the core app.** Content generation uses your Claude.ai
  subscription (see `docs/content-prompts.md`). The optional conversation
  mode in "lower / later" is the one explicit carve-out.
- **Skill-tested libs only**: `pitchy`, `idb`, `wanakana`, `lucide-react`
  are all MIT and small. Avoid heavier deps unless they unlock something
  we can't build in 50 lines.
