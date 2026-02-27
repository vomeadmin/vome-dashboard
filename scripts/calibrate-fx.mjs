/**
 * Run with: node scripts/calibrate-fx.mjs
 *
 * Computes the implied FX rate Stripe uses for their MRR display.
 * After running, paste the output line into .env.local and restart the dev server.
 *
 * Usage:
 *   STRIPE_SHOWN_MRR=26155.37 node scripts/calibrate-fx.mjs
 *
 * Or just run without the env var — it will prompt for Stripe's MRR.
 */
import Stripe from 'stripe'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as readline from 'readline'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '../.env.local')
const envLines = readFileSync(envPath, 'utf8').split('\n')
for (const line of envLines) {
  const m = line.match(/^([^=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] = m[2].trim()
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-01-27.acacia' })

// Expand depth 4: data.items.data.price (NOT data.items.data.price.product — that's depth 5)
console.log('Fetching subscriptions from Stripe...')

let cadMrr = 0, usdMrr = 0, count = 0, trialCount = 0, pastDueCount = 0

for await (const sub of stripe.subscriptions.list({
  status: 'all',
  limit: 100,
  expand: ['data.items.data.price'],
})) {
  if (!['active', 'trialing', 'past_due'].includes(sub.status)) continue

  count++
  if (sub.status === 'trialing') trialCount++
  if (sub.status === 'past_due') pastDueCount++

  const currency = sub.currency

  for (const item of sub.items.data) {
    const price = item.price
    const qty = item.quantity ?? 1
    const unitCents = price.unit_amount ?? 0
    const interval = price.recurring?.interval ?? 'month'
    const intervalCount = price.recurring?.interval_count ?? 1
    const monthsInPeriod = interval === 'year' ? 12 * intervalCount : intervalCount
    const annualNative = (unitCents / 100) * qty * (12 / monthsInPeriod)
    const mrr = annualNative / 12

    if (currency === 'cad') cadMrr += mrr
    else usdMrr += mrr
  }
}

console.log(`\nSubscriptions: ${count} total (${trialCount} trialing, ${pastDueCount} past_due)`)
console.log(`Native CAD MRR: $${cadMrr.toFixed(2)} CAD/mo`)
console.log(`Native USD MRR: $${usdMrr.toFixed(2)} USD/mo`)
console.log()

// Get Stripe's MRR from env var or prompt
let stripeMrr = parseFloat(process.env.STRIPE_SHOWN_MRR ?? '')

if (isNaN(stripeMrr)) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  stripeMrr = await new Promise((resolve) => {
    rl.question('Enter the MRR shown on Stripe\'s dashboard (e.g. 26155.37): ', (ans) => {
      rl.close()
      resolve(parseFloat(ans))
    })
  })
}

const impliedRate = (stripeMrr - cadMrr) / usdMrr
const currentRate = parseFloat(process.env.STRIPE_DASHBOARD_FX_RATE ?? '0')
const ourMrr = cadMrr + usdMrr * impliedRate

console.log(`\nStripe shows:     $${stripeMrr.toFixed(2)} CAD MRR`)
console.log(`Our MRR at rate:  $${ourMrr.toFixed(2)} CAD MRR`)
console.log(`Implied FX rate:  ${impliedRate.toFixed(4)} USD→CAD`)
console.log(`Current rate:     ${currentRate.toFixed(4)} USD→CAD`)
console.log(`Change:           ${((impliedRate - currentRate) / currentRate * 100).toFixed(2)}%`)
console.log()
console.log('─── Paste this into .env.local ───────────────────────────────')
const today = new Date().toISOString().slice(0, 10)
console.log(`STRIPE_DASHBOARD_FX_RATE=${impliedRate.toFixed(4)}`)
console.log(`# Last measured: ${today} — Stripe dashboard showed $${stripeMrr.toFixed(2)} MRR`)
console.log('──────────────────────────────────────────────────────────────')
