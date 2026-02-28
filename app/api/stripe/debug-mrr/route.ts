import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { getUsdToCadRate } from '@/lib/fx'
import Stripe from 'stripe'

/**
 * Diagnostic: lists all active + past_due subscriptions and their computed MRR.
 * Flags subscriptions with $0 computed MRR (likely tiered/null unit_amount pricing).
 * Compare the totals to the Stripe "MRR per subscriber" CSV export to find discrepancies.
 *
 * GET /api/stripe/debug-mrr
 */
export async function GET() {
  const rate = await getUsdToCadRate()

  const rows: {
    name: string
    status: string
    currency: string
    mrrNative: number
    mrrCad: number
    billingScheme: string
    hasTieredItems: boolean
    nullUnitAmountItems: number
    totalItems: number
  }[] = []

  for await (const sub of stripe.subscriptions.list({
    status: 'all',
    limit: 100,
    expand: ['data.customer', 'data.items.data.price'],
  })) {
    if (!['active', 'past_due'].includes(sub.status)) continue

    const customer = sub.customer as Stripe.Customer
    const name = customer.name ?? customer.email ?? sub.customer as string

    let totalMrrNative = 0
    let nullUnitAmountItems = 0
    let hasTieredItems = false
    const billingSchemes: string[] = []

    for (const item of sub.items.data) {
      const price = item.price as Stripe.Price
      if (!price.recurring) continue

      const seats = item.quantity ?? 1
      const interval = price.recurring.interval
      const intervalCount = price.recurring.interval_count ?? 1
      const monthsInPeriod = interval === 'year' ? 12 * intervalCount : intervalCount

      let unitPriceCents = price.unit_amount ?? 0
      billingSchemes.push(price.billing_scheme ?? 'per_unit')

      if (!unitPriceCents && price.billing_scheme === 'tiered' && price.tiers && price.tiers.length > 0) {
        hasTieredItems = true
        if (price.tiers_mode === 'volume') {
          for (const tier of price.tiers) {
            if (tier.up_to === null || tier.up_to >= seats) {
              unitPriceCents = tier.unit_amount ?? 0
              break
            }
          }
        } else {
          let totalCents = 0
          let prevUpTo = 0
          let remaining = seats
          for (const tier of price.tiers) {
            const tierCapacity = tier.up_to === null ? remaining : (tier.up_to - prevUpTo)
            const tierUnits = Math.min(tierCapacity, remaining)
            totalCents += (tier.unit_amount ?? 0) * tierUnits
            if (tier.flat_amount) totalCents += tier.flat_amount
            remaining -= tierUnits
            prevUpTo = tier.up_to ?? seats
            if (remaining <= 0) break
          }
          unitPriceCents = seats > 0 ? Math.round(totalCents / seats) : 0
        }
      }

      if (price.unit_amount == null) nullUnitAmountItems++

      const mrrNative = ((unitPriceCents / 100) * seats) / monthsInPeriod
      totalMrrNative += mrrNative
    }

    const mrrCad = sub.currency === 'usd' ? totalMrrNative * rate : totalMrrNative

    rows.push({
      name,
      status: sub.status,
      currency: sub.currency.toUpperCase(),
      mrrNative: Math.round(totalMrrNative * 100) / 100,
      mrrCad: Math.round(mrrCad * 100) / 100,
      billingScheme: [...new Set(billingSchemes)].join(', '),
      hasTieredItems,
      nullUnitAmountItems,
      totalItems: sub.items.data.length,
    })
  }

  const zeroMrr = rows.filter(r => r.mrrNative === 0)
  const nonZero = rows.filter(r => r.mrrNative > 0)

  const totalCadNative = rows.filter(r => r.currency === 'CAD').reduce((s, r) => s + r.mrrNative, 0)
  const totalUsdNative = rows.filter(r => r.currency === 'USD').reduce((s, r) => s + r.mrrNative, 0)
  const totalMrrCad = rows.reduce((s, r) => s + r.mrrCad, 0)

  return NextResponse.json({
    fxRate: rate,
    summary: {
      activeAndPastDue: rows.length,
      withNonZeroMrr: nonZero.length,
      withZeroMrr: zeroMrr.length,
      tieredPricingSubs: rows.filter(r => r.hasTieredItems).length,
    },
    totals: {
      cadNative: Math.round(totalCadNative * 100) / 100,
      usdNative: Math.round(totalUsdNative * 100) / 100,
      totalMrrCad: Math.round(totalMrrCad * 100) / 100,
      stripeCsvCad: 14153.30,
      stripeCsvUsd: 8758.49,
      stripeCsvAtOurRate: Math.round((14153.30 + 8758.49 * rate) * 100) / 100,
      stripeOfficialMrr: 26177.72,
    },
    zeroMrrSubscriptions: zeroMrr.sort((a, b) => a.name.localeCompare(b.name)),
    nonZeroSubscriptions: nonZero.sort((a, b) => b.mrrCad - a.mrrCad),
  }, { status: 200 })
}
