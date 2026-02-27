/**
 * Run with: node scripts/check-intervals.mjs
 * Shows interval, intervalCount, unit_amount, qty for every active subscription
 * so we can see if any have non-standard billing cadences (quarterly, biennial, etc.)
 */
import Stripe from 'stripe'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load .env.local manually since this is a raw script (no dotenv dep needed)
const envPath = resolve(process.cwd(), '.env.local')
const envLines = readFileSync(envPath, 'utf8').split('\n')
for (const line of envLines) {
  const m = line.match(/^([^=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] = m[2].trim()
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-01-27.acacia' })

const cadences = {}
let totalCADMrr = 0, totalUSDMrr = 0, count = 0

for await (const sub of stripe.subscriptions.list({
  status: 'active',
  limit: 100,
  expand: ['data.customer', 'data.items.data.price'],
})) {
  count++
  const currency = sub.currency

  for (const item of sub.items.data) {
    const price = item.price
    const interval = price.recurring?.interval ?? 'month'
    const intervalCount = price.recurring?.interval_count ?? 1
    const qty = item.quantity ?? 1
    const unitCents = price.unit_amount ?? 0
    const key = `${interval}-${intervalCount}`

    cadences[key] = cadences[key] ?? { count: 0, cadMrr: 0, usdMrr: 0 }
    cadences[key].count++

    const monthsInPeriod = interval === 'year' ? 12 * intervalCount : intervalCount
    const annualNative = (unitCents / 100) * qty * (12 / monthsInPeriod)
    const mrr = annualNative / 12

    if (currency === 'cad') {
      cadences[key].cadMrr += mrr
      totalCADMrr += mrr
    } else {
      cadences[key].usdMrr += mrr
      totalUSDMrr += mrr
    }
  }
}

console.log(`\nTotal active subscriptions: ${count}`)
console.log('\nMRR by billing cadence (native currencies):')
for (const [key, v] of Object.entries(cadences).sort()) {
  console.log(`  ${key.padEnd(12)} | count: ${v.count} | CAD MRR: $${v.cadMrr.toFixed(2)} | USD MRR: $${v.usdMrr.toFixed(2)}`)
}
console.log(`\nTotal CAD MRR (native): $${totalCADMrr.toFixed(2)}`)
console.log(`Total USD MRR (native): $${totalUSDMrr.toFixed(2)}`)
console.log(`\nAt 1.1268 rate: $${(totalCADMrr + totalUSDMrr * 1.1268).toFixed(2)} CAD`)
console.log(`At 1.4300 rate: $${(totalCADMrr + totalUSDMrr * 1.43).toFixed(2)} CAD`)
