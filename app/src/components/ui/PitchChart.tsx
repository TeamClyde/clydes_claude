import { useEffect, useRef } from 'react'
import type { PitchCurve } from '../../lib/audio/pitch'
import { toSemitones } from '../../lib/audio/pitch'

interface Props {
  user?: PitchCurve | null
  reference?: PitchCurve | null
  height?: number
  userLabel?: string
  referenceLabel?: string
}

export function PitchChart({
  user,
  reference,
  height = 160,
  userLabel = 'You',
  referenceLabel = 'Reference',
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.max(1, Math.floor(rect.width * dpr))
    canvas.height = Math.max(1, Math.floor(height * dpr))
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const w = rect.width
    const h = height
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#fafafa'
    ctx.fillRect(0, 0, w, h)

    const allVoiced: number[] = []
    if (user) for (const p of user.points) if (p.hz > 0) allVoiced.push(toSemitones(p.hz))
    if (reference) for (const p of reference.points) if (p.hz > 0) allVoiced.push(toSemitones(p.hz))

    if (allVoiced.length === 0) {
      ctx.fillStyle = '#94a3b8'
      ctx.font = '13px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('No voiced audio yet — record above', w / 2, h / 2)
      return
    }

    const minSt = Math.min(...allVoiced) - 1
    const maxSt = Math.max(...allVoiced) + 1
    const range = Math.max(1, maxSt - minSt)

    ctx.strokeStyle = '#eef2f6'
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = (i / 4) * h
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
    }

    const drawCurve = (curve: PitchCurve, color: string, dashed: boolean) => {
      const duration = curve.duration || curve.points[curve.points.length - 1]?.t || 1
      ctx.strokeStyle = color
      ctx.lineWidth = 2.5
      ctx.setLineDash(dashed ? [5, 4] : [])
      let drawing = false
      ctx.beginPath()
      for (const p of curve.points) {
        if (p.hz === 0) { drawing = false; continue }
        const st = toSemitones(p.hz)
        const x = (p.t / duration) * w
        const y = h - ((st - minSt) / range) * h
        if (!drawing) { ctx.moveTo(x, y); drawing = true }
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.setLineDash([])
    }

    if (reference) drawCurve(reference, '#94a3b8', true)
    if (user) drawCurve(user, '#e11d48', false)
  }, [user, reference, height])

  return (
    <div>
      <canvas ref={canvasRef} style={{ width: '100%', height }} className="rounded-lg border border-slate-200" />
      <div className="flex items-center gap-4 mt-2 text-xs text-slate-600">
        {user && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-0.5 bg-rose-600" /> {userLabel}
          </span>
        )}
        {reference && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-0.5 border-t-2 border-dashed border-slate-400" /> {referenceLabel}
          </span>
        )}
      </div>
    </div>
  )
}
