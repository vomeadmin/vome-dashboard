import { cookies } from 'next/headers'
import { getTopCustomers, getKpis } from '@/lib/stripe-calculations'
import { formatCad, getEffectiveFxRate, type FxMode } from '@/lib/fx'
import { CustomerTable } from '@/components/ui/CustomerTable'
import { KpiCard } from '@/components/ui/KpiCard'

export const dynamic = 'force-dynamic'

export default async function CustomersPage() {
  const cookieStore = await cookies()
  const fxMode = (cookieStore.get('fx_mode')?.value ?? 'stripe_dashboard') as FxMode
  const fxRate = await getEffectiveFxRate(fxMode)

  const [customers, kpis] = await Promise.all([getTopCustomers(50, fxRate), getKpis(fxRate)])

  const top5ArrShare = customers
    .slice(0, 5)
    .reduce((sum, c) => sum + c.arrCad, 0)

  const top5Pct = kpis.arr > 0 ? ((top5ArrShare / kpis.arr) * 100).toFixed(1) : '0'

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Customers</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          All active subscribers ranked by ARR contribution
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total Customers" value={kpis.activeSubscriptions.toString()} icon="◎" />
        <KpiCard label="Total ARR" value={formatCad(kpis.arr)} accent="positive" icon="▲" />
        <KpiCard
          label="Top 5 ARR Share"
          value={`${top5Pct}%`}
          subValue={formatCad(top5ArrShare)}
          icon="◈"
        />
        <KpiCard
          label="Total Admin Seats"
          value={kpis.totalSeats.toString()}
          subValue={`${(kpis.totalSeats > 0 ? kpis.arr / kpis.totalSeats : 0).toFixed(0)} avg ARR/seat`}
          icon="◧"
        />
      </div>

      <CustomerTable customers={customers} />
    </div>
  )
}
