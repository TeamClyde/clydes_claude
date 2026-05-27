import type { CardProgress } from '../data/types'

// SuperMemo 2 (Anki-style) spaced repetition.
// quality: 0-5 (0 = forgot, 5 = perfect). Anything <3 is a failure.
//
// Buttons typically map: Again=1, Hard=3, Good=4, Easy=5.

export interface Sm2Input {
  easeFactor?: number
  interval?: number
  repetitions?: number
}

export interface Sm2Output {
  easeFactor: number
  interval: number
  repetitions: number
  nextReview: string
}

export const MIN_EASE = 1.3
export const DEFAULT_EASE = 2.5

export function sm2(card: Sm2Input, quality: number, now: Date = new Date()): Sm2Output {
  if (quality < 0 || quality > 5 || !Number.isFinite(quality)) {
    throw new Error(`sm2: quality must be 0-5, got ${quality}`)
  }

  let easeFactor = card.easeFactor ?? DEFAULT_EASE
  let interval: number
  let repetitions: number

  if (quality < 3) {
    repetitions = 0
    interval = 1
  } else {
    const prevReps = card.repetitions ?? 0
    const prevInterval = card.interval ?? 0
    if (prevReps === 0) {
      interval = 1
    } else if (prevReps === 1) {
      interval = 6
    } else {
      interval = Math.round(prevInterval * easeFactor)
    }
    repetitions = prevReps + 1
  }

  easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  if (easeFactor < MIN_EASE) easeFactor = MIN_EASE

  const nextReview = new Date(now)
  nextReview.setDate(nextReview.getDate() + interval)

  return {
    easeFactor,
    interval,
    repetitions,
    nextReview: nextReview.toISOString(),
  }
}

export function isDue(card: CardProgress, now: Date = new Date()): boolean {
  return new Date(card.nextReview).getTime() <= now.getTime()
}
