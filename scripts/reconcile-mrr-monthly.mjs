/**
 * scripts/reconcile-mrr-monthly.mjs
 *
 * Per-customer, per-month MRR reconciliation: our dashboard logic vs every
 * Stripe "MRR per Subscriber" CSV export you've downloaded.
 *
 * Usage:
 *   node --env-file=.env.local scripts/reconcile-mrr-monthly.mjs [csv1] [csv2] ...
 *
 * If no paths are given, auto-discovers all MRR_per_Subscriber__monthly_*.csv
 * files in ~/Downloads.
 *
 * Output:
 *   - Console: per-month summary + biggest discrepancies
 *   - reconcile-mrr-monthly-output.csv: full per-customer × per-month table
 *     Open in Excel, filter by Month and sort by "Abs Diff" to investigate.
 *
 * Methodology notes:
 *   - Comparison is in NATIVE currency (CAD vs CAD, USD vs USD) to avoid FX
 *     rate differences polluting the diff.
 *   - Historical month MRR is reconstructed from current subscription prices.
 *     If a price changed mid-history, a small residual diff is expected.
 *   - Current discount coupons are applied to all months as an approximation.
 *     If a coupon was added/removed historically, that adds minor drift.
 *   - Status column shows the CURRENT Stripe status, not the historical one.
 *   - Stripe's CSV excludes past_due subscriptions. Our calc marks them
 *     "OURS_ONLY" — this is expected for offline-payment customers.
 */

import Stripe from 'stripe'
import fs from 'fs'
import path from 'path'
import readline from 'readline'

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY
if (!STRIPE_KEY) { console.error('Missing STRIPE_SECRET_KEY'); process.exit(1) }

const stripe = new Stripe(STRIPE_KEY)

const INTERNAL_IDS = new Set([
  'cus_N3SpXsM35AWI42', // Sammy's Place
  'cus_N3TNW4jYeNyHhc', // Saully's place
  'cus_LERRQROJ8REHxO', // [TEST] Your Organization
  'cus_OnHCgEDaRaiuyX', // Montreal Toundra
  'cus_Me1OEFKDTJ6pT0', // Salmon Arm Folk Music Society
  'cus_TP9Z4EGAPfd9Dl', // Fair Systems That Work
])

const OUTPUT_PATH = path.join(process.cwd(), 'reconcile-mrr-monthly-output.csv')

// ─────────────────────────────────────────────────────────────────────────────
// 1. CSV parsing
// ─────────────────────────────────────────────────────────────────────────────

function parseCsvLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes }
    else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = '' }
    else { current += ch }
  }
  result.push(current.trim())
  return result
}

async function parseCsv(filePath) {
  const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity })
  let headers = null
  const rows = []
  for await (const line of rl) {
    const cols = parseCsvLine(line)
    if (!headers) { headers = cols; continue }
    if (cols.length < headers.length) continue
    rows.push(Object.fromEntries(headers.map((h, i) => [h, cols[i]])))
  }
  return rows
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. MRR calculation helpers — mirrors lib/stripe-calculations.ts exactly
// ─────────────────────────────────────────────────────────────────────────────

function resolveItemAnnualCents(price, seats, monthsInPeriod, tieredPrices) {
  const resolvedPrice = tieredPrices.get(price.id) ?? price
  const tiers = resolvedPrice.tiers

  if (price.billing_scheme === 'tiered' && tiers?.length > 0) {
    let periodChargeCents = 0
    if (resolvedPrice.tiers_mode === 'volume') {
      for (const tier of tiers) {
        if (tier.up_to === null || tier.up_to >= seats) {
          periodChargeCents = (tier.unit_amount ?? 0) * seats + (tier.flat_amount ?? 0)
          break
        }
      }
    } else {
      // Graduated
      let prevUpTo = 0, remaining = seats
      for (const tier of tiers) {
        const cap = tier.up_to === null ? remaining : (tier.up_to - prevUpTo)
        const units = Math.min(cap, remaining)
        periodChargeCents += (tier.unit_amount ?? 0) * units + (tier.flat_amount ?? 0)
        remaining -= units
        prevUpTo = tier.up_to ?? seats
        if (remaining <= 0) break
      }
    }
    return periodChargeCents * (12 / monthsInPeriod)
  }

  // Per-unit: prefer unit_amount_decimal for non-integer prices (e.g. Sport Yukon)
  const unitCents = price.unit_amount ??
    (price.unit_amount_decimal ? Math.round(parseFloat(price.unit_amount_decimal)) : 0)
  return unitCents * seats * (12 / monthsInPeriod)
}

/**
 * Compute MRR (native currency) for a single subscription.
 * Mirrors the fixed discount logic in lib/stripe-calculations.ts:
 *   - Only PERMANENT coupons (discount.end === null) are applied to MRR.
 *     Time-limited promotions affect invoices but Stripe treats undiscounted
 *     subscription price as committed MRR.
 *   - Checks both sub.discounts AND customer.discount for permanent coupons.
 */
function computeSubMrr(sub, tieredPrices, coupons) {
  let totalArrNative = 0
  let primaryItem = null

  for (const item of sub.items.data) {
    const price = item.price
    if (!price?.recurring) continue
    const seats = item.quantity ?? 1
    const interval = price.recurring.interval ?? 'month'
    const intervalCount = price.recurring.interval_count ?? 1
    const monthsInPeriod = interval === 'year' ? 12 * intervalCount : intervalCount
    const annualCents = resolveItemAnnualCents(price, seats, monthsInPeriod, tieredPrices)
    if (annualCents <= 0) continue
    totalArrNative += annualCents / 100

    const unitCents = price.unit_amount ?? 0
    if (!primaryItem || unitCents > (primaryItem.price.unit_amount ?? 0)) {
      primaryItem = item
    }
  }

  if (totalArrNative === 0) return 0

  // Collect permanent discount candidates from sub.discounts and customer.discount
  const discountSources = []
  const seenCouponIds = new Set()

  const subDiscounts = sub.discounts
  if (Array.isArray(subDiscounts)) {
    for (const d of subDiscounts) {
      const couponId = d?.source?.type === 'coupon' ? d.source.coupon : undefined
      if (couponId && !seenCouponIds.has(couponId)) {
        seenCouponIds.add(couponId)
        discountSources.push({ couponId, end: d.end ?? null })
      }
    }
  }
  // customer.discount: permanent coupons not always propagated to sub.discounts
  const custDiscount = sub.customer?.discount ?? null
  if (custDiscount?.source?.type === 'coupon' && custDiscount.source.coupon) {
    const couponId = custDiscount.source.coupon
    if (!seenCouponIds.has(couponId)) {
      seenCouponIds.add(couponId)
      discountSources.push({ couponId, end: custDiscount.end ?? null })
    }
  }

  // Apply first PERMANENT coupon only (end === null)
  for (const { couponId, end } of discountSources) {
    if (end !== null) continue  // skip time-limited promotions
    const coupon = coupons.get(couponId)
    if (!coupon || coupon.valid === false) continue
    if (coupon.percent_off != null) {
      totalArrNative *= (1 - coupon.percent_off / 100)
    } else if (coupon.amount_off != null && primaryItem) {
      const pi = primaryItem.price
      const piInterval = pi.recurring?.interval ?? 'month'
      const piCount = pi.recurring?.interval_count ?? 1
      const piMonths = piInterval === 'year' ? 12 * piCount : piCount
      totalArrNative = Math.max(0, totalArrNative - (coupon.amount_off / 100) * (12 / piMonths))
    }
    break
  }

  return totalArrNative / 12
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  // ── Find CSV files ─────────────────────────────────────────────────────────
  let csvPaths = process.argv.slice(2)
  if (!csvPaths.length) {
    const dl = path.join(process.env.HOME ?? process.env.USERPROFILE ?? '', 'Downloads')
    csvPaths = fs.readdirSync(dl)
      .filter(f => /^MRR_per_Subscriber__monthly_.*\.csv$/i.test(f))
      .map(f => path.join(dl, f))
      .sort()
  }
  if (!csvPaths.length) {
    console.error('No MRR_per_Subscriber__monthly_*.csv files found in ~/Downloads')
    console.error('Either download them from Stripe or pass paths as CLI args.')
    process.exit(1)
  }
  console.log(`\nFound ${csvPaths.length} Stripe CSV file(s):`)
  csvPaths.forEach(p => console.log(`  ${path.basename(p)}`))

  // ── Parse CSVs → stripeData + customerMeta ─────────────────────────────────
  // stripeData:   Map<customerId, Map<monthKey, mrrNative>>
  // customerMeta: Map<customerId, { name, email, currency }>
  const stripeData = new Map()
  const customerMeta = new Map()
  const allMonthKeys = new Set()

  for (const csvPath of csvPaths) {
    const rows = await parseCsv(csvPath)
    if (!rows.length) continue
    const monthKey = Object.keys(rows[0]).find(k => /^\d{4}-\d{2}$/.test(k))
    if (!monthKey) { console.warn(`  ⚠ No YYYY-MM column in ${path.basename(csvPath)}`); continue }
    allMonthKeys.add(monthKey)
    console.log(`  → ${path.basename(csvPath)} — month: ${monthKey}, ${rows.length} rows`)

    for (const row of rows) {
      const id = row['Customer ID']
      if (!id) continue
      if (INTERNAL_IDS.has(id)) continue  // exclude internal accounts from CSV side too

      if (!customerMeta.has(id)) {
        customerMeta.set(id, {
          name: row['Customer'] ?? id,
          email: row['Customer Email'] ?? '',
          currency: (row['Currency'] ?? 'cad').toLowerCase(),
        })
      }

      const mrr = parseFloat(row[monthKey] ?? '0')
      if (!stripeData.has(id)) stripeData.set(id, new Map())
      const byMonth = stripeData.get(id)
      byMonth.set(monthKey, (byMonth.get(monthKey) ?? 0) + mrr)
    }
  }

  const sortedMonths = [...allMonthKeys].sort()
  console.log(`\nMonths to reconcile: ${sortedMonths.join(', ')}`)

  // ── Fetch all Stripe subscriptions (including cancelled) ───────────────────
  process.stdout.write('\nFetching all Stripe subscriptions...')
  const allSubs = []
  for await (const sub of stripe.subscriptions.list({
    status: 'all',
    limit: 100,
    expand: ['data.customer', 'data.items.data.price', 'data.discounts'],
  })) {
    if (['incomplete', 'incomplete_expired'].includes(sub.status)) continue
    allSubs.push(sub)
  }
  process.stdout.write(` ${allSubs.length} fetched\n`)

  // ── Collect tiered price IDs + coupon IDs for batch-fetch ─────────────────
  const tieredPriceIds = new Set()
  const couponIds = new Set()
  for (const sub of allSubs) {
    for (const item of sub.items.data) {
      if (item.price?.billing_scheme === 'tiered' && !item.price.tiers?.length) {
        tieredPriceIds.add(item.price.id)
      }
    }
    const discounts = sub.discounts
    if (Array.isArray(discounts)) {
      for (const d of discounts) {
        const src = d?.source
        if (src?.type === 'coupon' && src.coupon) couponIds.add(src.coupon)
      }
    }
    // Also collect customer-level coupon IDs (not always in sub.discounts)
    const custDiscount = sub.customer?.discount
    if (custDiscount?.source?.type === 'coupon' && custDiscount.source.coupon) {
      couponIds.add(custDiscount.source.coupon)
    }
  }

  process.stdout.write(`Fetching ${tieredPriceIds.size} tiered price(s) + ${couponIds.size} coupon(s)...`)
  const tieredPrices = new Map()
  const coupons = new Map()
  await Promise.all([
    ...[...tieredPriceIds].map(async id => {
      tieredPrices.set(id, await stripe.prices.retrieve(id, { expand: ['tiers'] }))
    }),
    ...[...couponIds].map(async id => {
      coupons.set(id, await stripe.coupons.retrieve(id))
    }),
  ])
  process.stdout.write(' done\n')

  // ── Compute our MRR per customer per month ─────────────────────────────────
  // ourData: Map<monthKey, Map<customerId, { mrrNative, currency, name, email, status }>>
  const ourData = new Map()

  for (const monthKey of sortedMonths) {
    const [year, month] = monthKey.split('-').map(Number)
    // Exclusive upper bound: first second of NEXT month.
    // A subscription that ended exactly at month-end is still counted.
    const monthEndTs = Math.floor(new Date(year, month, 1).getTime() / 1000)

    const byCustomer = new Map()

    for (const sub of allSubs) {
      const customerId = typeof sub.customer === 'string'
        ? sub.customer
        : sub.customer?.id
      if (!customerId) continue
      if (INTERNAL_IDS.has(customerId)) continue

      // Was this subscription active at the snapshot timestamp?
      if (sub.start_date >= monthEndTs) continue                        // not started yet
      if (sub.ended_at && sub.ended_at < monthEndTs) continue           // already cancelled

      const mrrNative = computeSubMrr(sub, tieredPrices, coupons)
      if (mrrNative <= 0) continue

      const customerObj = typeof sub.customer === 'object' ? sub.customer : null

      if (byCustomer.has(customerId)) {
        byCustomer.get(customerId).mrrNative += mrrNative
      } else {
        byCustomer.set(customerId, {
          mrrNative,
          currency: sub.currency,
          name: customerObj?.name ?? customerObj?.email ?? customerId,
          email: customerObj?.email ?? '',
          status: sub.status,   // current status (not historical — see methodology note)
        })
      }
    }

    ourData.set(monthKey, byCustomer)
  }

  // ── Build unified customer list ────────────────────────────────────────────
  const allCustomerIds = new Set()
  for (const [id] of stripeData) allCustomerIds.add(id)
  for (const [, byCustomer] of ourData) {
    for (const [id] of byCustomer) allCustomerIds.add(id)
  }
  for (const id of INTERNAL_IDS) allCustomerIds.delete(id)

  // ── Build output rows ──────────────────────────────────────────────────────
  const outputRows = []

  for (const monthKey of sortedMonths) {
    const ourByCustomer = ourData.get(monthKey) ?? new Map()

    for (const customerId of allCustomerIds) {
      const ours = ourByCustomer.get(customerId)
      const csvMrr = stripeData.get(customerId)?.get(monthKey) ?? 0
      const ourMrr = ours?.mrrNative ?? 0

      if (ourMrr === 0 && csvMrr === 0) continue

      const meta = customerMeta.get(customerId)
      const currency = ours?.currency ?? meta?.currency ?? 'cad'
      const name = ours?.name ?? meta?.name ?? customerId
      const email = ours?.email ?? meta?.email ?? ''
      const status = ours?.status ?? (csvMrr > 0 ? 'csv_only' : 'unknown')
      const diff = ourMrr - csvMrr

      outputRows.push({ monthKey, customerId, name, email, currency, status, ourMrr, csvMrr, diff })
    }
  }

  // ── Console: per-month summary ─────────────────────────────────────────────
  console.log()
  for (const monthKey of sortedMonths) {
    const rows = outputRows.filter(r => r.monthKey === monthKey)

    const sum = (cur, field) => rows.filter(r => r.currency === cur).reduce((s, r) => s + r[field], 0)
    const ourCad = sum('cad', 'ourMrr'), ourUsd = sum('usd', 'ourMrr')
    const csvCad = sum('cad', 'csvMrr'), csvUsd = sum('usd', 'csvMrr')

    const oursOnly = rows.filter(r => r.csvMrr === 0 && r.ourMrr > 0)
    const csvOnly = rows.filter(r => r.ourMrr === 0 && r.csvMrr > 0)
    const significant = rows
      .filter(r => Math.abs(r.diff) > 1.00 && r.csvMrr > 0 && r.ourMrr > 0)
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))

    console.log(`${'═'.repeat(100)}`)
    console.log(` ${monthKey}`)
    console.log(`${'═'.repeat(100)}`)
    console.log(`  Our calc    CAD ${ourCad.toFixed(2).padStart(10)}  |  USD ${ourUsd.toFixed(2).padStart(10)}`)
    console.log(`  Stripe CSV  CAD ${csvCad.toFixed(2).padStart(10)}  |  USD ${csvUsd.toFixed(2).padStart(10)}`)
    console.log(`  Diff        CAD ${(ourCad - csvCad).toFixed(2).padStart(10)}  |  USD ${(ourUsd - csvUsd).toFixed(2).padStart(10)}`)

    if (significant.length > 0) {
      console.log(`\n  Discrepancies > $1.00 (both sides non-zero):`)
      for (const r of significant.slice(0, 15)) {
        const sign = r.diff > 0 ? '+' : ''
        console.log(
          `    ${r.name.slice(0, 42).padEnd(44)}` +
          ` | ${r.currency.toUpperCase()} ours ${r.ourMrr.toFixed(2).padStart(8)}` +
          `  csv ${r.csvMrr.toFixed(2).padStart(8)}` +
          `  diff ${sign}${r.diff.toFixed(2).padStart(8)}`
        )
      }
    }

    if (oursOnly.length > 0) {
      const pdCount = oursOnly.filter(r => r.status === 'past_due').length
      const otherCount = oursOnly.length - pdCount
      process.stdout.write(`\n  In our calc but NOT in CSV: ${oursOnly.length}`)
      if (pdCount > 0) process.stdout.write(` (${pdCount} past_due — offline payers, expected)`)
      if (otherCount > 0) process.stdout.write(` (${otherCount} other — investigate)`)
      console.log()
      for (const r of oursOnly.slice(0, 8)) {
        console.log(`    [${r.status.toUpperCase().padEnd(9)}] ${r.name.slice(0, 45).padEnd(47)} | ${r.currency.toUpperCase()} ${r.ourMrr.toFixed(2).padStart(8)}`)
      }
      if (oursOnly.length > 8) console.log(`    ... and ${oursOnly.length - 8} more (see CSV output)`)
    }

    if (csvOnly.length > 0) {
      console.log(`\n  In Stripe CSV but NOT in our calc: ${csvOnly.length} — ⚠ investigate`)
      for (const r of csvOnly.slice(0, 8)) {
        console.log(`    ${r.name.slice(0, 55).padEnd(57)} | ${r.currency.toUpperCase()} ${r.csvMrr.toFixed(2).padStart(8)}`)
      }
      if (csvOnly.length > 8) console.log(`    ... and ${csvOnly.length - 8} more (see CSV output)`)
    }

    if (significant.length === 0 && oursOnly.filter(r => r.status !== 'past_due').length === 0 && csvOnly.length === 0) {
      console.log(`  ✓ No significant discrepancies`)
    }

    console.log()
  }

  // ── Write output CSV ───────────────────────────────────────────────────────
  const escCsv = v => `"${String(v ?? '').replace(/"/g, '""')}"`
  const headers = ['Month', 'Customer ID', 'Customer Name', 'Customer Email',
    'Currency', 'Status (current)', 'Our MRR', 'Stripe CSV MRR', 'Diff (ours−csv)', 'Abs Diff']
  const lines = [headers.join(',')]

  const sortedRows = [...outputRows].sort((a, b) => {
    if (a.monthKey !== b.monthKey) return a.monthKey.localeCompare(b.monthKey)
    return Math.abs(b.diff) - Math.abs(a.diff)
  })

  for (const r of sortedRows) {
    lines.push([
      r.monthKey,
      escCsv(r.customerId),
      escCsv(r.name),
      escCsv(r.email),
      r.currency.toUpperCase(),
      r.status,
      r.ourMrr.toFixed(4),
      r.csvMrr.toFixed(4),
      r.diff.toFixed(4),
      Math.abs(r.diff).toFixed(4),
    ].join(','))
  }

  fs.writeFileSync(OUTPUT_PATH, lines.join('\r\n'), 'utf8')
  console.log(`Output written to: ${OUTPUT_PATH}`)
  console.log(`(${sortedRows.length} rows — open in Excel, filter by Month, sort by "Abs Diff")\n`)
}

main().catch(err => { console.error(err); process.exit(1) })
