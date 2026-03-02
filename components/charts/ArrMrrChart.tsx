'use client'

import { useState, useMemo } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'

interface MrrDataPoint {
  monthKey: string
  month: string
  mrr: number
}

interface ArrMrrChartProps {
  data: MrrDataPoint[]
  /** 'mrr' (default) shows MRR; 'arr' multiplies by 12 and labels everything as ARR */
  mode?: 'mrr' | 'arr'
  /** Optional subtitle shown below the chart title */
  subtitle?: string
}

function formatTick(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value}`
}

function formatPct(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

/** Shorten quarterly labels: "Q1 '24" at year boundaries, "Q2"/"Q3"/"Q4" otherwise */
function formatQuarterlyTick(value: string, index: number, allData: MrrDataPoint[]): string {
  const parts = value.split(' ') // "Q1 2024" → ["Q1", "2024"]
  if (parts.length !== 2) return value
  const [quarter, year] = parts
  const prevYear = index > 0 ? allData[index - 1]?.month.split(' ')[1] : null
  return index === 0 || prevYear !== year ? `${quarter} '${year.slice(2)}` : quarter
}

/** Shorten monthly labels: keep "Jan '24" as-is (already compact), skip intermediate months */
function formatMonthlyTick(value: string, index: number, totalPoints: number): string {
  // Show a tick every 6 months, always show the first and last
  if (index === 0 || index === totalPoints - 1) return value
  if (index % 6 === 0) return value
  return ''
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 shadow-xl text-sm">
      <p className="font-medium text-slate-300 mb-1">{label}</p>
      <p className="text-indigo-400 font-semibold">
        CA${payload[0]?.value?.toLocaleString('en-CA', { maximumFractionDigits: 0 })}
      </p>
    </div>
  )
}

function toQuarterly(data: MrrDataPoint[]): MrrDataPoint[] {
  const quarters = new Map<string, MrrDataPoint>()
  for (const point of data) {
    const [year, monthStr] = point.monthKey.split('-')
    const q = Math.ceil(parseInt(monthStr) / 3)
    const key = `${year}-Q${q}`
    // Use end-of-quarter snapshot (last month wins)
    if (!quarters.has(key) || point.monthKey > quarters.get(key)!.monthKey) {
      quarters.set(key, { monthKey: key, month: `Q${q} ${year}`, mrr: point.mrr })
    }
  }
  return Array.from(quarters.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey))
}

export function ArrMrrChart({ data, mode = 'mrr', subtitle }: ArrMrrChartProps) {
  const [view, setView] = useState<'monthly' | 'quarterly'>('quarterly')

  const multiplier = mode === 'arr' ? 12 : 1
  const label = mode === 'arr' ? 'ARR' : 'MRR'

  const scaledData = useMemo(
    () => data.map((d) => ({ ...d, mrr: d.mrr * multiplier })),
    [data, multiplier]
  )

  const chartData = useMemo(
    () => (view === 'quarterly' ? toQuarterly(scaledData) : scaledData),
    [scaledData, view]
  )

  const current = scaledData.at(-1)?.mrr ?? 0
  const prevMonth = scaledData.at(-2)?.mrr ?? 0
  const prevYear = scaledData.length >= 13 ? scaledData[scaledData.length - 13]?.mrr : undefined

  const momPct = prevMonth > 0 ? ((current - prevMonth) / prevMonth) * 100 : null
  const yoyPct = prevYear && prevYear > 0 ? ((current - prevYear) / prevYear) * 100 : null

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            {label} Growth
          </h3>
          {subtitle && (
            <p className="text-xs text-slate-600 mt-0.5">{subtitle}</p>
          )}
          <div className="flex items-center gap-4 mt-1.5">
            <span className="text-xl font-bold text-slate-100">
              CA${current.toLocaleString('en-CA', { maximumFractionDigits: 0 })}
            </span>
            {momPct !== null && (
              <span className={`text-xs font-medium ${momPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatPct(momPct)} MoM
              </span>
            )}
            {yoyPct !== null && (
              <span className={`text-xs font-medium ${yoyPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatPct(yoyPct)} YoY
              </span>
            )}
          </div>
        </div>
        <div className="flex rounded-md border border-slate-700 overflow-hidden text-xs">
          <button
            onClick={() => setView('quarterly')}
            className={`px-3 py-1.5 font-medium transition-colors ${
              view === 'quarterly'
                ? 'bg-slate-700 text-slate-100'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            Quarterly
          </button>
          <button
            onClick={() => setView('monthly')}
            className={`px-3 py-1.5 font-medium transition-colors border-l border-slate-700 ${
              view === 'monthly'
                ? 'bg-slate-700 text-slate-100'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            Monthly
          </button>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="mrrGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval={0}
            tickFormatter={(value, index) =>
              view === 'quarterly'
                ? formatQuarterlyTick(value, index, chartData)
                : formatMonthlyTick(value, index, chartData.length)
            }
          />
          <YAxis
            tickFormatter={formatTick}
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="mrr"
            stroke="#6366f1"
            strokeWidth={2}
            fill="url(#mrrGradient)"
            dot={false}
            activeDot={{ r: 4, fill: '#6366f1' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
