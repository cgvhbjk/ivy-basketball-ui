import { NavLink } from 'react-router-dom'
import { T } from '../styles/theme.js'

const LINKS = [
  { to: '/analyzer', label: 'Matchup Analyzer' },
  { to: '/insights',  label: 'Insights Lab'     },
  { to: '/players',   label: 'Player Lab'        },
  { to: '/epa',       label: 'EPA Lab'           },
  { to: '/luck',      label: 'Luck Lab'          },
]

export default function Navbar() {
  return (
    <nav style={{
      background:    T.bgDeep,
      borderBottom:  `1px solid ${T.border}`,
      padding:       '0 28px',
      display:       'flex',
      alignItems:    'center',
      gap:           28,
      height:        50,
      flexShrink:    0,
      position:      'sticky',
      top:           0,
      zIndex:        50,
    }}>
      {/* Brand mark */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
        <div style={{
          width: 26, height: 26, borderRadius: 5,
          background: T.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em',
        }}>
          IV
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: T.text, letterSpacing: '-0.01em' }}>
          Ivy Basketball
        </span>
      </div>

      <div style={{ width: 1, height: 20, background: T.border, flexShrink: 0 }} />

      {/* Navigation */}
      <div style={{ display: 'flex', gap: 2, flex: 1 }}>
        {LINKS.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            style={({ isActive }) => ({
              padding:        '5px 13px',
              borderRadius:   6,
              fontSize:       13,
              fontWeight:     500,
              textDecoration: 'none',
              color:          isActive ? T.accentSoft : T.textLow,
              background:     isActive ? `${T.accent}1a` : 'transparent',
              transition:     'color .15s, background .15s',
            })}
          >
            {label}
          </NavLink>
        ))}
      </div>

      {/* Right label */}
      <span style={{ fontSize: 11, color: T.textMin, flexShrink: 0 }}>
        2022–2025 · 32 team-seasons
      </span>
    </nav>
  )
}
