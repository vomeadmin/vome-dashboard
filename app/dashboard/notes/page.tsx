export default function NotesPage() {
  const dashboardFxRate = process.env.STRIPE_DASHBOARD_FX_RATE ?? '1.40'

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Methodology Notes</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          How numbers are calculated and why they may differ from Stripe
        </p>
      </div>

      {/* MRR methodology */}
      <section className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-slate-200">MRR / ARR Calculation</h2>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3 text-sm text-slate-400 leading-relaxed">
          <p>
            MRR is calculated from <strong className="text-slate-300">active</strong>,{' '}
            <strong className="text-slate-300">trialing</strong>, and{' '}
            <strong className="text-slate-300">past_due</strong> subscriptions — matching
            Stripe&apos;s own methodology. Canceled and unpaid subscriptions are excluded.
          </p>
          <p>
            Each subscription&apos;s annual value is normalized regardless of billing cadence:
          </p>
          <div className="rounded-lg bg-slate-800/60 px-4 py-3 font-mono text-xs text-slate-300 space-y-1">
            <div>monthsInPeriod = interval === &apos;year&apos; ? 12 × intervalCount : intervalCount</div>
            <div>annualValue = unitPrice × seats × (12 / monthsInPeriod)</div>
            <div>MRR = annualValue / 12</div>
          </div>
          <p>
            This correctly handles monthly, quarterly, annual, and multi-year contracts
            (e.g. a 3-year prepaid at $X contributes $X/36 per month).
          </p>
          <p>
            ARR = MRR × 12. Average ARR per customer is based on active subscriptions only.
          </p>
        </div>
      </section>

      {/* MRR Growth chart */}
      <section className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-slate-200">MRR Growth Chart</h2>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3 text-sm text-slate-400 leading-relaxed">
          <p>
            The MRR Growth chart shows <strong className="text-slate-300">normalized MRR</strong>,
            not cash collected. Annual and multi-year invoices are spread evenly across each
            month of their billing period so the chart reflects true recurring revenue rather
            than cash-basis spikes.
          </p>
          <p>
            The chart looks back 24 months (plus up to 3 prior years to catch long-term contracts
            already in progress). MoM and YoY growth are computed from the last and 13th-to-last
            monthly data points respectively.
          </p>
          <p>
            Quarterly view shows end-of-quarter MRR (the snapshot from the final month of each
            quarter: March, June, September, December).
          </p>
        </div>
      </section>

      {/* FX rate */}
      <section className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-slate-200">FX Rate Sources</h2>
        </div>
        <div className="px-5 py-4 flex flex-col gap-4 text-sm text-slate-400 leading-relaxed">
          <div>
            <p className="text-slate-300 font-medium mb-1">Live Market Rate</p>
            <p>
              ECB mid-market rate via Frankfurter API, cached for 10 minutes. The most
              accurate real-time USD → CAD rate but does not match what Stripe charges.
            </p>
          </div>
          <div>
            <p className="text-slate-300 font-medium mb-1">Stripe&apos;s Payment Rate</p>
            <p>
              The exchange rate Stripe actually used on its most recent USD → CAD settlement,
              pulled from balance transactions. This is what customers were actually charged
              at, but may lag the market by days.
            </p>
          </div>
          <div>
            <p className="text-slate-300 font-medium mb-1">Stripe&apos;s MRR Rate (default)</p>
            <p>
              The implicit rate Stripe uses for its own MRR display — back-calculated from
              Stripe&apos;s shown MRR figure. Stored as{' '}
              <code className="text-xs font-mono text-slate-300">STRIPE_DASHBOARD_FX_RATE</code>{' '}
              in <code className="text-xs font-mono text-slate-300">.env.local</code>.
              Current value: <strong className="text-slate-200">{dashboardFxRate}</strong>.
            </p>
            <p className="mt-2">
              To recalibrate when Stripe&apos;s MRR drifts: compute
            </p>
            <div className="rounded-lg bg-slate-800/60 px-4 py-3 font-mono text-xs text-slate-300 mt-1">
              (Stripe MRR shown − CAD native MRR) ÷ USD native MRR
            </div>
            <p className="mt-2">
              and update <code className="text-xs font-mono text-slate-300">STRIPE_DASHBOARD_FX_RATE</code>.
            </p>
          </div>
        </div>
      </section>

      {/* Residual gap */}
      <section className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-slate-200">Residual Gap vs Stripe</h2>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3 text-sm text-slate-400 leading-relaxed">
          <p>
            When using <strong className="text-slate-300">Stripe&apos;s MRR Rate</strong> mode,
            this dashboard should match Stripe&apos;s displayed MRR within ~0.1%. Any remaining
            discrepancy is due to FX rate timing — Stripe updates its internal MRR rate
            independently and infrequently.
          </p>
          <p>
            If the gap exceeds ~$200 CAD MRR, recalibrate{' '}
            <code className="text-xs font-mono text-slate-300">STRIPE_DASHBOARD_FX_RATE</code>{' '}
            using the formula above.
          </p>
          <p>
            When using <strong className="text-slate-300">Live Market Rate</strong> mode the gap
            is expected and represents the difference between the ECB rate and Stripe&apos;s
            internal conversion — typically 1–3%.
          </p>
        </div>
      </section>
    </div>
  )
}
