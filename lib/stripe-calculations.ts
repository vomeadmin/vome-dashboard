import Stripe from 'stripe'
import { stripe } from './stripe'
import { getUsdToCadRate } from './fx'
import { getPlanFromProduct, type PlanTier, PLAN_ORDER } from './plan-config'
import { INTERNAL_CUSTOMER_IDS } from './internal-accounts'

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
  trialingSubscriptions: number  // NOT in MRR — shown as pipeline note
  pastDueSubscriptions: number   // INCLUDED in MRR — offline payments accepted
  trialingMrr: number  // MRR from trialing subs — already included in mrr total (Stripe methodology)
  trialingArr: number  // ARR from trialing subs — already included in arr total (Stripe methodology)
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

// ---------------------------------------------------------------------------
// Module-level TTL cache — prevents redundant Stripe API calls when multiple
// functions (getKpis, getTopCustomers, getUpcomingRenewals) run in parallel
// on the same page load. Serverless instances may be reused, so we keep
// financial data fresh with a short 60-second TTL.
// ---------------------------------------------------------------------------
interface SubsCache {
  data: SubscriptionData[]
  fxRate: number
  ts: number
}
let _subsCache: SubsCache | null = null
const SUBS_CACHE_TTL_MS = 60_000

/**
 * Resolves the annual value (in native currency cents) for a single subscription item.
 *
 * Three fixes vs naive approach:
 * 1. unit_amount_decimal fallback — some custom prices have non-integer amounts (e.g. Sport Yukon
 *    at $952.381/seat/yr). Stripe stores these in unit_amount_decimal; unit_amount is null.
 * 2. Tiered pricing tiers — Stripe does NOT include the tiers[] array when a Price is embedded
 *    in a subscription list expansion. We fetch them separately (see fetchByStatus) and pass
 *    them in via the tieredPrices cache.
 * 3. Volume tier flat_amount — a volume tier can have both a unit_amount (per seat) AND a
 *    flat_amount (once per billing period). Both must be included in the charge calculation.
 */
function resolveItemAnnualCents(
  price: Stripe.Price,
  seats: number,
  monthsInPeriod: number,
  tieredPrices: Map<string, Stripe.Price>
): number {
  const billing = price.billing_scheme

  // Resolve tiers: use the cached version if available (it has tiers data; the embedded one doesn't)
  const resolvedPrice = tieredPrices.get(price.id) ?? price
  const tiers = resolvedPrice.tiers

  if (billing === 'tiered' && tiers && tiers.length > 0) {
    let periodChargeCents = 0

    if (resolvedPrice.tiers_mode === 'volume') {
      // Volume: all units priced at the tier the total quantity falls into.
      // The tier also has an optional flat_amount charged once per period.
      for (const tier of tiers) {
        if (tier.up_to === null || tier.up_to >= seats) {
          periodChargeCents = (tier.unit_amount ?? 0) * seats + (tier.flat_amount ?? 0)
          break
        }
      }
    } else {
      // Graduated: units priced at different rates as they cross tier boundaries.
      // flat_amount applies each time a tier boundary is crossed.
      let prevUpTo = 0
      let remaining = seats
      for (const tier of tiers) {
        const tierCapacity = tier.up_to === null ? remaining : (tier.up_to - prevUpTo)
        const tierUnits = Math.min(tierCapacity, remaining)
        periodChargeCents += (tier.unit_amount ?? 0) * tierUnits + (tier.flat_amount ?? 0)
        remaining -= tierUnits
        prevUpTo = tier.up_to ?? seats
        if (remaining <= 0) break
      }
    }

    // periodChargeCents is per billing period → normalize to annual
    return periodChargeCents * (12 / monthsInPeriod)
  }

  // Per-unit pricing. unit_amount is the integer version; unit_amount_decimal holds decimal
  // precision for non-round amounts (e.g. $952.381/yr). Use whichever is available.
  const unitCents =
    price.unit_amount ??
    (price.unit_amount_decimal ? Math.round(parseFloat(price.unit_amount_decimal)) : 0)

  return unitCents * seats * (12 / monthsInPeriod)
}

/**
 * Processes a single raw Stripe subscription into a SubscriptionData record.
 * Returns null if the subscription has no line items.
 * tieredPrices: pre-fetched Price objects (with tiers expanded)
 * coupons: pre-fetched Coupon objects for any discount coupons on this subscription
 */
function processSubscription(
  sub: Stripe.Subscription,
  rate: number,
  tieredPrices: Map<string, Stripe.Price>,
  coupons: Map<string, Stripe.Coupon>
): SubscriptionData | null {
  const customer = sub.customer as Stripe.Customer
  if (!sub.items.data.length) return null

  const currency = sub.currency
  let totalArrNative = 0
  let totalSeats = 0
  let primaryPlan: PlanTier = 'Free'
  let primaryItem = sub.items.data[0]

  for (const item of sub.items.data) {
    const price = item.price
    const productId = typeof price.product === 'string' ? price.product : (price.product as Stripe.Product)?.id ?? null
    const seats = item.quantity ?? 1
    const interval = (price.recurring?.interval ?? 'month') as 'month' | 'year'
    const intervalCount = price.recurring?.interval_count ?? 1

    // monthsInPeriod handles all billing cadences:
    //   monthly (interval=month, count=1)  → 1 month/period  → ×12
    //   quarterly (interval=month, count=3) → 3 months/period → ×4
    //   annual (interval=year, count=1)    → 12 months/period → ×1
    //   3-year (interval=year, count=3)    → 36 months/period → ×(12/36)
    const monthsInPeriod = interval === 'year' ? 12 * intervalCount : intervalCount

    const itemAnnualCents = resolveItemAnnualCents(price, seats, monthsInPeriod, tieredPrices)
    const itemArrNative = itemAnnualCents / 100

    totalArrNative += itemArrNative
    // Only count seats for paid line items — $0 add-ons (e.g. free seat grants) are excluded
    if (itemAnnualCents > 0) totalSeats += seats

    // Use the highest-tier plan found across all items
    const itemPlan = getPlanFromProduct(productId, null)
    if (PLAN_ORDER.indexOf(itemPlan) < PLAN_ORDER.indexOf(primaryPlan)) {
      primaryPlan = itemPlan
      primaryItem = item
    }
  }

  // Apply discount coupons to match Stripe's MRR CSV methodology:
  //
  // Rule 1 — PERMANENT ONLY: Stripe includes only forever/permanent coupons in MRR.
  //   Time-limited promotions (discount.end !== null) affect invoice amounts but Stripe
  //   treats the undiscounted subscription price as the committed MRR value.
  //
  // Rule 2 — CUSTOMER-LEVEL fallback: some permanent coupons live on customer.discount
  //   rather than sub.discounts (Stripe doesn't always propagate them to the sub object).
  //   We check both sources and deduplicate by coupon ID.
  //
  // - percent_off: scales the whole ARR (e.g. 50% off → arr * 0.5)
  // - amount_off: per-billing-period discount in smallest currency unit, annualized.
  //   We apply the FIRST valid permanent coupon found.
  const discounts = sub.discounts as Stripe.Discount[] | undefined

  // Collect candidate discount sources: sub.discounts first, then customer.discount
  type DiscountSource = { couponId: string; end: number | null }
  const discountSources: DiscountSource[] = []
  const seenCouponIds = new Set<string>()

  if (discounts?.length) {
    for (const d of discounts) {
      const src = (d as { source?: { type?: string; coupon?: string } }).source
      const couponId = src?.type === 'coupon' ? src.coupon : undefined
      if (couponId && !seenCouponIds.has(couponId)) {
        seenCouponIds.add(couponId)
        discountSources.push({ couponId, end: (d as { end?: number | null }).end ?? null })
      }
    }
  }
  // customer.discount: permanent coupons not always propagated to sub.discounts
  const custDiscount = (sub.customer as Stripe.Customer)?.discount as (Stripe.Discount & { source?: { type?: string; coupon?: string } }) | null
  if (custDiscount?.source?.type === 'coupon' && custDiscount.source.coupon) {
    const couponId = custDiscount.source.coupon
    if (!seenCouponIds.has(couponId)) {
      seenCouponIds.add(couponId)
      discountSources.push({ couponId, end: custDiscount.end ?? null })
    }
  }

  // Apply the first permanent (end === null) valid coupon found
  for (const { couponId, end } of discountSources) {
    if (end !== null) continue  // skip time-limited promotions — Stripe excludes these from MRR
    const coupon = coupons.get(couponId)
    if (!coupon || coupon.valid === false) continue
    if (coupon.percent_off != null) {
      totalArrNative *= (1 - coupon.percent_off / 100)
    } else if (coupon.amount_off != null) {
      // amount_off is in smallest currency unit, applied once per billing period.
      // We use the primary item's interval to annualize it.
      const primaryInterval2 = (primaryItem.price.recurring?.interval ?? 'month') as 'month' | 'year'
      const primaryIntervalCount2 = primaryItem.price.recurring?.interval_count ?? 1
      const primaryMonthsInPeriod = primaryInterval2 === 'year' ? 12 * primaryIntervalCount2 : primaryIntervalCount2
      const annualDiscountNative = (coupon.amount_off / 100) * (12 / primaryMonthsInPeriod)
      totalArrNative = Math.max(0, totalArrNative - annualDiscountNative)
    }
    break  // only apply one coupon per subscription
  }

  const primaryPrice = primaryItem.price
  const primaryInterval = (primaryPrice.recurring?.interval ?? 'month') as 'month' | 'year'
  const primaryIntervalCount = primaryPrice.recurring?.interval_count ?? 1
  const primaryUnitCents = primaryPrice.unit_amount ?? 0
  const arrCad = currency === 'usd' ? totalArrNative * rate : totalArrNative

  return {
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
  }
}

/**
 * Fetches one specific subscription status and processes all results.
 * Handles three Stripe API quirks:
 * - tiers[] is not included in the price embedded in subscription expansions → fetched separately
 * - unit_amount_decimal (used for non-integer prices) handled in resolveItemAnnualCents
 * - discount coupons (percent_off / amount_off) must be fetched separately and applied to ARR
 */
async function fetchByStatus(
  status: 'active' | 'trialing' | 'past_due',
  rate: number
): Promise<SubscriptionData[]> {
  // Step 1: collect all raw subscriptions for this status, including discount info
  const rawSubs: Stripe.Subscription[] = []
  for await (const sub of stripe.subscriptions.list({
    status,
    limit: 100,
    expand: ['data.customer', 'data.items.data.price', 'data.discounts'],
  })) {
    rawSubs.push(sub)
  }

  // Step 2: collect IDs that need separate fetches:
  //   a) tiered price IDs (Stripe omits tiers[] from embedded prices)
  //   b) coupon IDs from sub.discounts AND from customer.discount (customer-level permanent discounts)
  const tieredPriceIds = new Set<string>()
  const couponIds = new Set<string>()
  for (const sub of rawSubs) {
    for (const item of sub.items.data) {
      if (item.price.billing_scheme === 'tiered' && !item.price.tiers?.length) {
        tieredPriceIds.add(item.price.id)
      }
    }
    // Coupon IDs from subscription-level discounts
    const discounts = sub.discounts as Stripe.Discount[] | undefined
    if (discounts) {
      for (const d of discounts) {
        const src = (d as { source?: { type?: string; coupon?: string } }).source
        if (src?.type === 'coupon' && src.coupon) couponIds.add(src.coupon)
      }
    }
    // Coupon IDs from customer-level discount (lives on customer object, not always in sub.discounts)
    const customer = sub.customer as Stripe.Customer
    const custDiscount = customer?.discount as (Stripe.Discount & { source?: { type?: string; coupon?: string } }) | null
    if (custDiscount?.source?.type === 'coupon' && custDiscount.source.coupon) {
      couponIds.add(custDiscount.source.coupon)
    }
  }

  // Step 3: parallel fetch of tiered prices + coupons
  const tieredPrices = new Map<string, Stripe.Price>()
  const coupons = new Map<string, Stripe.Coupon>()
  await Promise.all([
    ...Array.from(tieredPriceIds).map(async (priceId) => {
      const price = await stripe.prices.retrieve(priceId, { expand: ['tiers'] })
      tieredPrices.set(priceId, price)
    }),
    ...Array.from(couponIds).map(async (couponId) => {
      const coupon = await stripe.coupons.retrieve(couponId)
      coupons.set(couponId, coupon)
    }),
  ])

  // Step 4: process subscriptions with full pricing + discount data.
  // Skip internal/demo accounts — they appear in Stripe but are excluded from Stripe's own MRR CSV.
  const results: SubscriptionData[] = []
  for (const sub of rawSubs) {
    const customerId = typeof sub.customer === 'string' ? sub.customer : (sub.customer as Stripe.Customer).id
    if (INTERNAL_CUSTOMER_IDS.has(customerId)) continue
    const record = processSubscription(sub, rate, tieredPrices, coupons)
    if (record) results.push(record)
  }
  return results
}

/**
 * Fetches active, trialing, and past_due subscriptions with customer and product details expanded.
 * Matches Stripe's own MRR methodology: Stripe includes all three statuses in their MRR figure.
 *
 * Performance notes:
 * - Fetches 3 statuses in parallel instead of status:'all' — skips thousands of cancelled subs
 * - Results are cached for 60 s to prevent redundant calls when multiple functions run in parallel
 */
export async function getActiveSubscriptions(fxRate?: number): Promise<SubscriptionData[]> {
  const rate = fxRate ?? await getUsdToCadRate()

  if (_subsCache && Date.now() - _subsCache.ts < SUBS_CACHE_TTL_MS && _subsCache.fxRate === rate) {
    return _subsCache.data
  }

  const [active, trialing, pastDue] = await Promise.all([
    fetchByStatus('active', rate),
    fetchByStatus('trialing', rate),
    fetchByStatus('past_due', rate),
  ])

  const data = [...active, ...trialing, ...pastDue]
  _subsCache = { data, fxRate: rate, ts: Date.now() }
  return data
}

/**
 * Computes KPI snapshot from all active subscriptions.
 * Accepts an optional fxRate; if omitted, fetches the live ECB rate.
 */
export async function getKpis(fxRate?: number): Promise<KpiData> {
  const rate = fxRate ?? await getUsdToCadRate()
  const subs = await getActiveSubscriptions(rate)

  // MRR/ARR = active + past_due (excludes trialing only).
  // Past_due is intentionally included: Vome accepts offline payments (manual transfers, cheques)
  // so a Stripe payment failure does not mean the contract revenue is lost.
  // Trialing is excluded and tracked separately as pipeline in trialingMrr/trialingArr.
  // Note: Stripe's own dashboard excludes past_due, so our MRR will be ~$400 higher than Stripe's.
  const paidSubs = subs.filter(s => s.status === 'active' || s.status === 'past_due')
  const mrr = paidSubs.reduce((sum, s) => sum + s.mrrCad, 0)
  const arr = mrr * 12
  const totalSeats = paidSubs.reduce((sum, s) => sum + s.seats, 0)

  // Split by native currency for FX transparency
  const mrrCadNative = paidSubs.filter(s => s.currency === 'cad').reduce((sum, s) => sum + s.mrrCad, 0)
  const mrrUsdNative = paidSubs.filter(s => s.currency === 'usd').reduce((sum, s) => sum + s.arrNative / 12, 0)

  const byPlan = {} as Record<PlanTier, PlanSummary>
  for (const tier of PLAN_ORDER) {
    byPlan[tier] = { count: 0, arr: 0, mrr: 0, seats: 0 }
  }

  for (const sub of paidSubs) {
    byPlan[sub.plan].count++
    byPlan[sub.plan].arr += sub.arrCad
    byPlan[sub.plan].mrr += sub.mrrCad
    byPlan[sub.plan].seats += sub.seats
  }

  const activeSubscriptions = subs.filter(s => s.status === 'active').length
  const trialingSubscriptions = subs.filter(s => s.status === 'trialing').length
  const pastDueSubscriptions = subs.filter(s => s.status === 'past_due').length

  const trialSubs = subs.filter(s => s.status === 'trialing')
  const trialingMrr = trialSubs.reduce((sum, s) => sum + s.mrrCad, 0)
  const trialingArr = trialingMrr * 12

  return {
    mrr,
    arr,
    activeSubscriptions,
    trialingSubscriptions,
    pastDueSubscriptions,
    trialingMrr,
    trialingArr,
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
