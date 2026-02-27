export interface FxSnapshot {
  usdToCad: number
  fetchedAt: string
}

export type FxMode = 'live' | 'stripe_api' | 'stripe_dashboard'

export const FX_MODE_LABELS: Record<FxMode, string> = {
  live: 'Live Market Rate',
  stripe_api: "Stripe's Payment Rate",
  stripe_dashboard: "Stripe's MRR Rate",
}

/**
 * Resolves the effective USD→CAD rate based on the user-selected FX mode.
 */
export async function getEffectiveFxRate(mode: FxMode): Promise<number> {
  if (mode === 'stripe_api') return getStripeUsdToCadRate()
  if (mode === 'stripe_dashboard') return parseFloat(process.env.STRIPE_DASHBOARD_FX_RATE ?? '1.40')
  return getUsdToCadRate() // 'live' — default
}

/**
 * Fetches the live USD → CAD exchange rate from Frankfurter (ECB-backed, free, no key).
 * Result is cached by Next.js fetch for 10 minutes (revalidate: 600).
 */
export async function getUsdToCadRate(): Promise<number> {
  const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=CAD', {
    next: { revalidate: 600 },
  })
  if (!res.ok) {
    console.error('FX API error', res.status)
    return 1.36 // fallback rate if API is down
  }
  const data = await res.json()
  return data.rates.CAD as number
}

/**
 * Returns Stripe's actual USD → CAD payment-processing rate by reading the exchange_rate
 * field from recent balance transactions that involved currency conversion.
 * This is the rate Stripe used when settling real USD→CAD charges.
 * Note: Stripe's MRR dashboard uses a separate internal rate (STRIPE_DASHBOARD_FX_RATE env var)
 * that updates infrequently — this payment rate is typically very close to ECB mid-market.
 * Falls back to the Frankfurter live rate if no conversion data is found.
 */
export async function getStripeUsdToCadRate(): Promise<number> {
  try {
    const { stripe } = await import('./stripe')
    // Balance transactions on a CAD-default account carry exchange_rate = USD→CAD
    // when the original charge was in USD. We take the most recent one.
    const txns = await stripe.balanceTransactions.list({ limit: 50, type: 'charge' })
    const rates = txns.data
      .filter((t) => t.exchange_rate != null && (t.exchange_rate as number) > 1)
      .map((t) => t.exchange_rate as number)
    if (rates.length > 0) return rates[0]
    return getUsdToCadRate() // fallback: no FX conversions in recent history
  } catch {
    return getUsdToCadRate()
  }
}

export function formatCad(amount: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}
