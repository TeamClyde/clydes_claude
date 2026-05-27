interface Props {
  label: string
  value: number
  max: number
  color?: string
}

export function ProgressBar({ label, value, max, color = 'bg-rose-500' }: Props) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-slate-700">{label}</span>
        <span className="text-slate-500">{value} / {max}</span>
      </div>
      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
        <div className={`${color} h-full rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
