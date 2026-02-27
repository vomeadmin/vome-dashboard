import { NextResponse } from 'next/server'
import { getTopCustomers } from '@/lib/stripe-calculations'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const customers = await getTopCustomers(50)
    return NextResponse.json({ customers })
  } catch (error) {
    console.error('[/api/stripe/customers]', error)
    return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 })
  }
}
