import { useMemo } from 'react'
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip } from 'recharts'
import teamSeasons from '../data/teamSeasons.json'
import { SCHOOLS, SCHOOL_META, SCHOOL_COLORS, YEARS, TEAM_METRIC_MAP } from '../data/constants.js'
import useStore from '../store/useStore.js'
import TeamBadge from '../components/shared/TeamBadge.jsx'
import StatCard from '../components/shared/StatCard.jsx'

const SEL = { background: '#13131f', border: '1px solid #1e1e2e', color: '#e2e8f0', borderRadius: 6, padding: '6px 10px', fontSize: 13 }

// Normalize 0-1 within the provided [min, max] range
function norm(v, min, max) {
  if (v == null || max === min) return 0.5
  return Math.max(0, Math.min(1, (v - min) / (max - min)))
}

// Ranges for radar normalization (based on Ivy League typical values)
const RADAR_AXES = [
  { key: 'adjoe',   label: 'Offense',      min: 90,   max: 120, higherBetter: true },
  { key: 'adjde',   label: 'Defense',      min: 95,   max: 120, higherBetter: false },
  { key: 'efg_o',   label: 'Shooting',     min: 44,   max: 58,  higherBetter: true },
  { key: 'tov_d',   label: 'Force TOs',    min: 14,   max: 32,  higherBetter: true },
  { key: 'orb',     label: 'Off Reb',      min: 8,    max: 36,  higherBetter: true },
  { key: 'tempo',   label: 'Tempo',        min: 58,   max: 76,  higherBetter: null },
]

// Simple win probability from net efficiency margin
function predictWinPct(adjoeA, adjdeA, adjoeB, adjdeB) {
  const netA = adjoeA - adjdeA
  const netB = adjoeB - adjdeB
  const diff = netA - netB
  // Logistic scaling: ~10pt net efficiency = ~75% win%
  return 1 / (1 + Math.exp(-diff * 0.12))
}

const FOUR_FACTORS = [
  { key: 'efg_o',  label: 'eFG% (Off)',    higherBetter: true,  fmt: v => v.toFixed(1)+'%' },
  { key: 'efg_d',  label: 'eFG% Allowed',  higherBetter: false, fmt: v => v.toFixed(1)+'%' },
  { key: 'tov_o',  label: 'TOV% (Off)',    higherBetter: false, fmt: v => v.toFixed(1)+'%' },
  { key: 'tov_d',  label: 'TOV% Forced',   higherBetter: true,  fmt: v => v.toFixed(1)+'%' },
  { key: 'orb',    label: 'Off Reb %',     higherBetter: true,  fmt: v => v.toFixed(1)+'%' },
  { key: 'drb',    label: 'Def Reb %',     higherBetter: true,  fmt: v => v.toFixed(1)+'%' },
  { key: 'ftr_o',  label: 'FT Rate (Off)', higherBetter: true,  fmt: v => v.toFixed(1) },
  { key: 'ftr_d',  label: 'FT Rate (Def)', higherBetter: false, fmt: v => v.toFixed(1) },
]

export default function MatchupAnalyzer() {
  const { analyzerTeamA, analyzerTeamB, analyzerYear,
    setAnalyzerTeamA, setAnalyzerTeamB, setAnalyzerYear } = useStore()

  const colorA = SCHOOL_COLORS[analyzerTeamA]
  const colorB = SCHOOL_COLORS[analyzerTeamB]
  const metaA = SCHOOL_META[analyzerTeamA]
  const metaB = SCHOOL_META[analyzerTeamB]

  const seasonA = useMemo(() =>
    teamSeasons.find(s => s.school === analyzerTeamA && s.year === analyzerYear)
  , [analyzerTeamA, analyzerYear])

  const seasonB = useMemo(() =>
    teamSeasons.find(s => s.school === analyzerTeamB && s.year === analyzerYear)
  , [analyzerTeamB, analyzerYear])

  // Radar data — normalize each axis so 1.0 = best possible within Ivy range
  const radarData = useMemo(() => RADAR_AXES.map(ax => {
    const vA = seasonA?.[ax.key]
    const vB = seasonB?.[ax.key]
    const nA = norm(vA, ax.min, ax.max)
    const nB = norm(vB, ax.min, ax.max)
    return {
      axis: ax.label,
      // flip for defense so radar point = better
      A: ax.higherBetter === false ? 1 - nA : nA,
      B: ax.higherBetter === false ? 1 - nB : nB,
    }
  }), [seasonA, seasonB])

  const winPctA = useMemo(() => {
    if (!seasonA || !seasonB) return null
    return predictWinPct(seasonA.adjoe, seasonA.adjde, seasonB.adjoe, seasonB.adjde)
  }, [seasonA, seasonB])

  const netA = seasonA ? (seasonA.adjoe - seasonA.adjde).toFixed(1) : '—'
  const netB = seasonB ? (seasonB.adjoe - seasonB.adjde).toFixed(1) : '—'

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Matchup Analyzer</h1>
        <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>Head-to-head team breakdown · Ivy League Basketball</p>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={SEL} value={analyzerTeamA} onChange={e => setAnalyzerTeamA(e.target.value)}>
          {SCHOOLS.map(s => <option key={s} value={s}>{SCHOOL_META[s].fullName}</option>)}
        </select>
        <span style={{ color: '#4b5563' }}>vs</span>
        <select style={SEL} value={analyzerTeamB} onChange={e => setAnalyzerTeamB(e.target.value)}>
          {SCHOOLS.map(s => <option key={s} value={s}>{SCHOOL_META[s].fullName}</option>)}
        </select>
        <select style={SEL} value={analyzerYear} onChange={e => setAnalyzerYear(+e.target.value)}>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Win probability banner */}
      {winPctA !== null && (
        <div style={{
          background: '#0f0f1a', border: '1px solid #1e1e2e', borderRadius: 12,
          padding: '20px 28px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 24,
        }}>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <TeamBadge school={analyzerTeamA} size="lg" />
            <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800, color: colorA }}>
              {(winPctA * 100).toFixed(0)}%
            </div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>win probability</div>
            <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>Net: {netA > 0 ? '+' : ''}{netA}</div>
          </div>
          <div style={{ color: '#4b5563', fontSize: 20, fontWeight: 700 }}>vs</div>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <TeamBadge school={analyzerTeamB} size="lg" />
            <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800, color: colorB }}>
              {((1 - winPctA) * 100).toFixed(0)}%
            </div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>win probability</div>
            <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>Net: {netB > 0 ? '+' : ''}{netB}</div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24 }}>
        {/* Four Factors */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#a5b4fc', marginBottom: 12 }}>Four Factors Breakdown</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {FOUR_FACTORS.map(f => (
              <StatCard
                key={f.key}
                label={f.label}
                valueA={seasonA?.[f.key]}
                valueB={seasonB?.[f.key]}
                colorA={colorA}
                colorB={colorB}
                higherBetter={f.higherBetter}
                fmt={f.fmt}
              />
            ))}
          </div>

          {/* Efficiency + pace cards */}
          <div style={{ fontSize: 13, fontWeight: 600, color: '#a5b4fc', margin: '20px 0 12px' }}>Efficiency & Pace</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {['adjoe','adjde','tempo'].map(key => {
              const meta = TEAM_METRIC_MAP[key]
              return (
                <StatCard key={key} label={meta.label}
                  valueA={seasonA?.[key]} valueB={seasonB?.[key]}
                  colorA={colorA} colorB={colorB}
                  higherBetter={meta.higherBetter} fmt={meta.fmt} />
              )
            })}
          </div>
        </div>

        {/* Radar chart */}
        <div style={{ background: '#0f0f1a', border: '1px solid #1e1e2e', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#a5b4fc', marginBottom: 12 }}>Profile Radar</div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
            <span style={{ fontSize: 11, color: colorA }}>● {metaA.abbr}</span>
            <span style={{ fontSize: 11, color: colorB }}>● {metaB.abbr}</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={radarData} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
              <PolarGrid stroke="#1e1e2e" />
              <PolarAngleAxis dataKey="axis" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <Radar name={metaA.abbr} dataKey="A" stroke={colorA} fill={colorA} fillOpacity={0.18} strokeWidth={2} />
              <Radar name={metaB.abbr} dataKey="B" stroke={colorB} fill={colorB} fillOpacity={0.18} strokeWidth={2} />
              <Tooltip
                contentStyle={{ background: '#13131f', border: '1px solid #1e1e2e', borderRadius: 8, fontSize: 12 }}
                formatter={v => [(v * 100).toFixed(0) + ' (normalized)', '']}
              />
            </RadarChart>
          </ResponsiveContainer>
          <div style={{ fontSize: 11, color: '#4b5563', textAlign: 'center', marginTop: 4 }}>
            Normalized within Ivy League range. Outer = better.
          </div>
        </div>
      </div>
    </div>
  )
}
