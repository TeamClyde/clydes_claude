import type { AppProgress, DeckCard } from '../data/types'

export type QuizFormat = 'jp-to-meaning' | 'meaning-to-jp' | 'jp-to-romaji'

export interface QuizQuestion {
  wordId: string
  format: QuizFormat
  prompt: string
  audio?: string
  options: string[]
  correctIndex: number
  explanation: string
}

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function pickWords(deck: DeckCard[], progress: AppProgress, count: number): DeckCard[] {
  const weak: DeckCard[] = []
  const seen: DeckCard[] = []
  const unseen: DeckCard[] = []
  for (const card of deck) {
    const p = progress.cards[card.id]
    if (!p) unseen.push(card)
    else if (p.repetitions < 2) weak.push(card)
    else seen.push(card)
  }
  // Bias toward weak first, then a mix of seen and new
  const candidates = [
    ...shuffle(weak),
    ...shuffle(unseen),
    ...shuffle(seen),
  ]
  const picked: DeckCard[] = []
  const ids = new Set<string>()
  for (const c of candidates) {
    if (ids.has(c.id)) continue
    ids.add(c.id)
    picked.push(c)
    if (picked.length >= count) break
  }
  // Pad if deck is tiny
  while (picked.length < count) {
    const c = deck[Math.floor(Math.random() * deck.length)]
    if (!c || ids.has(c.id)) break
    ids.add(c.id)
    picked.push(c)
  }
  return picked
}

function makeQuestion(word: DeckCard, deck: DeckCard[], format: QuizFormat): QuizQuestion {
  const distractors = shuffle(deck.filter((d) => d.id !== word.id)).slice(0, 6)
  let prompt: string
  let correct: string
  let optsRaw: string[]
  let audio: string | undefined
  let explanation: string

  switch (format) {
    case 'jp-to-meaning':
      prompt = `What does "${word.jp}" mean?`
      audio = word.jp
      correct = word.meaning
      optsRaw = [correct]
      for (const d of distractors) {
        if (!optsRaw.includes(d.meaning)) optsRaw.push(d.meaning)
        if (optsRaw.length === 4) break
      }
      explanation = `${word.jp} (${word.romaji}) means "${word.meaning}".`
      break
    case 'meaning-to-jp':
      prompt = `How do you say "${word.meaning}" in Japanese?`
      correct = word.jp
      optsRaw = [correct]
      for (const d of distractors) {
        if (!optsRaw.includes(d.jp)) optsRaw.push(d.jp)
        if (optsRaw.length === 4) break
      }
      explanation = `"${word.meaning}" is ${word.jp} (${word.romaji}).`
      break
    case 'jp-to-romaji':
      prompt = `How is "${word.jp}" pronounced?`
      audio = word.jp
      correct = word.romaji
      optsRaw = [correct]
      for (const d of distractors) {
        if (!optsRaw.includes(d.romaji)) optsRaw.push(d.romaji)
        if (optsRaw.length === 4) break
      }
      explanation = `${word.jp} is read "${word.romaji}".`
      break
  }

  const options = shuffle(optsRaw)
  return {
    wordId: word.id,
    format,
    prompt,
    audio,
    options,
    correctIndex: options.indexOf(correct),
    explanation,
  }
}

const FORMAT_ROTATION: QuizFormat[] = [
  'jp-to-meaning',
  'meaning-to-jp',
  'jp-to-meaning',
  'jp-to-romaji',
  'jp-to-meaning',
]

export function generateQuiz(deck: DeckCard[], progress: AppProgress, count = 5): QuizQuestion[] {
  const words = pickWords(deck, progress, count)
  return words.map((w, i) => makeQuestion(w, deck, FORMAT_ROTATION[i % FORMAT_ROTATION.length]))
}
