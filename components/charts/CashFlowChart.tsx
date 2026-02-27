'use client'

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts'
import type { ForecastMonth } from '@/lib/stripe-forecast'

interface CashFlowChartProps {
  currentQuarter: ForecastMonth[]
  nextQuarter: ForecastMonth[]
  currentQLabel: string
  nextQLabel: string
}

function formatTick(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`
  return `$${value}`
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const data: ForecastMonth = payload[0]?.payload
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 shadow-xl text-sm max-w-xs">
      <p className="font-medium text-slate-300 mb-1">{label}</p>
      <p className="text-indigo-400 font-semibold mb-2">
        CA${data?.amount?.toLocaleString('en-CA', { minimumFractionDigits: 0 })}
      </p>
      <p className="text-xs text-slate-500">{data?.renewalCount ?? 0} renewal{(data?.renewalCount ?? 0) !== 1 ? 's' : ''}</p>
    </div>
  )
}

export function CashFlowChart({
  currentQuarter,
  nextQuarter,
  currentQLabel,
  nextQLabel,
}: CashFlowChartProps) {
  const allMonths = [...currentQuarter, ...nextQuarter]
  const splitIndex = currentQuarter.length

  const chartData = allMonths.map((m, i) => ({
    ...m,
    isNextQuarter: i >= splitIndex,
  }))

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Cash Flow Forecast
        </h3>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-slate-400">
            <span className="inline-block w-3 h-3 rounded-sm bg-indigo-500" />
            {currentQLabel}
          </span>
          <span className="flex items-center gap-1.5 text-slate-400">
            <span className="inline-block w-3 h-3 rounded-sm bg-indigo-500/40" />
            {nextQLabel}
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="30%">
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={formatTick}
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#1e293b' }} />
          <Bar
            dataKey="amount"
            radius={[4, 4, 0, 0]}
            fill="#6366f1"
            // Dim next-quarter bars slightly
            opacity={1}
          />
          {/* Dividing line between quarters */}
          {splitIndex < allMonths.length && (
            <ReferenceLine
              x={allMonths[splitIndex]?.month}
              stroke="#334155"
              strokeDasharray="4 2"
              label={{ value: nextQLabel, position: 'insideTopRight', fill: '#64748b', fontSize: 10 }}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
