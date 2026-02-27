import { formatCad } from '@/lib/fx'
import { PLAN_COLORS, PLAN_ORDER, type PlanTier } from '@/lib/plan-config'
import type { DataBlockKey } from '@/lib/report-template'
import type { KpiData, CustomerData } from '@/lib/stripe-calculations'

interface DataBlockProps {
  dataKey: DataBlockKey
  kpis: KpiData
  topCustomers: CustomerData[]
  churnCount: number
  arrLostToChurn: number
}

export function DataBlock({ dataKey, kpis, topCustomers, churnCount, arrLostToChurn }: DataBlockProps) {
  const total = Object.values(kpis.byPlan).reduce((sum, p) => sum + p.arr, 0)

  if (dataKey === 'kpi_summary') {
    return (
      <div className="grid grid-cols-2 gap-3 print:grid-cols-4 print:gap-2">
        {[
          { label: 'ARR (CAD)', value: formatCad(kpis.arr) },
          { label: 'MRR (CAD)', value: formatCad(kpis.mrr) },
          { label: 'Active Subscriptions', value: kpis.activeSubscriptions.toString() },
          { label: 'Avg ARR / Customer', value: formatCad(kpis.avgArrPerCustomer) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 print:bg-gray-50 print:border-gray-200">
            <div className="text-xs uppercase tracking-wider text-slate-400 print:text-gray-500">{label}</div>
            <div className="text-xl font-bold text-slate-100 print:text-gray-900 mt-1">{value}</div>
          </div>
        ))}
      </div>
    )
  }

  if (dataKey === 'arr_by_plan') {
    return (
      <div className="overflow-hidden rounded-lg border border-slate-700 print:border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800/50 print:bg-gray-50 print:border-gray-200">
              <th className="text-left px-4 py-2 text-xs uppercase tracking-wider text-slate-400 print:text-gray-500">Plan</th>
              <th className="text-right px-4 py-2 text-xs uppercase tracking-wider text-slate-400 print:text-gray-500">Customers</th>
              <th className="text-right px-4 py-2 text-xs uppercase tracking-wider text-slate-400 print:text-gray-500">Seats</th>
              <th className="text-right px-4 py-2 text-xs uppercase tracking-wider text-slate-400 print:text-gray-500">ARR</th>
              <th className="text-right px-4 py-2 text-xs uppercase tracking-wider text-slate-400 print:text-gray-500">% of Total</th>
            </tr>
          </thead>
          <tbody>
            {PLAN_ORDER.filter((tier) => kpis.byPlan[tier].count > 0).map((tier) => {
              const plan = kpis.byPlan[tier]
              return (
                <tr key={tier} className="border-b border-slate-800/50 print:border-gray-100">
                  <td className="px-4 py-2.5">
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: PLAN_COLORS[tier] + '22', color: PLAN_COLORS[tier] }}
                    >
                      {tier}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-300 print:text-gray-700">{plan.count}</td>
                  <td className="px-4 py-2.5 text-right text-slate-300 print:text-gray-700">{plan.seats}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-slate-100 print:text-gray-900">{formatCad(plan.arr)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-400 print:text-gray-500">
                    {total > 0 ? ((plan.arr / total) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  if (dataKey === 'top_customers') {
    return (
      <div className="overflow-hidden rounded-lg border border-slate-700 print:border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800/50 print:bg-gray-50 print:border-gray-200">
              <th className="text-left px-4 py-2 text-xs uppercase tracking-wider text-slate-400 print:text-gray-500">#</th>
              <th className="text-left px-4 py-2 text-xs uppercase tracking-wider text-slate-400 print:text-gray-500">Customer</th>
              <th className="text-left px-4 py-2 text-xs uppercase tracking-wider text-slate-400 print:text-gray-500">Plan</th>
              <th className="text-right px-4 py-2 text-xs uppercase tracking-wider text-slate-400 print:text-gray-500">ARR</th>
            </tr>
          </thead>
          <tbody>
            {topCustomers.slice(0, 10).map((c, i) => (
              <tr key={c.customerId} className="border-b border-slate-800/50 print:border-gray-100">
                <td className="px-4 py-2.5 text-slate-500 print:text-gray-400 text-xs">{i + 1}</td>
                <td className="px-4 py-2.5 font-medium text-slate-200 print:text-gray-900">{c.customerName}</td>
                <td className="px-4 py-2.5">
                  <span style={{ color: PLAN_COLORS[c.plan] }} className="text-xs font-medium">{c.plan}</span>
                </td>
                <td className="px-4 py-2.5 text-right font-semibold text-slate-100 print:text-gray-900">{formatCad(c.arrCad)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (dataKey === 'churn_summary') {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
          <div className="text-xs uppercase tracking-wider text-slate-400">Downgrades to Free (30d)</div>
          <div className="text-2xl font-bold text-rose-400 mt-1">{churnCount}</div>
        </div>
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
          <div className="text-xs uppercase tracking-wider text-slate-400">ARR Lost to Downgrades</div>
          <div className="text-2xl font-bold text-rose-400 mt-1">{formatCad(arrLostToChurn)}</div>
        </div>
      </div>
    )
  }

  return null
}
