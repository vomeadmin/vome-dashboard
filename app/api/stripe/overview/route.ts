import { NextResponse } from 'next/server'
import { getKpis, getMonthlyRevenueTrend, getChurnedDowngrades } from '@/lib/stripe-calculations'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const [kpis, revenueTrend, churnedDowngrades] = await Promise.all([
      getKpis(),
      getMonthlyRevenueTrend(12),
      getChurnedDowngrades(thirtyDaysAgo),
    ])

    return NextResponse.json({ kpis, revenueTrend, churnedDowngrades })
  } catch (error) {
    console.error('[/api/stripe/overview]', error)
    return NextResponse.json({ error: 'Failed to fetch Stripe overview' }, { status: 500 })
  }
}
