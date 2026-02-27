'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ReportEditor } from '@/components/report-editor/ReportEditor'
import { ExportPdfButton } from '@/components/report-editor/ExportPdfButton'
import type { Report } from '@/lib/report-template'
import type { KpiData, CustomerData } from '@/lib/stripe-calculations'

type OverviewData = {
  kpis: KpiData
  churnedDowngrades: Array<{ arrLostCad: number }>
}

export default function ReportPage() {
  const params = useParams()
  const id = params?.id as string

  const [report, setReport] = useState<Report | null>(null)
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [customers, setCustomers] = useState<CustomerData[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [storageUnavailable, setStorageUnavailable] = useState(false)

  useEffect(() => {
    if (!id) return
    Promise.all([
      fetch(`/api/reports/${id}`).then((r) => r.json()),
      fetch('/api/stripe/overview').then((r) => r.json()),
      fetch('/api/stripe/customers').then((r) => r.json()),
    ]).then(([reportData, overviewData, customersData]) => {
      if (reportData?.error) return // invalid ID or server error — stay on loading screen
      if (reportData?._storageUnavailable) setStorageUnavailable(true)
      setReport(reportData)
      setOverview(overviewData)
      setCustomers(customersData.customers ?? [])
    })
  }, [id])

  const handleSave = useCallback(async (updates: Partial<Report>) => {
    if (!id) return
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch(`/api/reports/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      const updated = await res.json()
      setReport(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }, [id])

  const handlePublishToggle = useCallback(async () => {
    if (!report) return
    setPublishing(true)
    await handleSave({ publishedToInvestors: !report.publishedToInvestors })
    setPublishing(false)
  }, [report, handleSave])

  if (!report || !overview) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        Loading report...
      </div>
    )
  }

  const churnCount = overview.churnedDowngrades?.length ?? 0
  const arrLostToChurn = overview.churnedDowngrades?.reduce((s, c) => s + c.arrLostCad, 0) ?? 0

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      {storageUnavailable && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          Redis not configured — edits won&apos;t be saved. Add{' '}
          <code className="font-mono text-xs">UPSTASH_REDIS_REST_URL</code> and{' '}
          <code className="font-mono text-xs">UPSTASH_REDIS_REST_TOKEN</code> to{' '}
          <code className="font-mono text-xs">.env.local</code> to enable persistence.
        </div>
      )}
      {/* Toolbar */}
      <div className="no-print flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/reports" className="text-sm text-slate-500 hover:text-slate-300">
            ← Reports
          </Link>
          <h1 className="text-xl font-bold text-slate-100">{report.quarter} Report</h1>
          {saving && <span className="text-xs text-slate-500">Saving...</span>}
          {saved && <span className="text-xs text-emerald-400">Saved</span>}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handlePublishToggle}
            disabled={publishing}
            className={`text-sm px-4 py-2 rounded-lg border font-medium transition-colors ${
              report.publishedToInvestors
                ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20'
                : 'border-slate-700 text-slate-400 hover:bg-slate-800'
            }`}
          >
            {report.publishedToInvestors ? '✓ Published to Investors' : 'Publish to Investors'}
          </button>
          <ExportPdfButton reportTitle={`Vome ${report.quarter} Report`} />
        </div>
      </div>

      {/* Print header (only visible on print) */}
      <div className="hidden print:block mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Vome</h1>
        <h2 className="text-xl text-gray-600 mt-1">{report.quarter} Investor Report</h2>
        <hr className="mt-4 border-gray-300" />
      </div>

      {/* Report Content */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 md:p-8 print:bg-white print:border-0 print:shadow-none">
        <ReportEditor
          report={report}
          kpis={overview.kpis}
          topCustomers={customers}
          churnCount={churnCount}
          arrLostToChurn={arrLostToChurn}
          onSave={handleSave}
        />
      </div>
    </div>
  )
}
