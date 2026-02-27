/**
 * Run with: node scripts/check-all-statuses.mjs
 * Checks ALL subscription statuses and the current Stripe FX rate
 * to identify what might be included in Stripe's MRR that we're missing.
 */
import Stripe from 'stripe'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const envPath = resolve(process.cwd(), '.env.local')
const envLines = readFileSync(envPath, 'utf8').split('\n')
for (const line of envLines) {
  const m = line.match(/^([^=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] = m[2].trim()
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-01-27.acacia' })

// 1. Count by status
const statusCounts = {}
for await (const sub of stripe.subscriptions.list({ status: 'all', limit: 100 })) {
  statusCounts[sub.status] = (statusCounts[sub.status] || 0) + 1
}
console.log('Subscription counts by status:', JSON.stringify(statusCounts, null, 2))
console.log()

// 3. Check trialing subscriptions (Stripe typically includes these in MRR)
let trialCADMrr = 0, trialUSDMrr = 0, trialCount = 0
for await (const sub of stripe.subscriptions.list({
  status: 'trialing',
  limit: 100,
  expand: ['data.customer', 'data.items.data.price'],
})) {
  trialCount++
  for (const item of sub.items.data) {
    const price = item.price
    const qty = item.quantity ?? 1
    const unitCents = price.unit_amount ?? 0
    const interval = price.recurring?.interval ?? 'month'
    const intervalCount = price.recurring?.interval_count ?? 1
    const monthsInPeriod = interval === 'year' ? 12 * intervalCount : intervalCount
    const annualNative = (unitCents / 100) * qty * (12 / monthsInPeriod)
    const mrr = annualNative / 12
    if (sub.currency === 'cad') trialCADMrr += mrr
    else trialUSDMrr += mrr
  }
}
console.log(`Trialing subscriptions: ${trialCount}`)
console.log(`  CAD MRR: $${trialCADMrr.toFixed(2)} | USD MRR: $${trialUSDMrr.toFixed(2)}`)
console.log()

// 4. Check past_due subscriptions (Stripe sometimes includes these too)
let pastDueCADMrr = 0, pastDueUSDMrr = 0, pastDueCount = 0
for await (const sub of stripe.subscriptions.list({
  status: 'past_due',
  limit: 100,
  expand: ['data.customer', 'data.items.data.price'],
})) {
  pastDueCount++
  for (const item of sub.items.data) {
    const price = item.price
    const qty = item.quantity ?? 1
    const unitCents = price.unit_amount ?? 0
    const interval = price.recurring?.interval ?? 'month'
    const intervalCount = price.recurring?.interval_count ?? 1
    const monthsInPeriod = interval === 'year' ? 12 * intervalCount : intervalCount
    const annualNative = (unitCents / 100) * qty * (12 / monthsInPeriod)
    const mrr = annualNative / 12
    if (sub.currency === 'cad') pastDueCADMrr += mrr
    else pastDueUSDMrr += mrr
  }
}
console.log(`Past-due subscriptions: ${pastDueCount}`)
console.log(`  CAD MRR: $${pastDueCADMrr.toFixed(2)} | USD MRR: $${pastDueUSDMrr.toFixed(2)}`)
console.log()

// 5. Summary at various rates
const activeCadMrr = 12475.00
const activeUsdMrr = 8494.17
const cadTotalWithOthers = activeCadMrr + trialCADMrr + pastDueCADMrr
const usdTotalWithOthers = activeUsdMrr + trialUSDMrr + pastDueUSDMrr
console.log('=== Summary ===')
for (const r of [1.1268, 1.35, 1.43]) {
  const activeOnly = activeCadMrr + activeUsdMrr * r
  const withOthers = cadTotalWithOthers + usdTotalWithOthers * r
  console.log(`Rate ${r}: active-only $${activeOnly.toFixed(2)} CAD | +trialing+past_due $${withOthers.toFixed(2)} CAD`)
}
// Back-calculate what rate Stripe would need to show $26,155
const stripeShown = 26155.37
const impliedRate = (stripeShown - cadTotalWithOthers) / usdTotalWithOthers
console.log(`\nStripe shows: $${stripeShown}`)
console.log(`Implied rate to hit Stripe's number (incl. trialing/past_due): ${impliedRate.toFixed(4)} CAD/USD`)
