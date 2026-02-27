import Stripe from 'stripe'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// Load .env.local manually
const __dir = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dir, '..', '.env.local')
const envContent = readFileSync(envPath, 'utf8')
for (const line of envContent.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.+)$/)
  if (m) process.env[m[1]] = m[2].trim()
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })

// Live FX rate
const fxRes = await fetch('https://api.frankfurter.app/latest?from=USD&to=CAD')
const fxData = await fxRes.json()
const liveRate = fxData.rates.CAD
console.log(`\nLive FX rate: 1 USD = ${liveRate.toFixed(4)} CAD\n`)

// Note: stripe.exchangeRates is not available on this account — skipping

const rows = []
let oldMrrCadUsd = 0
let newMrrCadUsd = 0
let oldMrrCadCad = 0
let newMrrCadCad = 0

for await (const sub of stripe.subscriptions.list({
  status: 'active',
  limit: 100,
  expand: ['data.customer', 'data.items.data.price'],
})) {
  const item = sub.items.data[0]
  if (!item) continue

  const price = item.price
  const seats = item.quantity ?? 1
  const unitCents = price.unit_amount ?? 0
  const interval = price.recurring?.interval ?? 'month'
  const intervalCount = price.recurring?.interval_count ?? 1
  const currency = sub.currency
  const customer = sub.customer

  // Old calculation (no interval_count division)
  const oldAnnualNative =
    interval === 'year'
      ? (unitCents / 100) * seats
      : (unitCents / 100) * seats * 12

  // New calculation (correct)
  const newAnnualNative =
    interval === 'year'
      ? (unitCents / 100) * seats / intervalCount
      : (unitCents / 100) * seats * 12

  const name = (typeof customer === 'object' ? customer?.name || customer?.email : customer) ?? sub.id

  if (interval === 'year' && intervalCount > 1) {
    rows.push({
      name: name.slice(0, 40),
      seats,
      interval: `${intervalCount}yr`,
      currency,
      oldArr: oldAnnualNative,
      newArr: newAnnualNative,
      delta: oldAnnualNative - newAnnualNative,
    })
  }

  if (currency === 'usd') {
    oldMrrCadUsd += (oldAnnualNative * liveRate) / 12
    newMrrCadUsd += (newAnnualNative * liveRate) / 12
  } else {
    oldMrrCadCad += oldAnnualNative / 12
    newMrrCadCad += newAnnualNative / 12
  }
}

if (rows.length === 0) {
  console.log('No multi-year subscriptions found (intervalCount > 1)\n')
} else {
  console.log('Multi-year subscriptions affected by interval_count fix:')
  console.log('-'.repeat(90))
  console.log(
    'Customer'.padEnd(41) +
    'Seats'.padStart(6) +
    'Cycle'.padStart(6) +
    'Curr'.padStart(5) +
    'Old ARR/yr'.padStart(14) +
    'New ARR/yr'.padStart(14) +
    'Reduction'.padStart(12)
  )
  console.log('-'.repeat(90))
  for (const r of rows) {
    console.log(
      r.name.padEnd(41) +
      String(r.seats).padStart(6) +
      r.interval.padStart(6) +
      r.currency.toUpperCase().padStart(5) +
      `$${Math.round(r.oldArr).toLocaleString()}`.padStart(14) +
      `$${Math.round(r.newArr).toLocaleString()}`.padStart(14) +
      `-$${Math.round(r.delta).toLocaleString()}`.padStart(12)
    )
  }
  console.log('-'.repeat(90))
}

console.log(`
MRR Summary (at live rate ${liveRate.toFixed(4)}):
                                   OLD          NEW       CHANGE
  USD subs → CAD (live rate):   ${fmtCad(oldMrrCadUsd)}     ${fmtCad(newMrrCadUsd)}   -${fmtCad(oldMrrCadUsd - newMrrCadUsd)}
  CAD subs (no conversion):     ${fmtCad(oldMrrCadCad)}     ${fmtCad(newMrrCadCad)}   unchanged
  ─────────────────────────────────────────────────────────
  Total MRR:                    ${fmtCad(oldMrrCadUsd + oldMrrCadCad)}     ${fmtCad(newMrrCadUsd + newMrrCadCad)}
  Total ARR:                    ${fmtCad((oldMrrCadUsd + oldMrrCadCad) * 12)}   ${fmtCad((newMrrCadUsd + newMrrCadCad) * 12)}
`)

function fmtCad(n) {
  return ('$' + Math.round(n).toLocaleString('en-CA')).padStart(10)
}
