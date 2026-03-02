'use client'

import { useState } from 'react'

const METRICS = [
  {
    term: 'ARR',
    definition:
      'Annual Recurring Revenue. Total contracted subscription revenue normalized to a 12-month figure, excluding one-time fees and trials.',
  },
  {
    term: 'MRR',
    definition:
      'Monthly Recurring Revenue, equal to ARR divided by 12. The baseline monthly revenue from all active paid subscriptions.',
  },
  {
    term: 'Active Customers',
    definition:
      'Unique organizations with at least one active paid subscription. An org with multiple subscription lines, such as separate departments, is counted once.',
  },
  {
    term: 'Avg ARR / Customer',
    definition:
      'Total ARR divided by unique active customers. Reflects revenue concentration. A rising figure indicates expansion within existing accounts.',
  },
  {
    term: 'Admin Seats',
    definition:
      'Total paying admin licences across all active subscriptions, excluding free-tier seats.',
  },
  {
    term: 'Net Revenue Retention (NRR)',
    definition:
      'The percentage of quarterly MRR retained and grown from existing customers, after accounting for seat expansions, reactivations, contractions, and cancellations. New customer revenue is excluded. A value above 100% means existing customers are growing faster than they are leaving.',
  },
]

export default function MetricsGlossary() {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-5 py-3 text-left hover:bg-slate-800/40 transition-colors"
      >
        <span className="text-slate-400 text-sm">✦</span>
        <span className="text-sm text-slate-400 font-medium">How are these metrics calculated?</span>
        <span className="ml-auto text-slate-600 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-slate-800">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 mt-4">
            {METRICS.map(({ term, definition }) => (
              <div key={term}>
                <p className="text-xs font-semibold text-slate-300 mb-0.5">{term}</p>
                <p className="text-xs text-slate-500 leading-relaxed">{definition}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-700 mt-5 pt-4 border-t border-slate-800/60">
            All figures in CAD. USD subscriptions are converted at the Stripe live FX rate.
            Source: real-time Stripe API. Vome accepts offline bank transfers.
          </p>
        </div>
      )}
    </div>
  )
}
