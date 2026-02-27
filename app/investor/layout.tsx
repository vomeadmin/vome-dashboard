export default function InvestorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 px-8 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <span className="text-lg font-bold text-slate-100">Vome</span>
            <span className="text-slate-500 text-sm ml-3">Investor Dashboard</span>
          </div>
          <div className="text-xs text-slate-600">
            {new Date().toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })}
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-8 py-8">{children}</main>
    </div>
  )
}
