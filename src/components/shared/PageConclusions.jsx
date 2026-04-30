import { T } from '../../styles/theme.js'

// Renders a "Key Takeaways" strip at the bottom of a page/tab.
// conclusions: [{ label, text, color? }]
// prominent: larger cards with colored left borders — use for primary page conclusions
export default function PageConclusions({ title = 'Key Takeaways', conclusions = [], prominent = false }) {
  if (!conclusions.length) return null

  if (prominent) {
    return (
      <div style={{
        border: `1px solid ${T.border}`,
        borderRadius: 14,
        padding: '22px 26px',
        marginTop: 32,
        background: T.surf,
      }}>
        <div style={{
          fontSize: 13, fontWeight: 700, color: T.accentSoft,
          textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 18,
        }}>
          {title}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {conclusions.map((c, i) => (
            <div key={i} style={{
              display: 'flex', gap: 0, alignItems: 'stretch',
              background: T.surf2, borderRadius: 9,
              border: `1px solid ${T.border}`,
              overflow: 'hidden',
            }}>
              <div style={{ width: 4, flexShrink: 0, background: c.color ?? T.accentSoft, borderRadius: '9px 0 0 9px' }} />
              <div style={{ padding: '12px 16px', flex: 1 }}>
                <div style={{
                  fontSize: 11, fontWeight: 700,
                  color: c.color ?? T.accentSoft,
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                  marginBottom: 4,
                }}>
                  {c.label}
                </div>
                <div style={{ fontSize: 13, color: T.text, lineHeight: 1.65 }}>
                  {c.text}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

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
