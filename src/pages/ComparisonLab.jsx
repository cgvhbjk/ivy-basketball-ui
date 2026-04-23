import { useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import teamSeasons from '../data/teamSeasons.json'
import { SCHOOLS, SCHOOL_META, SCHOOL_COLORS, YEARS, TEAM_METRICS, TEAM_METRIC_MAP } from '../data/constants.js'
import useStore from '../store/useStore.js'
import TeamBadge from '../components/shared/TeamBadge.jsx'
import StatCard from '../components/shared/StatCard.jsx'

const SEL = { background: '#13131f', border: '1px solid #1e1e2e', color: '#e2e8f0', borderRadius: 6, padding: '6px 10px', fontSize: 13 }
const BTN = (active) => ({
  padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: 'none',
  background: active ? '#4f46e5' : '#1e1e2e', color: active ? '#fff' : '#9ca3af',
})

const METRIC_GROUPS = [...new Set(TEAM_METRICS.map(m => m.group))]

export default function ComparisonLab() {
  const { teamA, teamB, yearRange, activeMetrics, labView,
    setTeamA, setTeamB, setYearRange, setActiveMetrics, setLabView } = useStore()

  const colorA = SCHOOL_COLORS[teamA]
  const colorB = SCHOOL_COLORS[teamB]

  // Filter team seasons to selected range
  const seasonsA = useMemo(() =>
    teamSeasons.filter(s => s.school === teamA && s.year >= yearRange[0] && s.year <= yearRange[1])
  , [teamA, yearRange])

  const seasonsB = useMemo(() =>
    teamSeasons.filter(s => s.school === teamB && s.year >= yearRange[0] && s.year <= yearRange[1])
  , [teamB, yearRange])

  // Latest season for snapshot
  const latestA = useMemo(() => seasonsA.at(-1), [seasonsA])
  const latestB = useMemo(() => seasonsB.at(-1), [seasonsB])

  // Build trend data for each active metric
  const trendData = useMemo(() => {
    return YEARS.filter(y => y >= yearRange[0] && y <= yearRange[1]).map(year => {
      const a = teamSeasons.find(s => s.school === teamA && s.year === year)
      const b = teamSeasons.find(s => s.school === teamB && s.year === year)
      const row = { year }
      activeMetrics.forEach(key => {
        if (a) row[`${key}_A`] = a[key]
        if (b) row[`${key}_B`] = b[key]
      })
      return row
    })
  }, [teamA, teamB, yearRange, activeMetrics])

  function toggleMetric(key) {
    setActiveMetrics(
      activeMetrics.includes(key)
        ? activeMetrics.filter(k => k !== key)
        : [...activeMetrics, key]
    )
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Comparison Lab</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>Side-by-side team stats · Ivy League Basketball</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['trend', 'snapshot'].map(v => (
            <button key={v} style={BTN(labView === v)} onClick={() => setLabView(v)}>
              {v === 'trend' ? 'Trend' : 'Snapshot'}
            </button>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TeamBadge school={teamA} size="sm" showName={false} />
          <select style={SEL} value={teamA} onChange={e => setTeamA(e.target.value)}>
            {SCHOOLS.map(s => <option key={s} value={s}>{SCHOOL_META[s].fullName}</option>)}
          </select>
        </div>
        <span style={{ color: '#4b5563', fontSize: 13 }}>vs</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TeamBadge school={teamB} size="sm" showName={false} />
          <select style={SEL} value={teamB} onChange={e => setTeamB(e.target.value)}>
            {SCHOOLS.map(s => <option key={s} value={s}>{SCHOOL_META[s].fullName}</option>)}
          </select>
        </div>
        <select style={SEL} value={yearRange[0]} onChange={e => setYearRange([+e.target.value, yearRange[1]])}>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <span style={{ color: '#4b5563', fontSize: 12 }}>–</span>
        <select style={SEL} value={yearRange[1]} onChange={e => setYearRange([yearRange[0], +e.target.value])}>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Metric selector */}
      <div style={{ marginBottom: 24 }}>
        {METRIC_GROUPS.map(group => (
          <div key={group} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              {group}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {TEAM_METRICS.filter(m => m.group === group).map(m => (
                <button key={m.key} style={BTN(activeMetrics.includes(m.key))} onClick={() => toggleMetric(m.key)}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Main content */}
      {labView === 'trend' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {activeMetrics.map(key => {
            const meta = TEAM_METRIC_MAP[key]
            if (!meta) return null
            return (
              <div key={key} style={{ background: '#0f0f1a', border: '1px solid #1e1e2e', borderRadius: 12, padding: '20px 24px' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#a5b4fc', marginBottom: 16 }}>{meta.label}</div>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={trendData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                    <XAxis dataKey="year" tick={{ fill: '#6b7280', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} width={48}
                      tickFormatter={v => meta.fmt ? meta.fmt(v).replace('%','') : v} />
                    <Tooltip
                      contentStyle={{ background: '#13131f', border: '1px solid #1e1e2e', borderRadius: 8, fontSize: 12 }}
                      formatter={(v, name) => [meta.fmt ? meta.fmt(v) : v.toFixed(2), name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey={`${key}_A`} name={SCHOOL_META[teamA].abbr}
                      stroke={colorA} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey={`${key}_B`} name={SCHOOL_META[teamB].abbr}
                      stroke={colorB} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )
          })}
        </div>
      ) : (
        // Snapshot view — latest season stat cards
        <div>
          <div style={{ display: 'flex', gap: 20, marginBottom: 20, alignItems: 'center' }}>
            <TeamBadge school={teamA} size="md" />
            <span style={{ color: '#4b5563' }}>{latestA?.record ?? '—'}</span>
            <span style={{ marginLeft: 'auto' }}><TeamBadge school={teamB} size="md" /></span>
            <span style={{ color: '#4b5563' }}>{latestB?.record ?? '—'}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {activeMetrics.map(key => {
              const meta = TEAM_METRIC_MAP[key]
              if (!meta) return null
              return (
                <StatCard
                  key={key}
                  label={meta.label}
                  valueA={latestA?.[key]}
                  valueB={latestB?.[key]}
                  colorA={colorA}
                  colorB={colorB}
                  higherBetter={meta.higherBetter}
                  fmt={meta.fmt}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
