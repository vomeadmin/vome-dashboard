/**
 * GET /api/stripe/debug-month?month=2025-03
 *
 * Diagnostic endpoint: shows exactly which subscriptions are counted in the ARR calculation
 * for a given month, with their individual contributions. Use this to find the root cause
 * of unexpected ARR spikes in the chart.
 */
import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const monthParam = searchParams.get('month') // e.g. "2025-03"

  if (!monthParam || !/^\d{4}-\d{2}$/.test(monthParam)) {
    return NextResponse.json({ error: 'Pass ?month=YYYY-MM' }, { status: 400 })
  }

  const [yearStr, monthStr] = monthParam.split('-')
  const year = parseInt(yearStr)
  const month = parseInt(monthStr) // 1-indexed

  // monthEndTs = first second of next month (exclusive upper bound)
  const nextMonth = new Date(year, month, 1) // month is 1-indexed so month = April if we want end of March
  const monthEndTs = Math.floor(nextMonth.getTime() / 1000)

  const FX_RATE = parseFloat(process.env.STRIPE_DASHBOARD_FX_RATE ?? '1.4046')

  const included: Array<{
    id: string
    customerId: string
    customerName: string
    status: string
    startDate: string
    endedAt: string | null
    items: Array<{
      priceId: string
      currency: string
      unitAmount: number
      quantity: number
      interval: string
      intervalCount: number
      monthsInPeriod: number
      mrrNative: number
      mrrCad: number
    }>
    totalMrrCad: number
    totalArrCad: number
    reason: string // why was this included?
  }> = []

  const excluded: Array<{
    id: string
    customerId: string
    status: string
    startDate: string
    endedAt: string | null
    reason: string
  }> = []

  for await (const sub of stripe.subscriptions.list({
    status: 'all',
    limit: 100,
    expand: ['data.customer', 'data.items.data.price'],
  })) {
    const customer = sub.customer as Stripe.Customer
    const customerName = customer?.name ?? customer?.email ?? sub.customer as string

    if (['incomplete', 'incomplete_expired'].includes(sub.status)) {
      excluded.push({
        id: sub.id,
        customerId: typeof sub.customer === 'string' ? sub.customer : customer?.id,
        status: sub.status,
        startDate: new Date(sub.start_date * 1000).toISOString().slice(0, 10),
        endedAt: sub.ended_at ? new Date(sub.ended_at * 1000).toISOString().slice(0, 10) : null,
        reason: `status=${sub.status}`,
      })
      continue
    }

    if (sub.start_date >= monthEndTs) {
      excluded.push({
        id: sub.id,
        customerId: typeof sub.customer === 'string' ? sub.customer : customer?.id,
        status: sub.status,
        startDate: new Date(sub.start_date * 1000).toISOString().slice(0, 10),
        endedAt: sub.ended_at ? new Date(sub.ended_at * 1000).toISOString().slice(0, 10) : null,
        reason: `start_date (${new Date(sub.start_date * 1000).toISOString().slice(0, 10)}) >= month end`,
      })
      continue
    }

    if (sub.ended_at && sub.ended_at < monthEndTs) {
      excluded.push({
        id: sub.id,
        customerId: typeof sub.customer === 'string' ? sub.customer : customer?.id,
        status: sub.status,
        startDate: new Date(sub.start_date * 1000).toISOString().slice(0, 10),
        endedAt: new Date(sub.ended_at * 1000).toISOString().slice(0, 10),
        reason: `ended_at (${new Date(sub.ended_at * 1000).toISOString().slice(0, 10)}) < month end`,
      })
      continue
    }

    // This subscription is included — compute its contribution
    const itemDetails = []
    let totalMrrCad = 0

    for (const item of sub.items.data) {
      const price = item.price as Stripe.Price
      const unitAmount = price.unit_amount ?? 0
      const seats = item.quantity ?? 1
      const interval = price.recurring?.interval ?? 'month'
      const intervalCount = price.recurring?.interval_count ?? 1
      const monthsInPeriod = interval === 'year' ? 12 * intervalCount : intervalCount
      const mrrNative = unitAmount > 0 ? ((unitAmount / 100) * seats) / monthsInPeriod : 0
      const currency = (price.currency ?? sub.currency).toLowerCase()
      const mrrCad = currency === 'usd' ? mrrNative * FX_RATE : mrrNative
      totalMrrCad += mrrCad

      itemDetails.push({
        priceId: typeof price === 'string' ? price : price.id,
        currency: price.currency ?? sub.currency,
        unitAmount: (unitAmount / 100),
        quantity: seats,
        interval,
        intervalCount,
        monthsInPeriod,
        mrrNative: Math.round(mrrNative * 100) / 100,
        mrrCad: Math.round(mrrCad * 100) / 100,
      })
    }

    included.push({
      id: sub.id,
      customerId: typeof sub.customer === 'string' ? sub.customer : customer?.id,
      customerName,
      status: sub.status,
      startDate: new Date(sub.start_date * 1000).toISOString().slice(0, 10),
      endedAt: sub.ended_at ? new Date(sub.ended_at * 1000).toISOString().slice(0, 10) : null,
      items: itemDetails,
      totalMrrCad: Math.round(totalMrrCad * 100) / 100,
      totalArrCad: Math.round(totalMrrCad * 12 * 100) / 100,
      reason: sub.ended_at
        ? `active at ${monthParam}: started ${new Date(sub.start_date * 1000).toISOString().slice(0, 10)}, ended ${new Date(sub.ended_at * 1000).toISOString().slice(0, 10)}`
        : `currently ${sub.status}, started ${new Date(sub.start_date * 1000).toISOString().slice(0, 10)}`,
    })
  }

  // Sort included by ARR descending to surface biggest contributors first
  included.sort((a, b) => b.totalArrCad - a.totalArrCad)

  const totalMrrCad = included.reduce((s, r) => s + r.totalMrrCad, 0)

  return NextResponse.json({
    month: monthParam,
    monthEndDate: nextMonth.toISOString().slice(0, 10),
    fxRateUsed: FX_RATE,
    totalMrrCad: Math.round(totalMrrCad * 100) / 100,
    totalArrCad: Math.round(totalMrrCad * 12 * 100) / 100,
    includedCount: included.length,
    excludedCount: excluded.length,
    included,
    excluded_sample: excluded.slice(0, 20), // first 20 to keep response manageable
  })
}
