import { getChurnedDowngrades } from '@/lib/stripe-calculations'
import { getUsdToCadRate } from '@/lib/fx'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const fromTs = parseInt(searchParams.get('from') ?? '0')
  const toTs = parseInt(searchParams.get('to') ?? '0')

  if (!fromTs || !toTs) {
    return Response.json({ error: 'Missing from/to params' }, { status: 400 })
  }

  const sinceDate = new Date(fromTs * 1000)
  const untilDate = new Date(toTs * 1000)

  const fxRate = await getUsdToCadRate()
  const events = await getChurnedDowngrades(sinceDate, fxRate, untilDate)

  // Serialize Date objects to ISO strings for JSON transport
  return Response.json(
    events.map((e) => ({
      customerName: e.customerName,
      fromPlan: e.fromPlan,
      date: e.date.toISOString(),
      arrLostCad: e.arrLostCad,
    }))
  )
}
