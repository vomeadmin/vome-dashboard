import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  getUsdToCadRate,
  getStripeUsdToCadRate,
  getEffectiveFxRate,
  type FxMode,
  FX_MODE_LABELS,
} from '@/lib/fx'

export const dynamic = 'force-dynamic'

async function saveFxMode(formData: FormData) {
  'use server'
  const mode = formData.get('fxMode') as FxMode
  const cookieStore = await cookies()
  cookieStore.set('fx_mode', mode, { path: '/', maxAge: 60 * 60 * 24 * 365 })
  redirect('/dashboard/settings')
}

const MODE_DESCRIPTIONS: Record<FxMode, string> = {
  live: 'ECB mid-market rate via Frankfurter, refreshed every 10 minutes. Best real-time approximation of the USD→CAD rate.',
  stripe_api: "The rate from Stripe's most recent USD→CAD payment settlement, pulled from balance transactions. This is the actual rate Stripe charged when processing your USD subscriptions.",
  stripe_dashboard: "Stripe's internal MRR rate — updated periodically by Stripe independently of their payment-processing rate. To recalibrate: compute (Stripe MRR shown − CAD native MRR) ÷ USD native MRR and update STRIPE_DASHBOARD_FX_RATE in .env.local.",
}

const MODE_BADGES: Partial<Record<FxMode, string>> = {
  stripe_dashboard: 'Matches Stripe',
}

export default async function SettingsPage() {
  const cookieStore = await cookies()
  const currentMode = (cookieStore.get('fx_mode')?.value ?? 'live') as FxMode

  const [liveRate, stripeApiRate] = await Promise.all([
    getUsdToCadRate(),
    getStripeUsdToCadRate(),
  ])
  const stripeDashboardRate = parseFloat(process.env.STRIPE_DASHBOARD_FX_RATE ?? '1.1268')

  const modes: { key: FxMode; rate: number }[] = [
    { key: 'live', rate: liveRate },
    { key: 'stripe_api', rate: stripeApiRate },
    { key: 'stripe_dashboard', rate: stripeDashboardRate },
  ]

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Configure how the dashboard converts USD subscriptions to CAD
        </p>
      </div>

      {/* FX Rate Source */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-slate-200">FX Rate Source</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Affects MRR, ARR, customer table, and cash flow forecast across all dashboard views
          </p>
        </div>

        <form action={saveFxMode} className="p-5 flex flex-col gap-3">
          {modes.map((m) => {
            const isActive = currentMode === m.key
            return (
              <label
                key={m.key}
                className={`flex items-start gap-4 rounded-lg border p-4 cursor-pointer transition-colors ${
                  isActive
                    ? 'border-indigo-500/50 bg-indigo-500/5'
                    : 'border-slate-700/50 bg-slate-800/30 hover:border-slate-600'
                }`}
              >
                <input
                  type="radio"
                  name="fxMode"
                  value={m.key}
                  defaultChecked={isActive}
                  className="mt-0.5 accent-indigo-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-200">
                      {FX_MODE_LABELS[m.key]}
                    </span>
                    {MODE_BADGES[m.key] && (
                      <span className="text-xs bg-indigo-500/15 text-indigo-400 px-1.5 py-0.5 rounded font-medium">
                        {MODE_BADGES[m.key]}
                      </span>
                    )}
                    {isActive && (
                      <span className="text-xs bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded font-medium">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    {MODE_DESCRIPTIONS[m.key]}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold text-slate-200">{m.rate.toFixed(4)}</div>
                  <div className="text-xs text-slate-500">USD/CAD</div>
                </div>
              </label>
            )
          })}

          <button
            type="submit"
            className="mt-2 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
          >
            Save Setting
          </button>
        </form>
      </div>

      <p className="text-xs text-slate-600">
        This setting is saved in your browser cookie and applies to all dashboard views including
        Overview, Customers, and Cash Flow. Historical revenue trend always uses the live rate
        since it reflects actual cash received.
      </p>
    </div>
  )
}
