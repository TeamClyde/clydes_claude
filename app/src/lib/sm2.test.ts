import { describe, it, expect } from 'vitest'
import { sm2, isDue, DEFAULT_EASE, MIN_EASE } from './sm2'

const FIXED_NOW = new Date('2026-01-15T12:00:00Z')

describe('sm2', () => {
  it('throws on quality outside 0-5', () => {
    expect(() => sm2({}, -1)).toThrow()
    expect(() => sm2({}, 6)).toThrow()
    expect(() => sm2({}, NaN)).toThrow()
  })

  it('first correct review gives interval=1 and reps=1', () => {
    const result = sm2({}, 4, FIXED_NOW)
    expect(result.interval).toBe(1)
    expect(result.repetitions).toBe(1)
  })

  it('second correct review gives interval=6', () => {
    const result = sm2({ repetitions: 1, interval: 1, easeFactor: DEFAULT_EASE }, 4, FIXED_NOW)
    expect(result.interval).toBe(6)
    expect(result.repetitions).toBe(2)
  })

  it('third+ correct review multiplies interval by easeFactor', () => {
    const result = sm2({ repetitions: 2, interval: 6, easeFactor: 2.5 }, 4, FIXED_NOW)
    expect(result.interval).toBe(15)
    expect(result.repetitions).toBe(3)
  })

  it('failed review (quality<3) resets reps to 0 and interval to 1', () => {
    const result = sm2({ repetitions: 5, interval: 30, easeFactor: 2.5 }, 1, FIXED_NOW)
    expect(result.repetitions).toBe(0)
    expect(result.interval).toBe(1)
  })

  it('failed review keeps easeFactor degraded but does not reset it', () => {
    const result = sm2({ repetitions: 5, interval: 30, easeFactor: 2.5 }, 1, FIXED_NOW)
    // quality=1: 0.1 - 4*(0.08 + 4*0.02) = 0.1 - 4*0.16 = -0.54
    expect(result.easeFactor).toBeCloseTo(2.5 - 0.54, 5)
  })

  it('easeFactor floor is enforced', () => {
    // Repeated failures push EF below 1.3 -> clamped
    let card: Sm2Input = { easeFactor: 1.3, interval: 1, repetitions: 0 }
    for (let i = 0; i < 5; i++) {
      card = sm2(card, 0, FIXED_NOW)
    }
    expect(card.easeFactor).toBe(MIN_EASE)
  })

  it('easeFactor goes up on perfect recall', () => {
    const result = sm2({ easeFactor: 2.5, repetitions: 1, interval: 1 }, 5, FIXED_NOW)
    expect(result.easeFactor).toBeGreaterThan(2.5)
  })

  it('nextReview = now + interval days', () => {
    const result = sm2({ repetitions: 1, interval: 1, easeFactor: 2.5 }, 4, FIXED_NOW)
    const expected = new Date(FIXED_NOW)
    expected.setDate(expected.getDate() + 6)
    expect(result.nextReview).toBe(expected.toISOString())
  })
})

describe('isDue', () => {
  it('returns true when nextReview is in the past', () => {
    const past = new Date('2026-01-10T00:00:00Z').toISOString()
    expect(isDue({ easeFactor: 2.5, interval: 1, repetitions: 1, nextReview: past }, FIXED_NOW)).toBe(true)
  })

  it('returns false when nextReview is in the future', () => {
    const future = new Date('2026-02-10T00:00:00Z').toISOString()
    expect(isDue({ easeFactor: 2.5, interval: 1, repetitions: 1, nextReview: future }, FIXED_NOW)).toBe(false)
  })
})

// Re-export to keep TS happy on Sm2Input reference above
type Sm2Input = Parameters<typeof sm2>[0]
