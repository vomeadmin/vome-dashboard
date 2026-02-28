interface KpiCardProps {
  label: string
  value: string
  subValue?: string
  note?: string           // pipeline/context line shown in emerald below subValue
  trend?: number | null  // percentage change
  icon?: string
  accent?: 'default' | 'positive' | 'warning' | 'negative'
}

export function KpiCard({ label, value, subValue, note, trend, icon, accent = 'default' }: KpiCardProps) {
  const accentColors = {
    default: 'border-indigo-500/30',
    positive: 'border-emerald-500/30',
    warning: 'border-amber-500/30',
    negative: 'border-rose-500/30',
  }

  const trendColor =
    trend == null
      ? ''
      : trend >= 0
        ? 'text-emerald-400'
        : 'text-rose-400'

  return (
    <div
      className={`rounded-xl border ${accentColors[accent]} bg-slate-900 p-5 flex flex-col gap-1`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</span>
        {icon && <span className="text-lg">{icon}</span>}
      </div>
      <div className="mt-1 text-2xl font-bold text-slate-100">{value}</div>
      <div className="flex items-center gap-2 mt-0.5">
        {subValue && <span className="text-xs text-slate-500">{subValue}</span>}
        {trend != null && (
          <span className={`text-xs font-medium ${trendColor}`}>
            {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      {note && <span className="text-xs text-emerald-500/80 mt-0.5">{note}</span>}
    </div>
  )
}
