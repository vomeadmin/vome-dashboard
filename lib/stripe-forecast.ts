import { getActiveSubscriptions } from './stripe-calculations'

export interface ForecastMonth {
  month: string        // 'Jan 2026'
  monthKey: string     // '2026-01'
  amount: number       // CAD cash expected
  renewalCount: number
  renewals: Array<{
    customerName: string
    amount: number
    plan: string
    interval: string
  }>
}

export interface ForecastSummary {
  currentQuarter: ForecastMonth[]
  nextQuarter: ForecastMonth[]
  currentQLabel: string
  nextQLabel: string
  currentQTotal: number
  nextQTotal: number
}

function getQuarterMonths(year: number, quarter: number): string[] {
  const startMonth = (quarter - 1) * 3
  const months: string[] = []
  for (let m = startMonth; m < startMonth + 3; m++) {
    const month = m % 12
    const y = year + Math.floor(m / 12)
    months.push(`${y}-${String(month + 1).padStart(2, '0')}`)
  }
  return months
}

function quarterLabel(year: number, quarter: number): string {
  return `Q${quarter} ${year}`
}

function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-')
  const d = new Date(parseInt(year), parseInt(month) - 1, 1)
  return d.toLocaleDateString('en-CA', { month: 'short', year: 'numeric' })
}

/**
 * Projects expected cash inflows for the current and next quarter
 * based on active subscription renewal dates.
 */
export async function getCashFlowForecast(fxRate?: number): Promise<ForecastSummary> {
  const subs = await getActiveSubscriptions(fxRate)
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentQuarter = Math.floor(now.getMonth() / 3) + 1

  const nextQuarter = currentQuarter === 4 ? 1 : currentQuarter + 1
  const nextYear = currentQuarter === 4 ? currentYear + 1 : currentYear

  const currentQMonths = getQuarterMonths(currentYear, currentQuarter)
  const nextQMonths = getQuarterMonths(nextYear, nextQuarter)

  const allMonthKeys = [...currentQMonths, ...nextQMonths]

  const monthMap = new Map<string, ForecastMonth>()
  for (const key of allMonthKeys) {
    monthMap.set(key, {
      month: monthLabel(key),
      monthKey: key,
      amount: 0,
      renewalCount: 0,
      renewals: [],
    })
  }

  for (const sub of subs) {
    const renewalDate = sub.currentPeriodEnd
    const key = `${renewalDate.getFullYear()}-${String(renewalDate.getMonth() + 1).padStart(2, '0')}`

    if (monthMap.has(key)) {
      // Charge is the actual cash collected at renewal:
      // - Monthly subs: one month's charge
      // - Annual subs: one year's charge (arrCad)
      // - Multi-year subs (interval_count > 1): the full multi-year lump sum
      const charge =
        sub.interval === 'year' ? sub.arrCad * sub.intervalCount : sub.mrrCad
      const intervalLabel =
        sub.interval === 'year' && sub.intervalCount > 1
          ? `${sub.intervalCount} years`
          : sub.interval
      const entry = monthMap.get(key)!
      entry.amount += charge
      entry.renewalCount++
      entry.renewals.push({
        customerName: sub.customerName,
        amount: charge,
        plan: sub.plan,
        interval: intervalLabel,
      })
    }
  }

  const currentQData = currentQMonths.map((k) => monthMap.get(k)!)
  const nextQData = nextQMonths.map((k) => monthMap.get(k)!)

  return {
    currentQuarter: currentQData,
    nextQuarter: nextQData,
    currentQLabel: quarterLabel(currentYear, currentQuarter),
    nextQLabel: quarterLabel(nextYear, nextQuarter),
    currentQTotal: currentQData.reduce((sum, m) => sum + m.amount, 0),
    nextQTotal: nextQData.reduce((sum, m) => sum + m.amount, 0),
  }
}
