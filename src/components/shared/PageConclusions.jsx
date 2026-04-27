import { T } from '../../styles/theme.js'

// Renders a "Key Takeaways" strip at the bottom of a page/tab.
// conclusions: [{ label, text, color? }]
export default function PageConclusions({ title = 'Key Takeaways', conclusions = [] }) {
  if (!conclusions.length) return null
  return (
    <div style={{
      background: T.surf3,
      border: `1px solid ${T.border}`,
      borderRadius: 12,
      padding: '18px 22px',
      marginTop: 28,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: T.textMin,
        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14,
      }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {conclusions.map((c, i) => (
          <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{
              fontSize: 10, fontWeight: 700,
              color: c.color ?? T.accentSoft,
              textTransform: 'uppercase', letterSpacing: '0.05em',
              minWidth: 92, flexShrink: 0, paddingTop: 2,
            }}>
              {c.label}
            </div>
            <div style={{ fontSize: 12, color: T.textMd, lineHeight: 1.65 }}>
              {c.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
