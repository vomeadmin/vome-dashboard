import { formatCad } from '@/lib/fx'
import { PLAN_COLORS, type PlanTier } from '@/lib/plan-config'
import type { SubscriptionData } from '@/lib/stripe-calculations'

interface RenewalTimelineProps {
  renewals: SubscriptionData[]
}

function daysUntil(date: Date): number {
  const diff = date.getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function urgencyClass(days: number): string {
  if (days <= 14) return 'text-rose-400 bg-rose-400/10'
  if (days <= 30) return 'text-amber-400 bg-amber-400/10'
  return 'text-slate-400 bg-slate-800'
}

export function RenewalTimeline({ renewals }: RenewalTimelineProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4">
        Upcoming Renewals
      </h3>
      <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
        {renewals.length === 0 && (
          <p className="text-sm text-slate-500">No renewals in the next 90 days.</p>
        )}
        {renewals.map((r) => {
          const days = daysUntil(r.currentPeriodEnd)
          const charge = r.interval === 'year' ? r.arrCad : r.mrrCad
          return (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-lg bg-slate-800/50 px-3 py-2.5 text-sm"
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="font-medium text-slate-200 truncate">{r.customerName}</span>
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full w-fit font-medium"
                  style={{
                    backgroundColor: PLAN_COLORS[r.plan] + '22',
                    color: PLAN_COLORS[r.plan],
                  }}
                >
                  {r.plan} · {r.seats} seat{r.seats !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex flex-col items-end gap-0.5 shrink-0 ml-3">
                <span className="font-semibold text-slate-200">{formatCad(charge)}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${urgencyClass(days)}`}>
                  {days <= 0 ? 'Today' : `${days}d`}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
