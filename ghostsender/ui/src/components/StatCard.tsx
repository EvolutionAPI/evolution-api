import { LucideIcon } from 'lucide-react'

interface Props {
  label: string
  value: string | number
  sub?: string
  icon: LucideIcon
  color?: 'purple' | 'cyan' | 'green' | 'amber'
}

const colors = {
  purple: 'bg-violet-500/15 text-violet-400',
  cyan:   'bg-cyan-500/15 text-cyan-400',
  green:  'bg-emerald-500/15 text-emerald-400',
  amber:  'bg-amber-500/15 text-amber-400',
}

export default function StatCard({ label, value, sub, icon: Icon, color = 'purple' }: Props) {
  return (
    <div className="card flex items-start gap-4">
      <div className={`flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0 ${colors[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-semibold text-white mt-0.5 tabular-nums">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}
