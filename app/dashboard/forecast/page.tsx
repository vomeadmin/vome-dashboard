import { cookies } from 'next/headers'
import { getCashFlowForecast } from '@/lib/stripe-forecast'
import { getUpcomingRenewals } from '@/lib/stripe-calculations'
import { formatCad, getEffectiveFxRate, type FxMode } from '@/lib/fx'
import { CashFlowChart } from '@/components/charts/CashFlowChart'
import { RenewalTimeline } from '@/components/ui/RenewalTimeline'
import { KpiCard } from '@/components/ui/KpiCard'

export const dynamic = 'force-dynamic'

export default async function ForecastPage() {
  const cookieStore = await cookies()
  const fxMode = (cookieStore.get('fx_mode')?.value ?? 'live') as FxMode
  const fxRate = await getEffectiveFxRate(fxMode)

  const [forecast, renewals] = await Promise.all([
    getCashFlowForecast(fxRate),
    getUpcomingRenewals(90, fxRate),
  ])

  const renewals30 = renewals.filter((r) => {
    const days = Math.ceil((r.currentPeriodEnd.getTime() - Date.now()) / 86400000)
    return days <= 30
  })

  const renewals30Value = renewals30.reduce(
    (sum, r) => sum + (r.interval === 'year' ? r.arrCad : r.mrrCad),
    0
  )

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Cash Flow Forecast</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Expected cash inflows based on active subscription renewal dates
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label={forecast.currentQLabel}
          value={formatCad(forecast.currentQTotal)}
          subValue="Current quarter"
          accent="positive"
          icon="◈"
        />
        <KpiCard
          label={forecast.nextQLabel}
          value={formatCad(forecast.nextQTotal)}
          subValue="Next quarter"
          icon="◧"
        />
        <KpiCard
          label="Renewals (30d)"
          value={renewals30.length.toString()}
          subValue={formatCad(renewals30Value)}
          accent="warning"
          icon="↻"
        />
        <KpiCard
          label="Renewals (90d)"
          value={renewals.length.toString()}
          icon="↻"
        />
      </div>

      <CashFlowChart
        currentQuarter={forecast.currentQuarter}
        nextQuarter={forecast.nextQuarter}
        currentQLabel={forecast.currentQLabel}
        nextQLabel={forecast.nextQLabel}
      />

      {/* Monthly detail tables */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[
          { label: forecast.currentQLabel, months: forecast.currentQuarter },
          { label: forecast.nextQLabel, months: forecast.nextQuarter },
        ].map(({ label, months }) => (
          <div key={label} className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800">
              <h3 className="text-sm font-semibold text-slate-300">{label}</h3>
            </div>
            {months.map((m) => (
              <div
                key={m.monthKey}
                className="border-b border-slate-800/50 px-5 py-3 last:border-b-0"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-300">{m.month}</span>
                  <span className="text-sm font-bold text-slate-100">{formatCad(m.amount)}</span>
                </div>
                <div className="flex flex-col gap-1">
                  {m.renewals.slice(0, 3).map((r, i) => (
                    <div key={i} className="flex items-center justify-between text-xs text-slate-500">
                      <span className="truncate max-w-[160px]">{r.customerName}</span>
                      <span>{formatCad(r.amount)}</span>
                    </div>
                  ))}
                  {m.renewals.length > 3 && (
                    <div className="text-xs text-slate-600">
                      +{m.renewals.length - 3} more renewal{m.renewals.length - 3 !== 1 ? 's' : ''}
                    </div>
                  )}
                  {m.renewals.length === 0 && (
                    <div className="text-xs text-slate-600">No renewals expected</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <RenewalTimeline renewals={renewals} />
    </div>
  )
}
