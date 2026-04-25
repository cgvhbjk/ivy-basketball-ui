import { T } from '../../styles/theme.js'

// Inverted-pyramid page header:
//   title    — large left heading (answers "where am I?")
//   stats    — array of { label, value, color? } — the 5-second-rule KPIs
//   controls — optional right slot for selectors / tab buttons
export default function PageHeader({ title, subtitle, stats = [], controls }) {
  return (
    <div style={{
      background:    T.surf,
      borderBottom:  `1px solid ${T.border}`,
      padding:       '18px 28px 16px',
      marginBottom:  24,
    }}>
      {/* Top row: title + controls */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: stats.length ? 14 : 0 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: T.text, margin: 0, letterSpacing: '-0.02em' }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{ fontSize: 12, color: T.textLow, margin: '3px 0 0' }}>{subtitle}</p>
          )}
        </div>
        {controls && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {controls}
          </div>
        )}
      </div>

      {/* KPI strip — the 5-second-rule answer row */}
      {stats.length > 0 && (
        <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
          {stats.map(({ label, value, color, note }, i) => (
            <div
              key={label}
              style={{
                paddingRight: 20,
                paddingLeft:  i === 0 ? 0 : 20,
                borderLeft:   i === 0 ? 'none' : `1px solid ${T.border}`,
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 700, color: color ?? T.text, lineHeight: 1.15 }}>
                {value ?? '—'}
              </div>
              <div style={{ fontSize: 11, color: T.textLow, marginTop: 1 }}>{label}</div>
              {note && <div style={{ fontSize: 10, color: T.textMin, marginTop: 1 }}>{note}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
