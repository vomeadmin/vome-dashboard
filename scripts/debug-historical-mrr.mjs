#!/usr/bin/env node
/**
 * Diagnostic: shows quarterly MRR snapshots with per-customer breakdown.
 * Applies the same logic as getNormalizedMrrByMonth (tiered pricing, trial_end filter,
 * internal account filter, never-paid filter).
 *
 * Run: NODE22 --env-file=.env.local scripts/debug-historical-mrr.mjs
 */

import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-01-27.acacia' })

// Use a fixed rate for this diagnostic (close enough for debugging)
const FX_RATE = 1.3729

// Internal/demo accounts — mirrored from lib/internal-accounts.ts
const INTERNAL_CUSTOMER_IDS = new Set([
  'cus_N3SpXsM35AWI42',
  'cus_N3TNW4jYeNyHhc',
  'cus_LERRQROJ8REHxO',
  'cus_OnHCgEDaRaiuyX',
  'cus_Me1OEFKDTJ6pT0',
  'cus_TP9Z4EGAPfd9Dl',
])

// month is 1-indexed. Returns Unix ts of first second of the NEXT month (exclusive upper bound).
function monthEndTs(year, month) {
  return Math.floor(new Date(year, month, 1).getTime() / 1000)
}

const CHECKPOINTS = [
  { label: 'Q1 2024 end (Mar)', ts: monthEndTs(2024, 3) },
  { label: 'Q2 2024 end (Jun)', ts: monthEndTs(2024, 6) },
  { label: 'Q3 2024 end (Sep)', ts: monthEndTs(2024, 9) },
  { label: 'Q4 2024 end (Dec)', ts: monthEndTs(2024, 12) },
  { label: 'Q1 2025 end (Mar)', ts: monthEndTs(2025, 3) },
  { label: 'Q2 2025 end (Jun)', ts: monthEndTs(2025, 6) },
  { label: 'Q3 2025 end (Sep)', ts: monthEndTs(2025, 9) },
  { label: 'Q4 2025 end (Dec)', ts: monthEndTs(2025, 12) },
  { label: 'Feb 2026 end',      ts: monthEndTs(2026, 2) },
]

console.log('Fetching all subscriptions (status: all)...')
const allSubs = []
for await (const sub of stripe.subscriptions.list({
  status: 'all',
  limit: 100,
  expand: ['data.items.data.price', 'data.latest_invoice', 'data.customer'],
})) {
  if (['incomplete', 'incomplete_expired'].includes(sub.status)) continue
  if (sub.ended_at !== null) {
    const inv = sub.latest_invoice
    if (!inv || inv.amount_paid === 0) continue
  }
  const custId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id
  if (custId && INTERNAL_CUSTOMER_IDS.has(custId)) continue
  allSubs.push(sub)
}
console.log(`Loaded ${allSubs.length} qualifying subscriptions\n`)

// Collect tiered price IDs
const tieredPriceIds = new Set()
for (const sub of allSubs) {
  for (const item of sub.items.data) {
    if (item.price.billing_scheme === 'tiered' && !item.price.tiers?.length) {
      tieredPriceIds.add(item.price.id)
    }
  }
}
console.log(`Fetching ${tieredPriceIds.size} tiered prices with tiers expanded...`)
const tieredPrices = new Map()
await Promise.all(Array.from(tieredPriceIds).map(async (id) => {
  const price = await stripe.prices.retrieve(id, { expand: ['tiers'] })
  tieredPrices.set(id, price)
}))
console.log('Done.\n')

function resolveAnnualCents(price, seats, monthsInPeriod) {
  const resolved = tieredPrices.get(price.id) ?? price
  const tiers = resolved.tiers
  if (price.billing_scheme === 'tiered' && tiers?.length) {
    let periodCents = 0
    if (resolved.tiers_mode === 'volume') {
      for (const tier of tiers) {
        if (tier.up_to === null || tier.up_to >= seats) {
          periodCents = (tier.unit_amount ?? 0) * seats + (tier.flat_amount ?? 0)
          break
        }
      }
    } else {
      let prev = 0, rem = seats
      for (const tier of tiers) {
        const cap = tier.up_to === null ? rem : (tier.up_to - prev)
        const units = Math.min(cap, rem)
        periodCents += (tier.unit_amount ?? 0) * units + (tier.flat_amount ?? 0)
        rem -= units
        prev = tier.up_to ?? seats
        if (rem <= 0) break
      }
    }
    return periodCents * (12 / monthsInPeriod)
  }
  const unitCents = price.unit_amount ?? (price.unit_amount_decimal ? Math.round(parseFloat(price.unit_amount_decimal)) : 0)
  return unitCents * seats * (12 / monthsInPeriod)
}

function customerName(sub) {
  const c = typeof sub.customer === 'object' ? sub.customer : null
  return (c?.name ?? c?.email ?? String(sub.customer)).slice(0, 50)
}

for (const { label, ts } of CHECKPOINTS) {
  const rows = []
  let skippedTrial = 0

  for (const sub of allSubs) {
    if (sub.start_date >= ts) continue
    if (sub.ended_at && sub.ended_at < ts) continue
    if (sub.trial_end && sub.trial_end >= ts) { skippedTrial++; continue }

    let mrrCad = 0
    let hastiered = false
    for (const item of sub.items.data) {
      const price = item.price
      if (!price.recurring) continue
      const seats = item.quantity ?? 1
      const interval = price.recurring.interval
      const intervalCount = price.recurring.interval_count ?? 1
      const months = interval === 'year' ? 12 * intervalCount : intervalCount
      const annCents = resolveAnnualCents(price, seats, months)
      if (annCents <= 0) continue
      const native = annCents / 100 / 12
      const cur = (price.currency ?? sub.currency).toLowerCase()
      mrrCad += cur === 'usd' ? native * FX_RATE : native
      if (price.billing_scheme === 'tiered') hastiered = true
    }
    if (mrrCad > 0) {
      rows.push({ name: customerName(sub), mrrCad, tiered: hastiered, startDate: new Date(sub.start_date * 1000).toISOString().slice(0,10), status: sub.status })
    }
  }

  rows.sort((a, b) => b.mrrCad - a.mrrCad)
  const total = rows.reduce((s, r) => s + r.mrrCad, 0)

  console.log(`\n${'='.repeat(75)}`)
  console.log(`  ${label}`)
  console.log(`  MRR: CA$${total.toFixed(0).padStart(7)}   ARR: CA$${(total * 12).toFixed(0).padStart(8)}   Active subs: ${rows.length}   Trial-excluded: ${skippedTrial}`)
  console.log(`${'='.repeat(75)}`)
  console.log(`  ${'Customer'.padEnd(50)} ${'MRR/mo'.padStart(8)}  T  Started    Status`)
  console.log(`  ${'-'.repeat(72)}`)
  for (const r of rows.slice(0, 15)) {
    const flag = r.tiered ? 'Y' : ' '
    console.log(`  ${r.name.padEnd(50)} CA$${r.mrrCad.toFixed(0).padStart(6)}  ${flag}  ${r.startDate}  ${r.status}`)
  }
  if (rows.length > 15) console.log(`  ... and ${rows.length - 15} more`)
}
