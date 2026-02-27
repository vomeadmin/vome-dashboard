import Stripe from 'stripe'
import { stripe } from './stripe'
import { getUsdToCadRate } from './fx'
import { getPlanFromProduct, type PlanTier, PLAN_ORDER } from './plan-config'

export interface SubscriptionData {
  id: string
  customerId: string
  customerName: string
  customerEmail: string
  status: string
  plan: PlanTier
  seats: number
  unitPriceCents: number
  interval: 'month' | 'year'
  intervalCount: number  // e.g. 3 for a 3-year subscription
  currency: string
  currentPeriodEnd: Date
  arrCad: number
  mrrCad: number
  // Original native currency values (before FX conversion)
  arrNative: number
  nativeCurrency: string
}

export interface PlanSummary {
  count: number
  arr: number
  mrr: number
  seats: number
}

export interface KpiData {
  mrr: number
  arr: number
  activeSubscriptions: number
  trialingSubscriptions: number  // included in MRR, like Stripe
  pastDueSubscriptions: number   // included in MRR, like Stripe
  avgArrPerCustomer: number
  totalSeats: number
  byPlan: Record<PlanTier, PlanSummary>
  fxRate: number
  fetchedAt: string
  // Native currency breakdown (for transparency on FX impact)
  mrrCadNative: number  // CAD subscriptions MRR — not subject to FX variance
  mrrUsdNative: number  // USD subscriptions MRR in USD — multiply by fxRate to get CAD
}

export interface CustomerData {
  customerId: string
  customerName: string
  customerEmail: string
  plan: PlanTier
  seats: number
  arrCad: number
  mrrCad: number
  currency: string
  renewalDate: Date
  subscriptionId: string
}

/**
 * Fetches active, trialing, and past_due subscriptions with customer and product details expanded.
 * Matches Stripe's own MRR methodology: Stripe includes all three statuses in their MRR figure.
 * Accepts an optional fxRate; if omitted, fetches the live ECB rate.
 */
export async function getActiveSubscriptions(fxRate?: number): Promise<SubscriptionData[]> {
  const rate = fxRate ?? await getUsdToCadRate()
  const results: SubscriptionData[] = []

  for await (const sub of stripe.subscriptions.list({
    status: 'all',
    limit: 100,
    // Max expand depth is 4 levels. data.items.data.price.product would be 5 — not allowed.
    // We expand to price only; product comes back as a string ID, which is enough for PLAN_MAP lookup.
    expand: ['data.customer', 'data.items.data.price'],
  })) {
    // Match Stripe's MRR: include active, trialing, and past_due; skip everything else
    if (!['active', 'trialing', 'past_due'].includes(sub.status)) continue

    const customer = sub.customer as Stripe.Customer
    if (!sub.items.data.length) continue

    const currency = sub.currency

    // Aggregate ARR/seats across ALL line items in the subscription.
    // Some subscriptions have multiple items (e.g. base plan + extra seat add-ons billed separately).
    let totalArrNative = 0
    let totalSeats = 0
    let primaryPlan: PlanTier = 'Free'
    let primaryItem = sub.items.data[0]

    for (const item of sub.items.data) {
      const price = item.price
      const productId = typeof price.product === 'string' ? price.product : (price.product as Stripe.Product)?.id ?? null
      const seats = item.quantity ?? 1
      const unitPriceCents = price.unit_amount ?? 0
      const interval = (price.recurring?.interval ?? 'month') as 'month' | 'year'
      const intervalCount = price.recurring?.interval_count ?? 1

      // Normalize to annual value in native currency.
      // monthsInPeriod handles all billing cadences:
      //   monthly (interval=month, count=1)  → 1 month/period  → ×12
      //   quarterly (interval=month, count=3) → 3 months/period → ×4
      //   annual (interval=year, count=1)    → 12 months/period → ×1
      //   biennial (interval=year, count=2)  → 24 months/period → ×0.5
      const monthsInPeriod = interval === 'year' ? 12 * intervalCount : intervalCount
      const annualValueNative = (unitPriceCents / 100) * seats * (12 / monthsInPeriod)

      totalArrNative += annualValueNative
      // Only count seats for paid line items — $0 add-ons (e.g. free seat grants) are excluded
      if (unitPriceCents > 0) totalSeats += seats

      // Use the highest-tier plan found across all items
      const itemPlan = getPlanFromProduct(productId, null)
      if (PLAN_ORDER.indexOf(itemPlan) < PLAN_ORDER.indexOf(primaryPlan)) {
        primaryPlan = itemPlan
        primaryItem = item
      }
    }

    // Use the primary item's price metadata for display fields (interval, unitPrice)
    const primaryPrice = primaryItem.price
    const primaryInterval = (primaryPrice.recurring?.interval ?? 'month') as 'month' | 'year'
    const primaryIntervalCount = primaryPrice.recurring?.interval_count ?? 1
    const primaryUnitCents = primaryPrice.unit_amount ?? 0

    const arrCad = currency === 'usd' ? totalArrNative * rate : totalArrNative

    results.push({
      id: sub.id,
      customerId: typeof sub.customer === 'string' ? sub.customer : customer.id,
      customerName: customer.name ?? customer.email ?? 'Unknown',
      customerEmail: customer.email ?? '',
      status: sub.status,
      plan: primaryPlan,
      seats: totalSeats,
      unitPriceCents: primaryUnitCents,
      interval: primaryInterval,
      intervalCount: primaryIntervalCount,
      currency,
      // In Stripe SDK v20+, current_period_end moved from Subscription to SubscriptionItem
      currentPeriodEnd: new Date((primaryItem.current_period_end ?? sub.billing_cycle_anchor) * 1000),
      arrCad,
      mrrCad: arrCad / 12,
      arrNative: totalArrNative,
      nativeCurrency: currency.toUpperCase(),
    })
  }

  return results
}

/**
 * Computes KPI snapshot from all active subscriptions.
 * Accepts an optional fxRate; if omitted, fetches the live ECB rate.
 */
export async function getKpis(fxRate?: number): Promise<KpiData> {
  const rate = fxRate ?? await getUsdToCadRate()
  const subs = await getActiveSubscriptions(rate)

  const mrr = subs.reduce((sum, s) => sum + s.mrrCad, 0)
  const arr = mrr * 12
  const totalSeats = subs.reduce((sum, s) => sum + s.seats, 0)

  // Split by native currency for FX transparency
  const mrrCadNative = subs.filter(s => s.currency === 'cad').reduce((sum, s) => sum + s.mrrCad, 0)
  const mrrUsdNative = subs.filter(s => s.currency === 'usd').reduce((sum, s) => sum + s.arrNative / 12, 0)

  const byPlan = {} as Record<PlanTier, PlanSummary>
  for (const tier of PLAN_ORDER) {
    byPlan[tier] = { count: 0, arr: 0, mrr: 0, seats: 0 }
  }

  for (const sub of subs) {
    byPlan[sub.plan].count++
    byPlan[sub.plan].arr += sub.arrCad
    byPlan[sub.plan].mrr += sub.mrrCad
    byPlan[sub.plan].seats += sub.seats
  }

  const activeSubscriptions = subs.filter(s => s.status === 'active').length
  const trialingSubscriptions = subs.filter(s => s.status === 'trialing').length
  const pastDueSubscriptions = subs.filter(s => s.status === 'past_due').length

  return {
    mrr,
    arr,
    activeSubscriptions,
    trialingSubscriptions,
    pastDueSubscriptions,
    avgArrPerCustomer: activeSubscriptions > 0 ? arr / activeSubscriptions : 0,
    totalSeats,
    byPlan,
    fxRate: rate,
    fetchedAt: new Date().toISOString(),
    mrrCadNative,
    mrrUsdNative,
  }
}

/**
 * Returns top customers ranked by ARR contribution.
 */
export async function getTopCustomers(limit = 25, fxRate?: number): Promise<CustomerData[]> {
  const subs = await getActiveSubscriptions(fxRate)

  // Aggregate by customer (a customer could have multiple subscriptions)
  const customerMap = new Map<string, CustomerData>()

  for (const sub of subs) {
    if (customerMap.has(sub.customerId)) {
      const existing = customerMap.get(sub.customerId)!
      existing.arrCad += sub.arrCad
      existing.mrrCad += sub.mrrCad
      existing.seats += sub.seats
      // Use highest-tier plan for display
      const existing_order = PLAN_ORDER.indexOf(existing.plan)
      const new_order = PLAN_ORDER.indexOf(sub.plan)
      if (new_order < existing_order) existing.plan = sub.plan
    } else {
      customerMap.set(sub.customerId, {
        customerId: sub.customerId,
        customerName: sub.customerName,
        customerEmail: sub.customerEmail,
        plan: sub.plan,
        seats: sub.seats,
        arrCad: sub.arrCad,
        mrrCad: sub.mrrCad,
        currency: sub.currency,
        renewalDate: sub.currentPeriodEnd,
        subscriptionId: sub.id,
      })
    }
  }

  return Array.from(customerMap.values())
    .sort((a, b) => b.arrCad - a.arrCad)
    .slice(0, limit)
}

/**
 * Returns subscriptions with renewals in the next N days.
 */
export async function getUpcomingRenewals(days = 90, fxRate?: number): Promise<SubscriptionData[]> {
  const subs = await getActiveSubscriptions(fxRate)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() + days)

  return subs
    .filter((s) => s.currentPeriodEnd <= cutoff)
    .sort((a, b) => a.currentPeriodEnd.getTime() - b.currentPeriodEnd.getTime())
}

/**
 * Returns monthly revenue collected (from paid invoices) for the past N months.
 * Note: This shows cash collected, not normalized MRR.
 * Annual invoices appear in the month they were collected.
 */
export async function getMonthlyRevenueTrend(months = 12, fxRate?: number): Promise<
  Array<{ monthKey: string; month: string; revenue: number }>
> {
  const rate = fxRate ?? await getUsdToCadRate()
  const now = new Date()
  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1)

  const monthMap = new Map<string, number>()

  // Pre-fill all months with 0
  for (let i = 0; i < months; i++) {
    const d = new Date(startDate)
    d.setMonth(d.getMonth() + i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthMap.set(key, 0)
  }

  for await (const invoice of stripe.invoices.list({
    created: { gte: Math.floor(startDate.getTime() / 1000) },
    status: 'paid',
    limit: 100,
  })) {
    if (!invoice.created) continue
    const d = new Date(invoice.created * 1000)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!monthMap.has(key)) continue

    const amountCad =
      invoice.currency === 'usd'
        ? (invoice.amount_paid / 100) * rate
        : invoice.amount_paid / 100

    monthMap.set(key, (monthMap.get(key) ?? 0) + amountCad)
  }

  return Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, revenue]) => {
      const [year, month] = key.split('-')
      const d = new Date(parseInt(year), parseInt(month) - 1, 1)
      return {
        monthKey: key,
        month: d.toLocaleDateString('en-CA', { month: 'short', year: 'numeric' }),
        revenue,
      }
    })
}

/**
 * Returns monthly MRR snapshots for the past N months by reconstructing which subscriptions
 * were active at each month-end. Matches Stripe's ARR report methodology exactly:
 * subscription-based point-in-time snapshot, not invoice cash-flow spreading.
 *
 * A subscription counts for a given month if:
 *   start_date < first-second-of-next-month  AND
 *   (ended_at is null OR ended_at >= first-second-of-next-month)
 *
 * Uses current subscription prices as a proxy for historical prices. Minor drift occurs only for
 * subscriptions that changed plan mid-period; overall accuracy closely tracks Stripe's dashboard.
 */
export async function getNormalizedMrrByMonth(months = 24, fxRate?: number): Promise<
  Array<{ monthKey: string; month: string; mrr: number }>
> {
  const rate = fxRate ?? await getUsdToCadRate()
  const now = new Date()

  // Build month buckets. monthEndTs = first second of NEXT month (exclusive upper bound).
  // Using an exclusive bound means ended_at == monthEndTs is treated as "still active that month",
  // which matches how Stripe records billing-period-end cancellations.
  const buckets: Array<{ key: string; monthEndTs: number; label: string }> = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    const monthEndTs = Math.floor(nextMonth.getTime() / 1000)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en-CA', { month: 'short', year: '2-digit' })
    buckets.push({ key, monthEndTs, label })
  }

  // Fetch all subscriptions (active + cancelled). Same expand as getActiveSubscriptions.
  // Skip incomplete/incomplete_expired — those never billed and have no revenue.
  const allSubs: Stripe.Subscription[] = []
  for await (const sub of stripe.subscriptions.list({
    status: 'all',
    limit: 100,
    expand: ['data.items.data.price'],
  })) {
    if (['incomplete', 'incomplete_expired'].includes(sub.status)) continue
    allSubs.push(sub)
  }

  // For each month bucket, sum MRR from subscriptions active at that month-end snapshot.
  return buckets.map(({ key, monthEndTs, label }) => {
    let totalMrr = 0
    for (const sub of allSubs) {
      if (sub.start_date >= monthEndTs) continue          // subscription hadn't started yet
      if (sub.ended_at && sub.ended_at < monthEndTs) continue  // subscription had already ended

      for (const item of sub.items.data) {
        const price = item.price as Stripe.Price
        // Skip non-recurring items (one-time charges attached to subscription)
        // Without this guard, price.recurring?.interval defaults to 'month' and
        // a $10K annual charge would be treated as $10K/month MRR (12× inflation).
        if (!price.recurring) continue
        const unitAmount = price.unit_amount ?? 0
        if (unitAmount <= 0) continue  // skip $0 add-ons, matches getKpis behaviour
        const seats = item.quantity ?? 1
        const interval = price.recurring.interval
        const intervalCount = price.recurring.interval_count ?? 1
        const monthsInPeriod = interval === 'year' ? 12 * intervalCount : intervalCount
        const mrrNative = ((unitAmount / 100) * seats) / monthsInPeriod
        const currency = (price.currency ?? sub.currency).toLowerCase()
        const mrrCad = currency === 'usd' ? mrrNative * rate : mrrNative
        totalMrr += mrrCad
      }
    }
    return { monthKey: key, month: label, mrr: totalMrr }
  })
}

/**
 * Detects paid → Free/Recruit downgrades using Stripe subscription update events.
 */
export async function getChurnedDowngrades(
  sinceDate: Date,
  fxRate?: number
): Promise<Array<{ customerName: string; fromPlan: PlanTier; date: Date; arrLostCad: number }>> {
  const rate = fxRate ?? await getUsdToCadRate()
  const results: Array<{ customerName: string; fromPlan: PlanTier; date: Date; arrLostCad: number }> = []

  for await (const event of stripe.events.list({
    type: 'customer.subscription.updated',
    created: { gte: Math.floor(sinceDate.getTime() / 1000) },
    limit: 100,
  })) {
    const newSub = event.data.object as Stripe.Subscription
    const prevSub = event.data.previous_attributes as Partial<Stripe.Subscription>

    if (!prevSub?.items) continue

    const prevItem = (prevSub.items as Stripe.ApiList<Stripe.SubscriptionItem>)?.data?.[0]
    const newItem = newSub.items.data[0]

    if (!prevItem || !newItem) continue

    const prevPrice = prevItem.price as Stripe.Price
    const newPrice = newItem.price as Stripe.Price

    const prevProduct = prevPrice?.product
    const newProduct = newPrice?.product

    const prevPlan = getPlanFromProduct(
      typeof prevProduct === 'string' ? prevProduct : (prevProduct as Stripe.Product)?.id ?? null,
      typeof prevProduct === 'object' ? (prevProduct as Stripe.Product)?.name : null
    )
    const newPlan = getPlanFromProduct(
      typeof newProduct === 'string' ? newProduct : (newProduct as Stripe.Product)?.id ?? null,
      typeof newProduct === 'object' ? (newProduct as Stripe.Product)?.name : null
    )

    const wasPaid = prevPlan !== 'Free'
    const isNowFree = newPlan === 'Free'

    if (wasPaid && isNowFree) {
      const customer = await stripe.customers.retrieve(newSub.customer as string)
      const prevSeats = prevItem.quantity ?? 1
      const prevUnitCents = prevPrice?.unit_amount ?? 0
      const prevInterval = (prevPrice?.recurring?.interval ?? 'month') as 'month' | 'year'
      const prevIntervalCount = prevPrice?.recurring?.interval_count ?? 1
      const prevAnnualNative =
        prevInterval === 'year'
          ? (prevUnitCents / 100) * prevSeats / prevIntervalCount
          : (prevUnitCents / 100) * prevSeats * 12
      const arrLostCad =
        newSub.currency === 'usd' ? prevAnnualNative * rate : prevAnnualNative

      results.push({
        customerName:
          (customer as Stripe.Customer).name ??
          (customer as Stripe.Customer).email ??
          newSub.customer as string,
        fromPlan: prevPlan,
        date: new Date(event.created * 1000),
        arrLostCad,
      })
    }
  }

  return results
}
