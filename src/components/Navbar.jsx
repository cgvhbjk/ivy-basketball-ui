import { NavLink } from 'react-router-dom'

const links = [
  { to: '/',          label: 'Comparison Lab' },
  { to: '/analyzer',  label: 'Matchup Analyzer' },
  { to: '/insights',  label: 'Insights Lab' },
  { to: '/players',   label: 'Player Lab' },
]

export default function Navbar() {
  return (
    <nav style={{
      background: '#0a0a14', borderBottom: '1px solid #1e1e2e',
      padding: '0 24px', display: 'flex', alignItems: 'center', gap: 32, height: 52,
    }}>
      <span style={{ color: '#6366f1', fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em', flexShrink: 0 }}>
        🏀 Ivy Basketball
      </span>
      <div style={{ display: 'flex', gap: 4 }}>
        {links.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            style={({ isActive }) => ({
              padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500,
              textDecoration: 'none',
              color: isActive ? '#a5b4fc' : '#6b7280',
              background: isActive ? '#1e1e3a' : 'transparent',
            })}
          >
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
