import type { LucideIcon } from 'lucide-react'

const COLOR_CLASSES: Record<string, string> = {
  rose: 'from-rose-500 to-rose-600',
  emerald: 'from-emerald-500 to-emerald-600',
  blue: 'from-blue-500 to-blue-600',
  violet: 'from-violet-500 to-violet-600',
  amber: 'from-amber-500 to-amber-600',
}

interface Props {
  label: string
  value: string | number
  icon: LucideIcon
  color: keyof typeof COLOR_CLASSES
}

export function StatCard({ label, value, icon: Icon, color }: Props) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${COLOR_CLASSES[color]} flex items-center justify-center mb-3`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500 uppercase tracking-wider mt-1">{label}</p>
    </div>
  )
}
