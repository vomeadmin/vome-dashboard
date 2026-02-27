import Link from 'next/link'
import { getQuarterFromDate, makeReportId } from '@/lib/report-template'

export const dynamic = 'force-dynamic'

async function getReports() {
  try {
    const { Redis } = await import('@upstash/redis')
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      return []
    }
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
    const ids = await redis.smembers('reports:index')
    if (!ids.length) return []
    const reports = await Promise.all(ids.map((id) => redis.get<any>(`report:${id}`)))
    return reports
      .filter(Boolean)
      .sort((a, b) => b.id.localeCompare(a.id))
  } catch {
    return []
  }
}

export default async function ReportsPage() {
  const reports = await getReports()
  const { year, quarter } = getQuarterFromDate()
  const currentId = makeReportId(year, quarter)

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Quarterly Reports</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Editable reports for investor communication
          </p>
        </div>
        <Link
          href={`/dashboard/reports/${currentId}`}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
        >
          <span>+</span>
          Current Quarter
        </Link>
      </div>

      {reports.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-10 text-center">
          <p className="text-slate-400">No reports yet.</p>
          <p className="text-slate-500 text-sm mt-1">
            Click &ldquo;Current Quarter&rdquo; to create your first report.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {reports.map((r: any) => (
            <Link
              key={r.id}
              href={`/dashboard/reports/${r.id}`}
              className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 px-5 py-4 hover:bg-slate-800/70 transition-colors"
            >
              <div>
                <div className="flex items-center gap-3">
                  <span className="text-base font-semibold text-slate-200">{r.quarter}</span>
                  {r.publishedToInvestors && (
                    <span className="text-xs bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full font-medium">
                      Published
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Last edited {new Date(r.updatedAt).toLocaleDateString('en-CA', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </div>
              </div>
              <span className="text-slate-600">→</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
