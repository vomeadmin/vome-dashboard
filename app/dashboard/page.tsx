import { getKpis, getUpcomingRenewals, getNormalizedMrrByMonth, getChurnedDowngrades, getTopCustomers } from '@/lib/stripe-calculations'
import { getCashFlowForecast } from '@/lib/stripe-forecast'
import { cookies } from 'next/headers'
import { formatCad, getEffectiveFxRate, type FxMode } from '@/lib/fx'
import { KpiCard } from '@/components/ui/KpiCard'
import { RenewalTimeline } from '@/components/ui/RenewalTimeline'
import { CustomerTable } from '@/components/ui/CustomerTable'
import { ArrMrrChart } from '@/components/charts/ArrMrrChart'
import { CashFlowChart } from '@/components/charts/CashFlowChart'
import { PlanBreakdownChart } from '@/components/charts/PlanBreakdownChart'
import ActivityPanel from './ActivityPanel'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const cookieStore = await cookies()
  const fxMode = (cookieStore.get('fx_mode')?.value ?? 'stripe_dashboard') as FxMode
  const fxRate = await getEffectiveFxRate(fxMode)

  const [kpis, renewals, mrrTrend, forecast, customers, churnedDowngrades] =
    await Promise.all([
      getKpis(fxRate),
      getUpcomingRenewals(90, fxRate),
      getNormalizedMrrByMonth(24, fxRate),
      getCashFlowForecast(fxRate),
      getTopCustomers(5, fxRate),
      getChurnedDowngrades(thirtyDaysAgo, fxRate),
    ])

  // Override current month with the KPI MRR (getKpis uses the accurate path: tiered pricing,
  // unit_amount_decimal fallback, and discount coupons). getNormalizedMrrByMonth uses a simpler
  // historical snapshot approach that misses these — so the last bucket would otherwise show a
  // different number than the KPI card.
  if (mrrTrend.length > 0) {
    mrrTrend[mrrTrend.length - 1] = { ...mrrTrend[mrrTrend.length - 1], mrr: kpis.mrr }
  }

  const churnCount = churnedDowngrades.length
  const arrLostToChurn = churnedDowngrades.reduce((sum: number, c) => sum + c.arrLostCad, 0)

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Financial Overview </h1>
        {/* <p className="text-sm text-slate-500 mt-0.5">
          All figures in CAD
        </p> */}
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="MRR"
          value={formatCad(kpis.mrr)}
          subValue="Monthly Recurring Revenue"
          note={kpis.trialingSubscriptions > 0 ? `+ ${formatCad(kpis.trialingMrr)} pipeline (${kpis.trialingSubscriptions} trials, excl. above)` : undefined}
          accent="default"
          icon="◈"
        />
        <KpiCard
          label="ARR"
          value={formatCad(kpis.arr)}
          subValue="Annual Recurring Revenue"
          note={kpis.trialingSubscriptions > 0 ? `+ ${formatCad(kpis.trialingArr)} pipeline (${kpis.trialingSubscriptions} trials, excl. above)` : undefined}
          accent="positive"
          icon="▲"
        />
        <KpiCard
          label="Active Subscriptions"
          value={kpis.activeSubscriptions.toString()}
          subValue={[
            `${kpis.totalSeats} total admin seats`,
            kpis.trialingSubscriptions > 0 ? `+${kpis.trialingSubscriptions} trialing` : '',
            kpis.pastDueSubscriptions > 0 ? `+${kpis.pastDueSubscriptions} past due` : '',
          ].filter(Boolean).join(' · ')}
          icon="◎"
        />
        <KpiCard
          label="Avg ARR / Customer"
          value={formatCad(kpis.avgArrPerCustomer)}
          subValue="All plans"
          icon="◧"
        />
      </div>

      {/* Churn alert (only shown when there are downgrades) */}
      {churnCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm">
          <span className="text-rose-400 font-semibold">▼ {churnCount} downgrade{churnCount !== 1 ? 's' : ''} in past 30 days</span>
          <span className="text-rose-400/70">—</span>
          <span className="text-rose-400/80">{formatCad(arrLostToChurn)} ARR at risk</span>
          <div className="flex-1" />
          <span className="text-rose-500/60 text-xs">
            {churnedDowngrades.map((c) => c.customerName).slice(0, 3).join(', ')}
            {churnCount > 3 ? ` +${churnCount - 3} more` : ''}
          </span>
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ArrMrrChart data={mrrTrend} />
        <PlanBreakdownChart byPlan={kpis.byPlan} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <CashFlowChart
            currentQuarter={forecast.currentQuarter}
            nextQuarter={forecast.nextQuarter}
            currentQLabel={forecast.currentQLabel}
            nextQLabel={forecast.nextQLabel}
          />
        </div>
        <RenewalTimeline renewals={renewals} />
      </div>

      {/* Bottom grid: top customers + activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <CustomerTable customers={customers} />
          <p className="text-xs text-slate-600 mt-2 px-1">
            Showing top {customers.length} of {kpis.activeSubscriptions} active subscriptions
          </p>
        </div>
        <ActivityPanel />
      </div>

      {/* FX calibration footer — internal only. Shows native currency breakdown so you can
          back-calculate Stripe's internal FX rate when numbers drift:
          new rate = (Stripe dashboard MRR − CAD native) ÷ USD native
          Then update STRIPE_DASHBOARD_FX_RATE in .env.local */}
      <p className="text-xs text-slate-700 text-right">
        CAD base: {formatCad(kpis.mrrCadNative)} · USD base: {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(kpis.mrrUsdNative)} · Rate: {fxRate.toFixed(4)}
      </p>
    </div>
  )
}
