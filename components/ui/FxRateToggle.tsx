'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { FxMode } from '@/lib/fx'

interface FxRateToggleProps {
  mrrCadNative: number
  mrrUsdNative: number
  liveFxRate: number            // ECB/Frankfurter market rate
  stripeApiRate: number         // Stripe's live payment-processing rate
  stripeDashboardRate: number   // Implied stale rate Stripe's MRR dashboard uses
  activeFxMode: FxMode          // The mode currently driving dashboard figures
}

type RateMode = FxMode

function fmt(n: number) {
  return '$' + Math.round(n).toLocaleString('en-CA')
}

const MODES: { key: RateMode; label: string; shortLabel: string }[] = [
  { key: 'live',             label: 'Live Market Rate',        shortLabel: 'Market' },
  { key: 'stripe_api',       label: "Stripe's Payment Rate",   shortLabel: 'Stripe Pay' },
  { key: 'stripe_dashboard', label: "Stripe's MRR Rate",       shortLabel: 'Stripe MRR' },
]

export function FxRateToggle({
  mrrCadNative,
  mrrUsdNative,
  liveFxRate,
  stripeApiRate,
  stripeDashboardRate,
  activeFxMode,
}: FxRateToggleProps) {
  const [mode, setMode] = useState<RateMode>(activeFxMode)

  const rateMap: Record<RateMode, number> = {
    live: liveFxRate,
    stripe_api: stripeApiRate,
    stripe_dashboard: stripeDashboardRate,
  }

  const fxRate = rateMap[mode]
  const mrrUsdInCad = mrrUsdNative * fxRate
  const totalMrr = mrrCadNative + mrrUsdInCad
  const totalArr = totalMrr * 12

  const modeColors: Record<RateMode, { active: string; text: string; bg: string; border: string }> = {
    live:             { active: 'bg-indigo-600',  text: 'text-indigo-300',  bg: 'bg-indigo-500/8',  border: 'border-indigo-500/20' },
    stripe_api:       { active: 'bg-emerald-600', text: 'text-emerald-300', bg: 'bg-emerald-500/8', border: 'border-emerald-500/20' },
    stripe_dashboard: { active: 'bg-amber-600',   text: 'text-amber-300',   bg: 'bg-amber-500/8',   border: 'border-amber-500/20' },
  }

  const c = modeColors[mode]

  const descriptions: Record<RateMode, React.ReactNode> = {
    live: (
      <>
        ECB mid-market rate via Frankfurter:{' '}
        <span className="text-indigo-400 font-medium">1 USD = {liveFxRate.toFixed(4)} CAD</span>.
        {' '}The most accurate real-time conversion of your USD subscriptions into CAD.
      </>
    ),
    stripe_api: (
      <>
        Stripe's actual payment-processing rate from their most recent USD→CAD settlement:{' '}
        <span className="text-emerald-400 font-medium">1 USD = {stripeApiRate.toFixed(4)} CAD</span>.
        {' '}Pulled from balance transaction data — tracks ECB closely, updated on each payment.
      </>
    ),
    stripe_dashboard: (
      <>
        Stripe's internal MRR rate:{' '}
        <span className="text-amber-400 font-medium">1 USD = {stripeDashboardRate.toFixed(4)} CAD</span>.
        {' '}Updated periodically by Stripe, independent of their payment rate.
        {' '}Use this to match the MRR figure shown on Stripe's dashboard exactly.
      </>
    ),
  }

  const liveTotal = mrrCadNative + mrrUsdNative * liveFxRate

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-4 space-y-4">
      {/* Header + toggle */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">FX Rate Comparison</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Residual gap vs Stripe is FX rate timing only.
            {' '}
            <Link href="/dashboard/settings" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">
              Change rate in Settings ↗
            </Link>
          </p>
        </div>
        <div className="flex rounded-lg overflow-hidden border border-slate-700 text-xs font-medium">
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`relative px-3 py-1.5 transition-colors ${
                mode === m.key
                  ? modeColors[m.key].active + ' text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {m.shortLabel}
              {m.key === activeFxMode && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 border border-slate-900" title="Active dashboard rate" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Rate description */}
      <p className="text-xs text-slate-500 leading-relaxed">{descriptions[mode]}</p>

      {/* Breakdown */}
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div className="rounded-lg bg-slate-900/60 p-3">
          <div className="text-slate-500 mb-1">CAD subscriptions</div>
          <div className="text-slate-100 font-semibold text-sm">
            {fmt(mrrCadNative)}<span className="text-slate-500 font-normal">/mo</span>
          </div>
          <div className="text-slate-600 mt-0.5">No FX conversion</div>
        </div>
        <div className="rounded-lg bg-slate-900/60 p-3">
          <div className="text-slate-500 mb-1">USD subscriptions</div>
          <div className={`font-semibold text-sm ${c.text}`}>
            {fmt(mrrUsdInCad)}<span className="text-slate-500 font-normal">/mo</span>
          </div>
          <div className="text-slate-600 mt-0.5">
            ${Math.round(mrrUsdNative).toLocaleString()} USD × {fxRate.toFixed(4)}
          </div>
        </div>
        <div className="rounded-lg bg-slate-900/60 p-3">
          <div className="text-slate-500 mb-1">Total MRR</div>
          <div className={`font-semibold text-sm ${c.text}`}>
            {fmt(totalMrr)}<span className="text-slate-500 font-normal">/mo</span>
          </div>
          <div className="text-slate-600 mt-0.5">ARR: {fmt(totalArr)}</div>
        </div>
      </div>

      {/* Contextual callout */}
      <div className={`rounded-lg ${c.bg} border ${c.border} px-3 py-2 text-xs ${c.text.replace('300', '200/80')}`}>
        {mode === 'live' && (
          <>
            Live rate gives <span className="font-semibold">{fmt(liveTotal)}/mo MRR</span>.
            {' '}Switch to{' '}
            <button onClick={() => setMode('stripe_dashboard')} className="underline underline-offset-2 hover:opacity-80">
              Stripe's Dashboard rate
            </button>
            {' '}to see why their MRR display shows{' '}
            <span className="font-semibold">{fmt(mrrCadNative + mrrUsdNative * stripeDashboardRate)}/mo</span>.
          </>
        )}
        {mode === 'stripe_api' && (
          <>
            Stripe's current payment rate gives <span className="font-semibold">{fmt(totalMrr)}/mo MRR</span>
            {' '}— {stripeApiRate > liveFxRate
              ? `${((stripeApiRate - liveFxRate) / liveFxRate * 100).toFixed(1)}% above market`
              : `${((liveFxRate - stripeApiRate) / liveFxRate * 100).toFixed(1)}% below market`}.
            {' '}Updated frequently, unlike the rate used in Stripe's MRR dashboard.
          </>
        )}
        {mode === 'stripe_dashboard' && (
          <>
            <span className="font-semibold">{fmt(liveTotal - totalMrr)}/mo</span>
            {' '}difference vs live market rate — entirely from USD subs converted at Stripe's stale rate.
            {' '}The {fmt(totalMrr)}/mo figure is what Stripe's dashboard shows.
          </>
        )}
      </div>
    </div>
  )
}
