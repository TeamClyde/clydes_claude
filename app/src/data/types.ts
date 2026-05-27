export type Kana = 'hiragana' | 'katakana'

export interface ExampleWord {
  jp: string
  romaji: string
  meaning: string
}

export interface KanaCharacter {
  char: string
  romaji: string
  kana: Kana
  words: ExampleWord[]
}

export interface DeckCard {
  id: string
  jp: string
  romaji: string
  meaning: string
  character: string
  kana: Kana
}

export interface CardProgress {
  easeFactor: number
  interval: number
  repetitions: number
  nextReview: string
  lastReviewed?: string
}

export interface PronunciationAttempt {
  word: string
  target: string
  transcribed: string
  similarity: number
  timestamp: string
}

export interface QuizResult {
  wordId: string
  correct: boolean
}

export interface QuizHistoryEntry {
  timestamp: string
  score: number
  total: number
  results: QuizResult[]
}

export interface ProgressStats {
  totalReviews: number
  correctReviews: number
  streakDays: number
  lastActiveDate?: string
}

export interface AppProgress {
  cards: Record<string, CardProgress>
  quizHistory: QuizHistoryEntry[]
  pronunciationHistory: PronunciationAttempt[]
  stats: ProgressStats
}

export const emptyProgress = (): AppProgress => ({
  cards: {},
  quizHistory: [],
  pronunciationHistory: [],
  stats: { totalReviews: 0, correctReviews: 0, streakDays: 0 },
})
