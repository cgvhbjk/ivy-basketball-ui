import { useState } from 'react'
import { T } from '../../styles/theme.js'

export default function Accordion({ title, defaultOpen = false, badge, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 10 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '11px 16px', background: T.surf, border: 'none', cursor: 'pointer',
          color: T.textMd, fontSize: 13, fontWeight: 600, textAlign: 'left',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {title}
          {badge && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
              background: `${T.accent}22`, color: T.accentSoft,
            }}>
              {badge}
            </span>
          )}
        </span>
        <span style={{ fontSize: 10, color: T.textMin, transition: 'transform .2s',
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          ▾
        </span>
      </button>
      {open && (
        <div style={{ padding: '14px 16px', background: T.surf, borderTop: `1px solid ${T.border}` }}>
          {children}
        </div>
      )}
    </div>
  )
}
