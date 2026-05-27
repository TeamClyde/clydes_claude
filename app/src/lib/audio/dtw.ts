// Banded 1D Dynamic Time Warping.
// Returns the minimum-cost alignment between two sequences.
// Uses a Sakoe-Chiba band to bound complexity.

export interface DtwOptions {
  bandRatio?: number // fraction of the longer sequence (default 0.15)
}

export function dtwDistance(a: number[], b: number[], opts: DtwOptions = {}): number {
  if (a.length === 0 || b.length === 0) return Infinity
  const n = a.length
  const m = b.length
  const bandRatio = opts.bandRatio ?? 0.15
  const w = Math.max(Math.abs(n - m), Math.floor(Math.max(n, m) * bandRatio))

  let prev = new Float64Array(m + 1).fill(Infinity)
  let curr = new Float64Array(m + 1).fill(Infinity)
  prev[0] = 0

  for (let i = 1; i <= n; i++) {
    curr.fill(Infinity)
    const jStart = Math.max(1, i - w)
    const jEnd = Math.min(m, i + w)
    for (let j = jStart; j <= jEnd; j++) {
      const cost = Math.abs(a[i - 1] - b[j - 1])
      const insert = curr[j - 1]
      const remove = prev[j]
      const match = prev[j - 1]
      curr[j] = cost + Math.min(insert, remove, match)
    }
    ;[prev, curr] = [curr, prev]
  }

  return prev[m]
}

// Map DTW distance over normalized semitone curves to a 0..100 similarity.
// Empirical mapping: ~0 cost -> 100, ~6 semitones average misalignment -> 0.
export function similarityScore(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const dist = dtwDistance(a, b)
  if (!Number.isFinite(dist)) return 0
  const avgCost = dist / Math.max(a.length, b.length)
  const score = 100 - avgCost * 16
  return Math.max(0, Math.min(100, Math.round(score)))
}
