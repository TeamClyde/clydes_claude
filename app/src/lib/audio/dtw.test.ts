import { describe, it, expect } from 'vitest'
import { dtwDistance, similarityScore } from './dtw'

describe('dtwDistance', () => {
  it('returns 0 for identical sequences', () => {
    const a = [1, 2, 3, 4, 5]
    expect(dtwDistance(a, a)).toBe(0)
  })

  it('returns Infinity when either sequence is empty', () => {
    expect(dtwDistance([], [1, 2, 3])).toBe(Infinity)
    expect(dtwDistance([1, 2, 3], [])).toBe(Infinity)
  })

  it('aligns time-stretched copies with low cost', () => {
    const a = [0, 1, 2, 3, 2, 1, 0]
    // Same shape but stretched in time
    const b = [0, 0, 1, 1, 2, 2, 3, 3, 2, 2, 1, 1, 0, 0]
    const dist = dtwDistance(a, b)
    expect(dist).toBe(0)
  })

  it('assigns higher cost to dissimilar shapes', () => {
    const rising = [0, 1, 2, 3, 4]
    const falling = [4, 3, 2, 1, 0]
    expect(dtwDistance(rising, falling)).toBeGreaterThan(dtwDistance(rising, rising))
  })

  it('is symmetric (approximately, modulo band edge effects)', () => {
    const a = [0, 1, 2, 1, 0]
    const b = [0, 0, 1, 2, 1, 1, 0]
    expect(dtwDistance(a, b)).toBe(dtwDistance(b, a))
  })
})

describe('similarityScore', () => {
  it('returns 100 for identical sequences', () => {
    expect(similarityScore([0, 1, 2, 1, 0], [0, 1, 2, 1, 0])).toBe(100)
  })

  it('returns 0 for empty inputs', () => {
    expect(similarityScore([], [1, 2])).toBe(0)
    expect(similarityScore([1, 2], [])).toBe(0)
  })

  it('clamps to 0..100', () => {
    const a = Array.from({ length: 50 }, (_, i) => i)
    const b = Array.from({ length: 50 }, (_, i) => -i * 100)
    const score = similarityScore(a, b)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })

  it('time-stretched identical shape scores 100', () => {
    const a = [0, 1, 2, 3, 2, 1, 0]
    const b = [0, 0, 1, 1, 2, 2, 3, 3, 2, 2, 1, 1, 0, 0]
    expect(similarityScore(a, b)).toBe(100)
  })
})
