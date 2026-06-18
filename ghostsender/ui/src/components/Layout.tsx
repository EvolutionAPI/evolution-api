import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard, Flame, Send, Search, Cpu,
  Ghost, Zap, Menu, X,
} from 'lucide-react'
import { useState } from 'react'

const nav = [
  { to: '/',          icon: LayoutDashboard, label: 'Dashboard'   },
  { to: '/warmup',    icon: Flame,           label: 'Warmup'      },
  { to: '/blast',     icon: Send,            label: 'Disparar'    },
  { to: '/verify',    icon: Search,          label: 'Verificar'   },
  { to: '/instances', icon: Cpu,             label: 'Instâncias'  },
]

export default function Layout() {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 flex flex-col w-60 bg-ghost-surface border-r border-ghost-border
        transform transition-transform duration-200 lg:relative lg:translate-x-0
        ${open ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-ghost-border">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-ghost-primary/20">
            <Ghost className="w-4 h-4 text-ghost-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white tracking-wide">GhostSender</p>
            <p className="text-[10px] text-slate-500 flex items-center gap-1">
              <Zap className="w-2.5 h-2.5 text-cyan-500" /> v1.0
            </p>
          </div>
          <button onClick={() => setOpen(false)} className="ml-auto lg:hidden text-slate-500 hover:text-slate-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150
                ${isActive
                  ? 'bg-ghost-primary/20 text-white font-medium'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={`w-4 h-4 ${isActive ? 'text-ghost-primary' : ''}`} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-ghost-border">
          <p className="text-[11px] text-slate-600">Powered by Evolution API</p>
        </div>
      </aside>

      {/* Overlay mobile */}
      {open && (
        <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar mobile */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-ghost-border bg-ghost-surface lg:hidden">
          <button onClick={() => setOpen(true)} className="text-slate-400 hover:text-slate-200">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Ghost className="w-4 h-4 text-ghost-primary" />
            <span className="text-sm font-semibold text-white">GhostSender</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-ghost-bg">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
