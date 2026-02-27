/**
 * Server component that fetches platform activity from the Django API.
 * Falls back gracefully when the API is not yet configured.
 */
export default async function ActivityPanel() {
  const url = process.env.DJANGO_ACTIVITY_URL
  const secret = process.env.DJANGO_ACTIVITY_SECRET

  if (!url || !secret || url.includes('app.vome.ca') === false) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 flex flex-col gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Platform Activity
        </h3>
        <div className="flex flex-col items-center justify-center h-32 text-center">
          <p className="text-slate-500 text-sm">Django API not yet configured.</p>
          <p className="text-slate-600 text-xs mt-1">Set DJANGO_ACTIVITY_URL in .env.local</p>
        </div>
      </div>
    )
  }

  let data: any = null
  try {
    const res = await fetch(`${url}?period=current`, {
      headers: { Authorization: `Bearer ${secret}` },
      next: { revalidate: 300 },
    })
    if (res.ok) data = await res.json()
  } catch {
    // silently fail — show placeholder below
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4">
          Platform Activity
        </h3>
        <p className="text-slate-500 text-sm">Activity data unavailable.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4">
        Platform Activity
        <span className="ml-2 text-slate-600 normal-case font-normal">{data.period}</span>
      </h3>

      <div className="flex flex-col gap-3">
        {/* Reservations */}
        <div className="flex justify-between items-center py-2 border-b border-slate-800">
          <span className="text-sm text-slate-400">New Reservations</span>
          <span className="text-sm font-semibold text-slate-200">{data.reservations?.total_new ?? '—'}</span>
        </div>

        {/* Profiles */}
        <div className="flex justify-between items-center py-2 border-b border-slate-800">
          <span className="text-sm text-slate-400">New Profiles</span>
          <div className="text-right">
            <span className="text-sm font-semibold text-slate-200">{data.profiles?.total_new ?? '—'}</span>
            <span className="text-xs text-slate-500 block">
              {data.profiles?.total_all_time?.toLocaleString()} total
            </span>
          </div>
        </div>

        {/* Organizations */}
        <div className="flex justify-between items-center py-2 border-b border-slate-800">
          <span className="text-sm text-slate-400">New Organizations</span>
          <div className="text-right">
            <span className="text-sm font-semibold text-slate-200">{data.organizations?.total_new ?? '—'}</span>
            <span className="text-xs text-slate-500 block">
              {data.organizations?.total_all_time?.toLocaleString()} total
            </span>
          </div>
        </div>

        {/* Org Admins */}
        {data.org_admins && (
          <div className="flex justify-between items-center py-2 border-b border-slate-800">
            <span className="text-sm text-slate-400">Org Admins</span>
            <div className="text-right">
              <span className="text-sm font-semibold text-slate-200">{data.org_admins.total}</span>
              <span className="text-xs text-slate-500 block">
                {data.org_admins.on_paid_plan} paid · {data.org_admins.on_free_plan} free
              </span>
            </div>
          </div>
        )}

        {/* Plan breakdown (orgs) */}
        {data.organizations?.by_plan && (
          <div className="pt-1">
            <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">Orgs by Plan</p>
            <div className="flex flex-col gap-1">
              {Object.entries(data.organizations.by_plan as Record<string, number>).map(([plan, count]) => (
                <div key={plan} className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 capitalize">{plan}</span>
                  <span className="text-slate-300 font-medium">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
