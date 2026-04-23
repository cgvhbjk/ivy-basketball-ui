import { SCHOOL_META } from '../../data/constants.js'

export default function TeamBadge({ school, size = 'md', showName = true }) {
  const meta = SCHOOL_META[school] ?? { abbr: school.slice(0, 3).toUpperCase(), fullName: school, color: '#888' }
  const sz = size === 'sm' ? 28 : size === 'lg' ? 48 : 36

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{
        width: sz, height: sz, borderRadius: '50%',
        background: meta.color, display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center',
        fontSize: sz * 0.32, fontWeight: 700, color: '#fff',
        flexShrink: 0,
      }}>
        {meta.abbr}
      </span>
      {showName && (
        <span style={{ fontSize: size === 'sm' ? 12 : 14, color: '#e2e8f0', fontWeight: 500 }}>
          {meta.fullName}
        </span>
      )}
    </span>
  )
}
