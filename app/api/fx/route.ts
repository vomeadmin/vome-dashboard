import { NextResponse } from 'next/server'
import { getUsdToCadRate } from '@/lib/fx'

export async function GET() {
  try {
    const rate = await getUsdToCadRate()
    return NextResponse.json({ usdToCad: rate, fetchedAt: new Date().toISOString() })
  } catch (error) {
    console.error('[/api/fx]', error)
    return NextResponse.json({ error: 'Failed to fetch FX rate' }, { status: 500 })
  }
}
