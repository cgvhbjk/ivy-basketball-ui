export default function StatCard({ label, valueA, valueB, colorA, colorB, higherBetter, fmt }) {
  const fmtFn = fmt ?? (v => v?.toFixed?.(1) ?? String(v))
  const strA = fmtFn(valueA)
  const strB = fmtFn(valueB)

  let winA = null
  if (higherBetter !== null && valueA != null && valueB != null) {
    winA = higherBetter ? valueA > valueB : valueA < valueB
  }

  return (
    <div style={{
      background: '#1a1a1a', borderRadius: 10, padding: '12px 16px',
      border: '1px solid #2c2c2c', display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          fontSize: 22, fontWeight: 700, color: colorA,
          opacity: winA === false ? 0.55 : 1,
        }}>{strA}</span>
        <span style={{ fontSize: 11, color: '#4b5563' }}>vs</span>
        <span style={{
          fontSize: 22, fontWeight: 700, color: colorB,
          opacity: winA === true ? 0.55 : 1,
        }}>{strB}</span>
      </div>
    </div>
  )
}
