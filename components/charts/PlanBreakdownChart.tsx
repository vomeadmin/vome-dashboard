'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { PLAN_COLORS, PLAN_ORDER, type PlanTier } from '@/lib/plan-config'
import { formatCad } from '@/lib/fx'
import type { PlanSummary } from '@/lib/stripe-calculations'

interface PlanBreakdownChartProps {
  byPlan: Record<PlanTier, PlanSummary>
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 shadow-xl text-sm">
      <p className="font-semibold" style={{ color: d.payload.fill }}>
        {d.name}
      </p>
      <p className="text-slate-300">{formatCad(d.value)}</p>
      <p className="text-slate-500 text-xs">{d.payload.count} subscription{d.payload.count !== 1 ? 's' : ''}</p>
    </div>
  )
}

export function PlanBreakdownChart({ byPlan }: PlanBreakdownChartProps) {
  const data = PLAN_ORDER.map((tier) => ({
    name: tier,
    value: byPlan[tier].arr,
    count: byPlan[tier].count,
    fill: PLAN_COLORS[tier],
  })).filter((d) => d.value > 0)

  const total = data.reduce((sum, d) => sum + d.value, 0)

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4">
        ARR by Plan
      </h3>
      <div className="flex items-center gap-4">
        <ResponsiveContainer width={140} height={140}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={42}
              outerRadius={62}
              paddingAngle={2}
              dataKey="value"
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.fill} stroke="transparent" />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>

        <div className="flex flex-col gap-2 flex-1">
          {data.map((entry) => (
            <div key={entry.name} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: entry.fill }}
                />
                <span className="text-slate-300">{entry.name}</span>
              </div>
              <div className="text-right">
                <span className="font-semibold text-slate-200">{formatCad(entry.value)}</span>
                <span className="text-slate-500 text-xs ml-2">
                  {total > 0 ? ((entry.value / total) * 100).toFixed(0) : 0}%
                </span>
              </div>
            </div>
          ))}
          {data.length === 0 && (
            <p className="text-sm text-slate-500">No paid subscriptions yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
