import { formatCad } from '@/lib/fx'
import { PLAN_COLORS } from '@/lib/plan-config'
import type { CustomerData } from '@/lib/stripe-calculations'

interface CustomerTableProps {
  customers: CustomerData[]
  limit?: number
}

export function CustomerTable({ customers, limit }: CustomerTableProps) {
  const rows = limit ? customers.slice(0, limit) : customers

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Top Customers by ARR
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                Customer
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                Plan
              </th>
              <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                Seats
              </th>
              <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                ARR
              </th>
              <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                Renewal
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c, i) => (
              <tr
                key={c.customerId}
                className={`border-b border-slate-800/50 hover:bg-slate-800/40 transition-colors ${
                  i === rows.length - 1 ? 'border-b-0' : ''
                }`}
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-200 truncate max-w-[180px]">
                    {c.customerName}
                  </div>
                  <div className="text-xs text-slate-500 truncate max-w-[180px]">{c.customerEmail}</div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className="inline-block text-xs font-medium px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: PLAN_COLORS[c.plan] + '22',
                      color: PLAN_COLORS[c.plan],
                    }}
                  >
                    {c.plan}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-slate-300">{c.seats}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-100">
                  {formatCad(c.arrCad)}
                </td>
                <td className="px-4 py-3 text-right text-slate-400 text-xs">
                  {c.renewalDate.toLocaleDateString('en-CA', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
