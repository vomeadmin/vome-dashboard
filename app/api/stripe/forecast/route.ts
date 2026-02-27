import { NextResponse } from 'next/server'
import { getCashFlowForecast } from '@/lib/stripe-forecast'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const forecast = await getCashFlowForecast()
    return NextResponse.json(forecast)
  } catch (error) {
    console.error('[/api/stripe/forecast]', error)
    return NextResponse.json({ error: 'Failed to fetch cash flow forecast' }, { status: 500 })
  }
}
