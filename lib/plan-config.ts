export type PlanTier = 'Free' | 'Pro' | 'Enterprise' | 'Ultimate'

/**
 * Maps Stripe product IDs to internal plan tier labels.
 * Run `stripe products list` in your terminal and fill in these IDs.
 * Product name-based fallback is also applied below.
 */
export const PLAN_MAP: Record<string, PlanTier> = {
  'prod_PxFFl8pvULfUNj': 'Ultimate',   // Vome Ultimate Plan
  'prod_PxFB8pmGr9KuFT': 'Enterprise', // Vome Enterprise Plan
  'prod_LEDwY0SN1WokRW': 'Pro',        // Vome Pro Plan
  'prod_SN1oAX0WrIZV2T': 'Ultimate',   // Vome Ultimate Plan - 1 admin / 2 years (Louis Brier legacy)
  // Vome Recruit (Free) has no Stripe product — free users don't have subscriptions
  // One-time/proration products (not mapped — no active subscriptions):
  //   prod_TMsmpgGWbCAxDp  Change in Admin Seats
  //   prod_SwHTzGFVBsFXXx  Upgrade (Enterprise to Ultimate)
  //   prod_SwHQGxeBduyHFv  Upgrade (Enterprise -> Ultimate)
}

export const PLAN_COLORS: Record<PlanTier, string> = {
  Free:       '#fa935b',  // orange  — Recruit / Free
  Pro:        '#22c55e',  // green   — Pro
  Enterprise: '#3b82f6',  // blue    — Enterprise
  Ultimate:   '#a78bfa',  // purple  — Ultimate
}

export const PLAN_ORDER: PlanTier[] = ['Ultimate', 'Enterprise', 'Pro', 'Free']

export const PAID_PLANS: PlanTier[] = ['Pro', 'Enterprise', 'Ultimate']

/**
 * Resolves a plan tier from a Stripe product ID or product name.
 * Tries the explicit PLAN_MAP first, then falls back to name matching.
 */
export function getPlanFromProduct(productId: string | null, productName?: string | null): PlanTier {
  if (productId && PLAN_MAP[productId]) return PLAN_MAP[productId]

  if (productName) {
    const lower = productName.toLowerCase()
    if (lower.includes('ultimate')) return 'Ultimate'
    if (lower.includes('enterprise')) return 'Enterprise'
    if (lower.includes('pro')) return 'Pro'
    if (lower.includes('recruit') || lower.includes('free') || lower.includes('starter')) return 'Free'
  }

  return 'Free'
}
