/**
 * GET /api/stripe/debug
 *
 * Returns a raw breakdown of every active subscription so you can compare
 * individual line items against the Stripe dashboard.
 *
 * Fields returned per subscription:
 *   id, customer, status, currency,
 *   items[]  → productId, seats, unitPriceCents, interval, intervalCount,
 *               monthsInPeriod, annualValueNative
 *   totalArrNative, arrCad (at current live FX), plan
 *
 * Also returns summary totals that should match getKpis().
 */

import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { getUsdToCadRate } from '@/lib/fx'
import { getPlanFromProduct, PLAN_ORDER } from '@/lib/plan-config'
import type { PlanTier } from '@/lib/plan-config'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rate = await getUsdToCadRate()
    const rows: object[] = []
    let totalArrCad = 0
    let totalSubCount = 0

    for await (const sub of stripe.subscriptions.list({
      status: 'active',
      limit: 100,
      expand: ['data.customer', 'data.items.data.price'],
    })) {
      const customer = sub.customer as Stripe.Customer
      if (!sub.items.data.length) continue

      const currency = sub.currency
      let subArrNative = 0
      let subSeats = 0
      let primaryPlan: PlanTier = 'Free'
      const itemRows: object[] = []

      for (const item of sub.items.data) {
        const price = item.price
        const productId =
          typeof price.product === 'string'
            ? price.product
            : (price.product as Stripe.Product)?.id ?? null
        const seats = item.quantity ?? 1
        const unitPriceCents = price.unit_amount ?? 0
        const interval = (price.recurring?.interval ?? 'month') as 'month' | 'year'
        const intervalCount = price.recurring?.interval_count ?? 1
        const monthsInPeriod = interval === 'year' ? 12 * intervalCount : intervalCount
        const annualValueNative = (unitPriceCents / 100) * seats * (12 / monthsInPeriod)

        subArrNative += annualValueNative
        subSeats += seats

        const itemPlan = getPlanFromProduct(productId, null)
        if (PLAN_ORDER.indexOf(itemPlan) < PLAN_ORDER.indexOf(primaryPlan)) {
          primaryPlan = itemPlan
        }

        itemRows.push({
          productId,
          seats,
          unitPriceCents,
          unitPriceDollars: unitPriceCents / 100,
          interval,
          intervalCount,
          monthsInPeriod,
          annualValueNative: Math.round(annualValueNative * 100) / 100,
          plan: itemPlan,
        })
      }

      const arrCad = currency === 'usd' ? subArrNative * rate : subArrNative
      totalArrCad += arrCad
      totalSubCount++

      rows.push({
        subscriptionId: sub.id,
        customerId: typeof sub.customer === 'string' ? sub.customer : customer.id,
        customerName: customer.name ?? customer.email ?? 'Unknown',
        currency,
        plan: primaryPlan,
        totalSeats: subSeats,
        totalArrNative: Math.round(subArrNative * 100) / 100,
        arrCad: Math.round(arrCad * 100) / 100,
        mrrCad: Math.round((arrCad / 12) * 100) / 100,
        items: itemRows,
        itemCount: itemRows.length,
      })
    }

    return NextResponse.json({
      summary: {
        fxRateUsed: rate,
        activeSubscriptions: totalSubCount,
        totalArrCad: Math.round(totalArrCad * 100) / 100,
        totalMrrCad: Math.round((totalArrCad / 12) * 100) / 100,
      },
      subscriptions: rows,
    })
  } catch (error) {
    console.error('[/api/stripe/debug]', error)
    return NextResponse.json({ error: 'Failed to fetch debug data' }, { status: 500 })
  }
}
