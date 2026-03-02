import {
  getKpis,
  getNormalizedMrrByMonth,
  getTopCustomers,
  type CustomerData,
} from '@/lib/stripe-calculations'
import { getQuarterFromDate, makeReportId, type Report, type ReportSection } from '@/lib/report-template'
import { cookies } from 'next/headers'
import { formatCad, getEffectiveFxRate, type FxMode } from '@/lib/fx'
import { PLAN_COLORS, type PlanTier } from '@/lib/plan-config'
import { KpiCard } from '@/components/ui/KpiCard'
import { ArrMrrChart } from '@/components/charts/ArrMrrChart'
import { PlanBreakdownChart } from '@/components/charts/PlanBreakdownChart'
import InvestorChat from '@/components/investor/InvestorChat'
import MetricsGlossary from '@/components/investor/MetricsGlossary'
import ChurnByQuarter from '@/components/investor/ChurnByQuarter'

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

// Format address → "City, Province" for Canada/US, fallback to country code
function formatLocation(city?: string, state?: string, country?: string): string {
  if (city && state) return `${city}, ${state}`
  if (city && country) return `${city}, ${country}`
  if (state && country) return `${state}, ${country}`
  return city ?? state ?? country ?? '—'
}

export default async function InvestorPage() {
  const cookieStore = await cookies()
  const fxMode = (cookieStore.get('fx_mode')?.value ?? 'stripe_dashboard') as FxMode
  const fxRate = await getEffectiveFxRate(fxMode)

  const [kpis, mrrTrend, customers, publishedReport] = await Promise.all([
    getKpis(fxRate),
    getNormalizedMrrByMonth(24, fxRate),
    getTopCustomers(5, fxRate),
    getPublishedReport(),
  ])

  // Override the current in-progress month with the live kpis.mrr
  if (mrrTrend.length > 0) {
    mrrTrend[mrrTrend.length - 1] = { ...mrrTrend[mrrTrend.length - 1], mrr: kpis.mrr }
  }

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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="ARR"
          value={formatCad(kpis.arr)}
          note={kpis.trialingSubscriptions > 0 ? `+ ${formatCad(kpis.trialingArr)} pipeline (${kpis.trialingSubscriptions} trials, excl. above)` : undefined}
          accent="positive"
          icon="▲"
        />
        <KpiCard
          label="MRR"
          value={formatCad(kpis.mrr)}
          note={kpis.trialingSubscriptions > 0 ? `+ ${formatCad(kpis.trialingMrr)} pipeline (${kpis.trialingSubscriptions} trials, excl. above)` : undefined}
          icon="◈"
        />
        <KpiCard
          label="Active Customers"
          value={kpis.uniqueActiveCustomers.toString()}
          subValue={`${kpis.totalSeats} admin seats`}
          icon="◎"
        />
        <KpiCard
          label="Avg ARR / Customer"
          value={formatCad(kpis.avgArrPerCustomer)}
          subValue="All plans"
          icon="◧"
        />
      </div>

      {/* Metrics Glossary */}
      <MetricsGlossary />

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ArrMrrChart data={mrrTrend} mode="arr" />
        <PlanBreakdownChart byPlan={kpis.byPlan} />
      </div>

      {/* Quarterly retention navigator */}
      <ChurnByQuarter />

      {/* Top Accounts */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Top 5 Customers by ARR
          </h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-slate-500">#</th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-slate-500">Account</th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-slate-500">Location</th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-slate-500">Plan</th>
              <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-slate-500">Seats</th>
              <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-slate-500">ARR</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c: CustomerData, i: number) => (
              <tr key={c.customerId} className="border-b border-slate-800/50 last:border-b-0">
                <td className="px-4 py-3 text-slate-500 text-xs">{i + 1}</td>
                <td className="px-4 py-3 text-slate-200 font-medium">{c.customerName}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">{formatLocation(c.city, c.state, c.country)}</td>
                <td className="px-4 py-3">
                  <span
                    className="inline-block text-xs font-medium px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: PLAN_COLORS[c.plan as PlanTier] + '22',
                      color: PLAN_COLORS[c.plan as PlanTier],
                    }}
                  >
                    {c.plan}
                  </span>
                </td>
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
              .filter((s: ReportSection) => s.type === 'editor' && s.content && s.content.length > 50)
              .map((section: ReportSection) => (
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
