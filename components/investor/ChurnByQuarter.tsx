'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { QUARTERLY_MRR_METRICS, type QuarterlyMrrMetrics } from '@/lib/mrr-history'

function fmtCad(n: number): string {
  return '$' + Math.abs(n).toLocaleString('en-CA', { maximumFractionDigits: 0 })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function NrrTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null
  const d: QuarterlyMrrMetrics = payload[0].payload
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs shadow-xl min-w-[180px]">
      <p className="font-semibold text-slate-200 mb-1.5">
        {d.quarter}{d.partial ? ' · in progress' : ''}
      </p>
      <p className="text-base font-bold text-slate-100 mb-2">{d.nrr.toFixed(1)}% NRR</p>
      <div className="flex flex-col gap-1 text-slate-400 border-t border-slate-800 pt-2">
        <span>Start MRR: {fmtCad(d.startMrr)}</span>
        {d.expansionMrr > 0 && (
          <span className="text-emerald-400">Expansion: +{fmtCad(d.expansionMrr)}</span>
        )}
        {d.reactivationMrr > 0 && (
          <span className="text-sky-400">Reactivation: +{fmtCad(d.reactivationMrr)}</span>
        )}
        {d.contractionMrr < 0 && (
          <span>Contraction: -{fmtCad(d.contractionMrr)}</span>
        )}
        {d.churnedMrr < 0 && (
          <span>Churn: -{fmtCad(d.churnedMrr)}</span>
        )}
        <span className="border-t border-slate-800 pt-1 mt-0.5 text-slate-500">
          New logos: +{fmtCad(d.newMrr)}
        </span>
      </div>
    </div>
  )
}

export default function ChurnByQuarter() {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Net Revenue Retention
        </h3>
      </div>

      <div className="px-4 pt-5 pb-3">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart
            data={QUARTERLY_MRR_METRICS}
            margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
            barCategoryGap="30%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis
              dataKey="quarter"
              tick={{ fill: '#64748b', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => `${v}%`}
              tick={{ fill: '#64748b', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              domain={[75, 135]}
              ticks={[80, 90, 100, 110, 120, 130]}
              width={42}
            />
            <Tooltip content={<NrrTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />

            {/* 90% = target floor */}
            <ReferenceLine
              y={90}
              stroke="#475569"
              strokeWidth={1.5}
              label={{ value: '90% target', position: 'insideTopRight', fill: '#64748b', fontSize: 10 }}
            />
            {/* 100% = excellence threshold, faint */}
            <ReferenceLine
              y={100}
              stroke="#1e293b"
              strokeWidth={1}
              strokeDasharray="4 4"
              label={{ value: '100%', position: 'insideTopRight', fill: '#334155', fontSize: 10 }}
            />

            <Bar dataKey="nrr" radius={[3, 3, 0, 0]}>
              {QUARTERLY_MRR_METRICS.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.nrr >= 100 ? '#34d399' : '#94a3b8'}
                  fillOpacity={entry.partial ? 0.5 : 1}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="text-xs text-slate-600 text-center mt-2 px-2">
          Net Revenue Retention measures how much MRR Vome retains and grows from existing customers each quarter, excluding new logos.
          Q1 2026 reflects January and February only.
        </p>
      </div>
    </div>
  )
}
