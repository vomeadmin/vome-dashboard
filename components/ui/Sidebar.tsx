'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavItem {
  label: string
  href: string
  icon: string
}

const navItems: NavItem[] = [
  { label: 'Overview', href: '/dashboard', icon: '◈' },
  { label: 'Customers', href: '/dashboard/customers', icon: '◎' },
  { label: 'Cash Flow', href: '/dashboard/forecast', icon: '◧' },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-slate-800 bg-slate-950 px-4 py-6 sticky top-0">
      {/* Brand */}
      <div className="mb-8 px-2">
        <div className="text-base font-bold text-slate-100 tracking-tight">Vome Finance</div>
        <div className="text-xs text-slate-500 mt-0.5">Internal Dashboard</div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-1 flex-1">
        {navItems.map((item) => {
          const isActive =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600/20 text-indigo-400'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Investor link */}
      <div className="border-t border-slate-800 pt-4">
        <a
          href="/investor"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors"
        >
          <span>↗</span>
          Investor View
        </a>
      </div>
    </aside>
  )
}
