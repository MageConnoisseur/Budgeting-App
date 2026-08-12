import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const links = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/budget', label: 'Budget' },
  { to: '/tracker', label: 'Tracker' },
  { to: '/categories', label: 'Categories' },
  { to: '/account', label: 'Account', end: true },
]

export function AppShell() {
  const { user, logout } = useAuth()

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden />
          <div>
            <p className="brand-name">Hearth Budgeting</p>
            <p className="brand-tag">Plan · Track · Adjust</p>
          </div>
        </div>
        <nav className="nav" aria-label="Primary">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                isActive ? 'nav-link active' : 'nav-link'
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="topbar-user">
          <span className="username">{user?.username}</span>
          <button type="button" className="btn ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
