import {
  getKpis,
  getNormalizedMrrByMonth,
  getTopCustomers,
  getChurnedDowngrades,
} from '@/lib/stripe-calculations'
import { getQuarterFromDate, makeReportId, type Report } from '@/lib/report-template'
import { cookies } from 'next/headers'
import { formatCad, getEffectiveFxRate, type FxMode } from '@/lib/fx'
import { KpiCard } from '@/components/ui/KpiCard'
import { ArrMrrChart } from '@/components/charts/ArrMrrChart'
import { PlanBreakdownChart } from '@/components/charts/PlanBreakdownChart'
import InvestorChat from '@/components/investor/InvestorChat'

export const dynamic = 'force-dynamic'

async function getPublishedReport(): Promise<Report | null> {
  try {
    const { Redis } = await import('@upstash/redis')
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
    const { year, quarter } = getQuarterFromDate()
    const id = makeReportId(year, quarter)
    const report = await redis.get<Report>(`report:${id}`)
    return report?.publishedToInvestors ? report : null
  } catch {
    return null
  }
}

export default async function InvestorPage() {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const cookieStore = await cookies()
  const fxMode = (cookieStore.get('fx_mode')?.value ?? 'stripe_dashboard') as FxMode
  const fxRate = await getEffectiveFxRate(fxMode)

  const [kpis, mrrTrend, customers, publishedReport, churnedDowngrades] = await Promise.all([
    getKpis(fxRate),
    getNormalizedMrrByMonth(24, fxRate),
    getTopCustomers(5, fxRate),
    getPublishedReport(),
    getChurnedDowngrades(thirtyDaysAgo, fxRate),
  ])

  const churnCount = churnedDowngrades.length
  const arrLostToChurn = churnedDowngrades.reduce((sum: number, c) => sum + c.arrLostCad, 0)

  const today = new Date().toLocaleDateString('en-CA', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div className="flex flex-col gap-8">
      {/* AI Chat */}
      <InvestorChat />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard label="ARR" value={formatCad(kpis.arr)} accent="positive" icon="▲" />
        <KpiCard label="MRR" value={formatCad(kpis.mrr)} icon="◈" />
        <KpiCard
          label="Active Subscriptions"
          value={kpis.activeSubscriptions.toString()}
          subValue={kpis.trialingSubscriptions > 0 ? `+${kpis.trialingSubscriptions} trialing` : 'All plans'}
          icon="◎"
        />
        <KpiCard
          label="Avg ARR / Customer"
          value={formatCad(kpis.avgArrPerCustomer)}
          subValue="All plans"
          icon="◧"
        />
        <KpiCard
          label="30-Day Churn"
          value={churnCount > 0 ? `${churnCount} account${churnCount !== 1 ? 's' : ''}` : 'None'}
          subValue={churnCount > 0 ? `${formatCad(arrLostToChurn)} ARR` : 'No downgrades'}
          accent={churnCount > 0 ? 'negative' : 'positive'}
          icon={churnCount > 0 ? '▼' : '✓'}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ArrMrrChart data={mrrTrend} mode="arr" />
        <PlanBreakdownChart byPlan={kpis.byPlan} />
      </div>

      {/* Top Accounts */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Revenue Concentration — Top Accounts
          </h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-slate-500">#</th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-slate-500">Account</th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-slate-500">Plan</th>
              <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-slate-500">Seats</th>
              <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-slate-500">ARR</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c, i) => (
              <tr key={c.customerId} className="border-b border-slate-800/50 last:border-b-0">
                <td className="px-4 py-3 text-slate-500 text-xs">{i + 1}</td>
                <td className="px-4 py-3 text-slate-200 font-medium">{c.customerName}</td>
                <td className="px-4 py-3 text-slate-300">{c.plan}</td>
                <td className="px-4 py-3 text-right text-slate-400">{c.seats}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-100">{formatCad(c.arrCad)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Published quarterly narrative (if available) */}
      {publishedReport && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex items-center gap-3 mb-6">
            <h2 className="text-lg font-bold text-slate-100">{publishedReport.quarter} Quarterly Report</h2>
            <span className="text-xs bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full font-medium">
              Current Quarter
            </span>
          </div>
          <div className="flex flex-col gap-6">
            {publishedReport.sections
              .filter((s) => s.type === 'editor' && s.content && s.content.length > 50)
              .map((section) => (
                <div key={section.id}>
                  <h3 className="text-sm font-semibold text-slate-300 mb-2">{section.title}</h3>
                  <div
                    className="text-sm text-slate-400 leading-relaxed prose prose-invert prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: section.content }}
                  />
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <p className="text-xs text-slate-600 text-center">
        Data sourced directly from Stripe · This information is highly confidential and only available to Vome investors
        · Figures can slightly change due to currency conversions as Vome maintains subscriptions in both USD and CAD · {today}
      </p>
    </div>
  )
}
