export default function InvestorLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <div className="text-center">
        <div className="mb-4 inline-block h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-500" />
        <p className="text-sm text-slate-400">Loading data directly from Stripe.</p>
        <p className="text-xs text-slate-600 mt-1">Please give us a moment.</p>
      </div>
    </div>
  )
}
