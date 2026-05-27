import { PitchDetector } from 'pitchy'

export interface PitchPoint {
  t: number       // seconds
  hz: number      // 0 means unvoiced / below clarity threshold
  clarity: number // 0..1
}

export interface PitchCurve {
  points: PitchPoint[]
  duration: number
  sampleRate: number
}

export interface PitchOptions {
  frameSize?: number
  hopSize?: number
  clarityThreshold?: number
  minHz?: number
  maxHz?: number
}

const DEFAULTS = {
  frameSize: 2048,
  hopSize: 512,
  clarityThreshold: 0.8,
  minHz: 60,
  maxHz: 500,
}

export function extractPitch(
  samples: Float32Array,
  sampleRate: number,
  opts: PitchOptions = {},
): PitchCurve {
  const cfg = { ...DEFAULTS, ...opts }
  const detector = PitchDetector.forFloat32Array(cfg.frameSize)
  const points: PitchPoint[] = []

  for (let i = 0; i + cfg.frameSize <= samples.length; i += cfg.hopSize) {
    const frame = samples.subarray(i, i + cfg.frameSize)
    const [hz, clarity] = detector.findPitch(frame, sampleRate)
    const isVoiced =
      clarity >= cfg.clarityThreshold && hz >= cfg.minHz && hz <= cfg.maxHz
    points.push({
      t: i / sampleRate,
      hz: isVoiced ? hz : 0,
      clarity,
    })
  }

  return {
    points,
    duration: samples.length / sampleRate,
    sampleRate,
  }
}

// Drop leading/trailing unvoiced frames.
export function trimSilence(curve: PitchCurve): PitchCurve {
  const first = curve.points.findIndex((p) => p.hz > 0)
  if (first < 0) return { ...curve, points: [] }
  let last = curve.points.length - 1
  while (last > first && curve.points[last].hz === 0) last--
  const trimmed = curve.points.slice(first, last + 1)
  return {
    ...curve,
    points: trimmed,
    duration: trimmed.length > 0 ? trimmed[trimmed.length - 1].t - trimmed[0].t : 0,
  }
}

// Hz -> semitones (log scale) so that pitch shapes can be compared across speakers.
export function toSemitones(hz: number, ref = 100): number {
  return 12 * Math.log2(hz / ref)
}

// Pull out a normalized voiced sequence in semitones (zero-mean).
// Returns an empty array when the curve has no voiced frames.
export function normalizedSemitones(curve: PitchCurve): number[] {
  const voiced = curve.points.filter((p) => p.hz > 0).map((p) => toSemitones(p.hz))
  if (voiced.length === 0) return []
  const mean = voiced.reduce((a, b) => a + b, 0) / voiced.length
  return voiced.map((v) => v - mean)
}
