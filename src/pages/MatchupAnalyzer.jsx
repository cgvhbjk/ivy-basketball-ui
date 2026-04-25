import { useMemo, useState } from 'react'
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip } from 'recharts'
import teamSeasons from '../data/teamSeasons.json'
import players from '../data/players.json'
import { SCHOOLS, SCHOOL_META, SCHOOL_COLORS, YEARS, TEAM_METRIC_MAP } from '../data/constants.js'
import useStore from '../store/useStore.js'
import TeamBadge from '../components/shared/TeamBadge.jsx'
import StatCard from '../components/shared/StatCard.jsx'
import PageHeader from '../components/shared/PageHeader.jsx'
import Accordion from '../components/shared/Accordion.jsx'
import { T } from '../styles/theme.js'
import { getCoach } from '../data/coachMeta.js'
import {
  classifyOffScheme, classifyDefScheme,
  comparePositionProfiles, generateMatchupInsights, generatePlayerRoleSummary,
  parseHeightIn, buildPositionWeightedAggregates, dataQualityCheck,
  classifySchemeFromRoster, computeTeamArchetype,
  computePositionPhysicalImpact,
} from '../utils/insightEngine.js'
import games   from '../data/games.json'

const SEL = { background: '#1a1a1a', border: '1px solid #2c2c2c', color: '#ebebeb', borderRadius: 6, padding: '6px 10px', fontSize: 13 }
const CARD = { background: '#111111', border: '1px solid #2c2c2c', borderRadius: 12, padding: '20px 24px' }
const SECTION_TITLE = { fontSize: 13, fontWeight: 600, color: '#a5b4fc', marginBottom: 12 }

function norm(v, min, max) {
  if (v == null || max === min) return 0.5
  return Math.max(0, Math.min(1, (v - min) / (max - min)))
}

const RADAR_AXES = [
  { key: 'adjoe',  label: 'Offense',   min: 90,  max: 120, higherBetter: true  },
  { key: 'adjde',  label: 'Defense',   min: 95,  max: 120, higherBetter: false },
  { key: 'efg_o',  label: 'Shooting',  min: 44,  max: 58,  higherBetter: true  },
  { key: 'tov_d',  label: 'Force TOs', min: 14,  max: 32,  higherBetter: true  },
  { key: 'orb',    label: 'Off Reb',   min: 8,   max: 36,  higherBetter: true  },
  { key: 'tempo',  label: 'Tempo',     min: 58,  max: 76,  higherBetter: null  },
]

const FOUR_FACTORS = [
  { key: 'efg_o', label: 'eFG% (Off)',    higherBetter: true,  fmt: v => v.toFixed(1)+'%' },
  { key: 'efg_d', label: 'eFG% Allowed',  higherBetter: false, fmt: v => v.toFixed(1)+'%' },
  { key: 'tov_o', label: 'TOV% (Off)',    higherBetter: false, fmt: v => v.toFixed(1)+'%' },
  { key: 'tov_d', label: 'TOV% Forced',   higherBetter: true,  fmt: v => v.toFixed(1)+'%' },
  { key: 'orb',   label: 'Off Reb %',     higherBetter: true,  fmt: v => v.toFixed(1)+'%' },
  { key: 'drb',   label: 'Def Reb %',     higherBetter: true,  fmt: v => v.toFixed(1)+'%' },
  { key: 'ftr_o', label: 'FT Rate (Off)', higherBetter: true,  fmt: v => v.toFixed(1) },
  { key: 'ftr_d', label: 'FT Rate (Def)', higherBetter: false, fmt: v => v.toFixed(1) },
]

const physImpact = computePositionPhysicalImpact(games, players)

function predictWinPct(adjoeA, adjdeA, adjoeB, adjdeB) {
  const diff = (adjoeA - adjdeA) - (adjoeB - adjdeB)
  return 1 / (1 + Math.exp(-diff * 0.12))
}

function inchesToFtIn(inches) {
  if (inches == null) return '—'
  return `${Math.floor(inches / 12)}'${Math.round(inches % 12)}"`
}

function DiffBadge({ value, unit = '', invert = false }) {
  if (value == null) return <span style={{ color: '#4b5563', fontSize: 12 }}>—</span>
  const positive = invert ? value < 0 : value > 0
  const color = value === 0 ? '#6b7280' : positive ? '#10b981' : '#ef4444'
  const sign  = value > 0 ? '+' : ''
  return (
    <span style={{ color, fontWeight: 700, fontSize: 13 }}>{sign}{value}{unit}</span>
  )
}

function NotablePlayerCard({ player, teamColor }) {
  if (!player) return null
  const heightIn = parseHeightIn(player.height)
  const role = generatePlayerRoleSummary(player)
  return (
    <div style={{ background: '#1a1a1a', borderRadius: 8, padding: '12px 14px', border: `1px solid ${teamColor}22` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: teamColor }}>{player.name}</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>{player.pos_type} · {player.class_yr} · {heightIn ? inchesToFtIn(heightIn) : player.height}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#ebebeb' }}>{player.pts?.toFixed(1)}</div>
          <div style={{ fontSize: 10, color: '#4b5563' }}>pts/g</div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8, fontStyle: 'italic' }}>{role}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
        {[['REB', player.treb], ['AST', player.ast], ['eFG', player.efg != null ? player.efg.toFixed(0)+'%' : '—'], ['BPM', player.bpm != null ? (player.bpm > 0 ? '+' : '') + player.bpm.toFixed(1) : '—']].map(([lbl, val]) => (
          <div key={lbl} style={{ textAlign: 'center', background: '#0e0e0e', borderRadius: 4, padding: '4px 0' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#ebebeb' }}>{val?.toFixed ? val.toFixed(1) : val}</div>
            <div style={{ fontSize: 9, color: '#4b5563' }}>{lbl}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function MatchupAnalyzer() {
  const {
    analyzerTeamA, analyzerTeamB, analyzerYearA, analyzerYearB,
    setAnalyzerTeamA, setAnalyzerTeamB, setAnalyzerYearA, setAnalyzerYearB,
  } = useStore()

  const [activeSection, setActiveSection] = useState('overview')

  const colorA = SCHOOL_COLORS[analyzerTeamA]
  const colorB = SCHOOL_COLORS[analyzerTeamB]
  const metaA  = SCHOOL_META[analyzerTeamA]
  const metaB  = SCHOOL_META[analyzerTeamB]

  const seasonA = useMemo(() =>
    teamSeasons.find(s => s.school === analyzerTeamA && s.year === analyzerYearA)
  , [analyzerTeamA, analyzerYearA])

  const seasonB = useMemo(() =>
    teamSeasons.find(s => s.school === analyzerTeamB && s.year === analyzerYearB)
  , [analyzerTeamB, analyzerYearB])

  const squadA = useMemo(() =>
    players.filter(p => p.school === analyzerTeamA && p.year === analyzerYearA && p.min_pg >= 5)
      .sort((a, b) => b.min_pg - a.min_pg)
  , [analyzerTeamA, analyzerYearA])

  const squadB = useMemo(() =>
    players.filter(p => p.school === analyzerTeamB && p.year === analyzerYearB && p.min_pg >= 5)
      .sort((a, b) => b.min_pg - a.min_pg)
  , [analyzerTeamB, analyzerYearB])

  const coachA = useMemo(() => getCoach(analyzerTeamA, analyzerYearA), [analyzerTeamA, analyzerYearA])
  const coachB = useMemo(() => getCoach(analyzerTeamB, analyzerYearB), [analyzerTeamB, analyzerYearB])

  const schemeOffA = useMemo(() => seasonA ? classifyOffScheme(seasonA) : '—', [seasonA])
  const schemeOffB = useMemo(() => seasonB ? classifyOffScheme(seasonB) : '—', [seasonB])
  const schemeDefA = useMemo(() => seasonA ? classifyDefScheme(seasonA) : '—', [seasonA])
  const schemeDefB = useMemo(() => seasonB ? classifyDefScheme(seasonB) : '—', [seasonB])

  const posCompare = useMemo(() =>
    comparePositionProfiles(squadA, squadB)
  , [squadA, squadB])

  const posAggA = useMemo(() => buildPositionWeightedAggregates(squadA), [squadA])
  const posAggB = useMemo(() => buildPositionWeightedAggregates(squadB), [squadB])

  const rosterSchemeA = useMemo(() => classifySchemeFromRoster(seasonA, squadA), [seasonA, squadA])
  const rosterSchemeB = useMemo(() => classifySchemeFromRoster(seasonB, squadB), [seasonB, squadB])
  const archetypeA    = useMemo(() => computeTeamArchetype(squadA, seasonA),    [squadA, seasonA])
  const archetypeB    = useMemo(() => computeTeamArchetype(squadB, seasonB),    [squadB, seasonB])

  const matchupInsights = useMemo(() =>
    generateMatchupInsights(seasonA, seasonB, posCompare, schemeOffA, schemeOffB)
  , [seasonA, seasonB, posCompare, schemeOffA, schemeOffB])

  const winPctA = useMemo(() => {
    if (!seasonA || !seasonB) return null
    return predictWinPct(seasonA.adjoe, seasonA.adjde, seasonB.adjoe, seasonB.adjde)
  }, [seasonA, seasonB])

  const radarData = useMemo(() => RADAR_AXES.map(ax => {
    const vA = seasonA?.[ax.key]
    const vB = seasonB?.[ax.key]
    const nA = norm(vA, ax.min, ax.max)
    const nB = norm(vB, ax.min, ax.max)
    return {
      axis: ax.label,
      A: ax.higherBetter === false ? 1 - nA : nA,
      B: ax.higherBetter === false ? 1 - nB : nB,
    }
  }), [seasonA, seasonB])

  const notableA = useMemo(() => squadA.filter(p => p.min_pg >= 10).slice(0, 3), [squadA])
  const notableB = useMemo(() => squadB.filter(p => p.min_pg >= 10).slice(0, 3), [squadB])

  const crossYear = analyzerYearA !== analyzerYearB

  // Win probability KPI stat for header
  const winPctStr   = winPctA !== null ? (winPctA * 100).toFixed(0) + '%' : null
  const netA        = seasonA ? ((seasonA.adjoe - seasonA.adjde) > 0 ? '+' : '') + (seasonA.adjoe - seasonA.adjde).toFixed(1) : null
  const netB        = seasonB ? ((seasonB.adjoe - seasonB.adjde) > 0 ? '+' : '') + (seasonB.adjoe - seasonB.adjde).toFixed(1) : null

  return (
    <div style={{ background: T.bg, minHeight: '100vh' }}>
      <PageHeader
        title={`${metaA.abbr} vs ${metaB.abbr}`}
        subtitle={`${metaA.fullName} ${analyzerYearA} · ${metaB.fullName} ${analyzerYearB} · Head-to-head breakdown`}
        stats={winPctA !== null ? [
          { label: `${metaA.abbr} win probability`, value: winPctStr, color: colorA },
          { label: `${metaB.abbr} win probability`, value: ((1-winPctA)*100).toFixed(0)+'%', color: colorB },
          { label: `${metaA.abbr} Net Eff`,          value: netA,    color: netA?.startsWith('+') ? T.green : T.red },
          { label: `${metaB.abbr} Net Eff`,          value: netB,    color: netB?.startsWith('+') ? T.green : T.red },
          { label: `${metaA.abbr} Record`,           value: seasonA?.record ?? '—' },
          { label: `${metaB.abbr} Record`,           value: seasonB?.record ?? '—' },
        ] : []}
        controls={
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <TeamBadge school={analyzerTeamA} size="sm" showName={false} />
              <select style={SEL} value={analyzerTeamA} onChange={e => setAnalyzerTeamA(e.target.value)}>
                {SCHOOLS.map(s => <option key={s} value={s}>{SCHOOL_META[s].fullName}</option>)}
              </select>
              <select style={SEL} value={analyzerYearA} onChange={e => setAnalyzerYearA(+e.target.value)}>
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <span style={{ color: T.textMin, fontSize: 13, fontWeight: 700 }}>vs</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <TeamBadge school={analyzerTeamB} size="sm" showName={false} />
              <select style={SEL} value={analyzerTeamB} onChange={e => setAnalyzerTeamB(e.target.value)}>
                {SCHOOLS.map(s => <option key={s} value={s}>{SCHOOL_META[s].fullName}</option>)}
              </select>
              <select style={SEL} value={analyzerYearB} onChange={e => setAnalyzerYearB(+e.target.value)}>
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            {crossYear && (
              <span style={{ fontSize: 11, color: T.amber }}>⚠ Cross-year</span>
            )}
          </div>
        }
      />

      <div style={{ padding: '0 28px 28px', maxWidth: 1280, margin: '0 auto' }}>

      {/* Section nav */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {[['overview','Overview'], ['physical','Physical Matchup'], ['positions','Position Breakdown'], ['roster','Depth & Roster'], ['insights','Practice Insights']].map(([v, lbl]) => (
          <button key={v} onClick={() => setActiveSection(v)}
            style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: 'none',
              background: activeSection === v ? '#4f46e5' : '#2c2c2c',
              color: activeSection === v ? '#fff' : '#9ca3af' }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {activeSection === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Coach & Scheme */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[
              { school: analyzerTeamA, year: analyzerYearA, coach: coachA, color: colorA, offScheme: schemeOffA, defScheme: schemeDefA, meta: metaA },
              { school: analyzerTeamB, year: analyzerYearB, coach: coachB, color: colorB, offScheme: schemeOffB, defScheme: schemeDefB, meta: metaB },
            ].map(({ school, year, coach, color, offScheme, defScheme, meta }) => (
              <div key={school} style={{ ...CARD }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, borderBottom: '1px solid #2c2c2c', paddingBottom: 12 }}>
                  <TeamBadge school={school} size="md" showName={false} />
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color }}>{meta.fullName}</div>
                    <div style={{ fontSize: 11, color: '#4b5563' }}>{year}</div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>Head Coach</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#ebebeb', marginBottom: 10 }}>{coach.name}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>Playstyle</div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12, lineHeight: 1.5 }}>{coach.style}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div style={{ background: '#1a1a1a', borderRadius: 6, padding: '8px 10px' }}>
                    <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>OFF SCHEME</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#f59e0b' }}>{offScheme}</div>
                  </div>
                  <div style={{ background: '#1a1a1a', borderRadius: 6, padding: '8px 10px' }}>
                    <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>DEF SCHEME</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#6366f1' }}>{defScheme}</div>
                  </div>
                </div>
                {/* Roster-predicted scheme */}
                {(() => {
                  const rs = school === analyzerTeamA ? rosterSchemeA : rosterSchemeB
                  const at = school === analyzerTeamA ? archetypeA : archetypeB
                  return (
                    <div style={{ marginTop: 10, background: '#0e0e0e', borderRadius: 6, padding: '8px 10px', border: '1px solid #2c2c2c' }}>
                      <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>ROSTER-PREDICTED</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: '#f59e0b' }}>⚡ {rs.offScheme}</span>
                        <span style={{ fontSize: 11, color: '#6366f1' }}>🛡 {rs.defScheme}</span>
                      </div>
                      <div style={{ fontSize: 10, color: '#374151', marginTop: 3 }}>
                        Archetype: <span style={{ color }}>{ at.archetype}</span> · {at.signals[0]}
                      </div>
                    </div>
                  )
                })()}
              </div>
            ))}
          </div>

          {/* Four Factors + Radar */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
            <div>
              <div style={SECTION_TITLE}>Four Factors Breakdown</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {FOUR_FACTORS.map(f => (
                  <StatCard key={f.key} label={f.label}
                    valueA={seasonA?.[f.key]} valueB={seasonB?.[f.key]}
                    colorA={colorA} colorB={colorB}
                    higherBetter={f.higherBetter} fmt={f.fmt} />
                ))}
              </div>
              <div style={{ ...SECTION_TITLE, marginTop: 20 }}>Efficiency &amp; Pace</div>
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

            <div style={CARD}>
              <div style={SECTION_TITLE}>Profile Radar</div>
              <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: colorA }}>● {metaA.abbr}</span>
                <span style={{ fontSize: 11, color: colorB }}>● {metaB.abbr}</span>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <RadarChart data={radarData} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
                  <PolarGrid stroke="#2c2c2c" />
                  <PolarAngleAxis dataKey="axis" tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <Radar name={metaA.abbr} dataKey="A" stroke={colorA} fill={colorA} fillOpacity={0.18} strokeWidth={2} />
                  <Radar name={metaB.abbr} dataKey="B" stroke={colorB} fill={colorB} fillOpacity={0.18} strokeWidth={2} />
                  <Tooltip
                    contentStyle={{ background: '#1a1a1a', border: '1px solid #2c2c2c', borderRadius: 8, fontSize: 12 }}
                    formatter={v => [(v * 100).toFixed(0) + ' (normalized)', '']}
                  />
                </RadarChart>
              </ResponsiveContainer>
              <div style={{ fontSize: 11, color: '#374151', textAlign: 'center', marginTop: 4 }}>
                Normalized within Ivy range · Outer = better
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Physical Matchup ── */}
      {activeSection === 'physical' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={CARD}>
            <div style={SECTION_TITLE}>Position-Level Physical Comparison</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
              Playing-time weighted averages · min 5 min/g · Diff = Team A minus Team B
            </div>

            {/* Headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 80px 1fr 1fr 80px', gap: 8, marginBottom: 8 }}>
              {['POS', metaA.abbr + ' Ht', metaB.abbr + ' Ht', 'DIFF', metaA.abbr + ' Exp', metaB.abbr + ' Exp', 'DIFF'].map((h, i) => (
                <div key={i} style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 8px', borderBottom: '1px solid #2c2c2c' }}>{h}</div>
              ))}
            </div>
            {posCompare.map(row => (
              <div key={row.position} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 80px 1fr 1fr 80px', gap: 8, padding: '6px 0', borderBottom: '1px solid #1a1a1a' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#a5b4fc', padding: '0 8px' }}>{row.position}</div>
                <div style={{ fontSize: 13, color: '#ebebeb', padding: '0 8px' }}>
                  {row.teamA ? `${inchesToFtIn(row.teamA.avgHeightIn)} (${row.teamA.n}p)` : <span style={{ color: '#4b5563' }}>—</span>}
                </div>
                <div style={{ fontSize: 13, color: '#ebebeb', padding: '0 8px' }}>
                  {row.teamB ? `${inchesToFtIn(row.teamB.avgHeightIn)} (${row.teamB.n}p)` : <span style={{ color: '#4b5563' }}>—</span>}
                </div>
                <div style={{ padding: '0 8px' }}>
                  <DiffBadge value={row.diffHeightIn} unit='"' />
                </div>
                <div style={{ fontSize: 13, color: '#ebebeb', padding: '0 8px' }}>
                  {row.teamA?.avgExperience != null ? `${row.teamA.avgExperience} yr` : <span style={{ color: '#4b5563' }}>—</span>}
                </div>
                <div style={{ fontSize: 13, color: '#ebebeb', padding: '0 8px' }}>
                  {row.teamB?.avgExperience != null ? `${row.teamB.avgExperience} yr` : <span style={{ color: '#4b5563' }}>—</span>}
                </div>
                <div style={{ padding: '0 8px' }}>
                  <DiffBadge value={row.diffExperience} unit=' yr' />
                </div>
              </div>
            ))}
          </div>

          {/* Position performance comparison */}
          <div style={CARD}>
            <div style={SECTION_TITLE}>Position-Level Performance (Weighted)</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
              ORTG, eFG%, BPM weighted by minutes played at each position
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 80px 1fr 1fr 80px 1fr 1fr 80px', gap: 6, marginBottom: 8 }}>
              {['POS', metaA.abbr+' ORTG', metaB.abbr+' ORTG', 'Δ', metaA.abbr+' eFG', metaB.abbr+' eFG', 'Δ', metaA.abbr+' BPM', metaB.abbr+' BPM', 'Δ'].map((h, i) => (
                <div key={i} style={{ fontSize: 9, color: '#6b7280', textTransform: 'uppercase', padding: '4px 6px', borderBottom: '1px solid #2c2c2c' }}>{h}</div>
              ))}
            </div>
            {posCompare.map(row => (
              <div key={row.position} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 80px 1fr 1fr 80px 1fr 1fr 80px', gap: 6, padding: '6px 0', borderBottom: '1px solid #1a1a1a' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#a5b4fc', padding: '0 6px' }}>{row.position}</div>
                <div style={{ fontSize: 12, color: colorA, padding: '0 6px' }}>{row.teamA?.avgOrtg ?? '—'}</div>
                <div style={{ fontSize: 12, color: colorB, padding: '0 6px' }}>{row.teamB?.avgOrtg ?? '—'}</div>
                <div style={{ padding: '0 6px' }}><DiffBadge value={row.diffOrtg} /></div>
                <div style={{ fontSize: 12, color: colorA, padding: '0 6px' }}>{row.teamA?.avgEfg != null ? row.teamA.avgEfg+'%' : '—'}</div>
                <div style={{ fontSize: 12, color: colorB, padding: '0 6px' }}>{row.teamB?.avgEfg != null ? row.teamB.avgEfg+'%' : '—'}</div>
                <div style={{ padding: '0 6px' }}>
                  <DiffBadge value={row.teamA?.avgEfg != null && row.teamB?.avgEfg != null ? +(row.teamA.avgEfg - row.teamB.avgEfg).toFixed(1) : null} unit='%' />
                </div>
                <div style={{ fontSize: 12, color: colorA, padding: '0 6px' }}>{row.teamA?.avgBpm != null ? (row.teamA.avgBpm > 0 ? '+' : '') + row.teamA.avgBpm : '—'}</div>
                <div style={{ fontSize: 12, color: colorB, padding: '0 6px' }}>{row.teamB?.avgBpm != null ? (row.teamB.avgBpm > 0 ? '+' : '') + row.teamB.avgBpm : '—'}</div>
                <div style={{ padding: '0 6px' }}><DiffBadge value={row.diffBpm} /></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Position Breakdown ── */}
      {activeSection === 'positions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            Playing-time weighted per-position cards (min 5 mpg) · height, weight, experience, efficiency
          </div>

          {/* Side-by-side position cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {[
              { agg: posAggA, school: analyzerTeamA, year: analyzerYearA, color: colorA, meta: metaA },
              { agg: posAggB, school: analyzerTeamB, year: analyzerYearB, color: colorB, meta: metaB },
            ].map(({ agg, school, year, color, meta }) => {
              const quality = dataQualityCheck(players, school, year)
              return (
                <div key={school}>
                  <div style={{ fontSize: 13, fontWeight: 600, color, marginBottom: 12 }}>{meta.fullName} · {year}</div>
                  {quality.hasWarnings && (
                    <div style={{ marginBottom: 10, padding: '6px 10px', background: '#f59e0b11', border: '1px solid #f59e0b33', borderRadius: 6 }}>
                      {quality.warnings.map((w, i) => (
                        <div key={i} style={{ fontSize: 11, color: '#f59e0b' }}>⚠ {w}</div>
                      ))}
                    </div>
                  )}
                  {['Guard', 'Forward', 'Big'].map(pos => {
                    const g = agg[pos]
                    if (!g) return (
                      <div key={pos} style={{ ...CARD, marginBottom: 8, opacity: 0.4 }}>
                        <div style={{ fontSize: 12, color: '#4b5563' }}>{pos}: no data</div>
                      </div>
                    )
                    return (
                      <div key={pos} style={{ ...CARD, marginBottom: 10, borderLeft: `3px solid ${color}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color }}>{pos}</div>
                            <div style={{ fontSize: 11, color: '#4b5563' }}>{g.n} players · {g.totalMinPg} total min/g</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#ebebeb' }}>{inchesToFtIn(g.avgHeightIn)}</div>
                            <div style={{ fontSize: 10, color: '#6b7280' }}>avg height{g.missingHeight > 0 ? ` (${g.missingHeight} missing)` : ''}</div>
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                          {[
                            ['Wt',  g.avgWeightLbs  != null ? g.avgWeightLbs+'lb' : '—'],
                            ['Exp', g.avgExperience != null ? g.avgExperience+'yr' : '—'],
                            ['ORTG', g.avgOrtg ?? '—'],
                            ['eFG', g.avgEfg != null ? g.avgEfg+'%' : '—'],
                            ['BPM', g.avgBpm != null ? (g.avgBpm > 0 ? '+' : '') + g.avgBpm : '—'],
                          ].map(([lbl, val]) => (
                            <div key={lbl} style={{ background: '#1a1a1a', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#ebebeb' }}>{val}</div>
                              <div style={{ fontSize: 10, color: '#4b5563' }}>{lbl}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>

          {/* Regression-weighted advantage */}
          {physImpact && (() => {
            const c = physImpact.coefficients
            const score = (pos, htKey, wtKey) => {
              const htDiff = (posAggA[pos]?.avgHeightIn  ?? 0) - (posAggB[pos]?.avgHeightIn  ?? 0)
              const wtDiff = (posAggA[pos]?.avgWeightLbs ?? 0) - (posAggB[pos]?.avgWeightLbs ?? 0)
              return htDiff * c[htKey] + wtDiff * c[wtKey]
            }
            const gScore = score('Guard',   'guardHeight', 'guardWeight')
            const fScore = score('Forward', 'fwdHeight',   'fwdWeight')
            const bScore = score('Big',     'bigHeight',   'bigWeight')
            const total  = gScore + fScore + bScore
            const absMax = Math.max(Math.abs(gScore), Math.abs(fScore), Math.abs(bScore), 0.01)
            return (
              <div style={{ ...CARD, marginBottom: 20 }}>
                <div style={{ ...SECTION_TITLE, marginBottom: 4 }}>Regression-Weighted Physical Edge ({metaA.abbr})</div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 14 }}>
                  Estimated pts advantage from physical differentials · R²={physImpact.r2} · n={physImpact.n} Ivy matchups
                </div>
                {[
                  { label: 'Guard',   score: gScore },
                  { label: 'Forward', score: fScore },
                  { label: 'Big/C',   score: bScore },
                ].map(({ label, score: s }) => {
                  const barW = Math.min(Math.abs(s) / absMax * 80, 80)
                  const col  = s > 0.3 ? colorA : s < -0.3 ? colorB : '#6b7280'
                  return (
                    <div key={label} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontSize: 12, color: '#9ca3af' }}>{label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: col }}>
                          {s > 0 ? '+' : ''}{s.toFixed(2)} pts
                        </span>
                      </div>
                      <div style={{ background: '#2c2c2c', borderRadius: 3, height: 7, position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', [s >= 0 ? 'left' : 'right']: '50%', width: barW + '%', height: '100%', background: col, opacity: 0.7 }} />
                        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: '#374151' }} />
                      </div>
                    </div>
                  )
                })}
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #2c2c2c', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>Total physical edge:</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: total > 0.5 ? colorA : total < -0.5 ? colorB : '#6b7280' }}>
                    {total > 0 ? '+' : ''}{total.toFixed(2)} pts
                  </span>
                  <span style={{ fontSize: 11, color: '#4b5563' }}>for {metaA.abbr}</span>
                </div>
              </div>
            )
          })()}

          {/* Diff table */}
          <div style={CARD}>
            <div style={SECTION_TITLE}>
              Head-to-Head Differences (Δ = {metaA.abbr} − {metaB.abbr})
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['Pos', 'Ht A', 'Ht B', 'Ht Δ', 'Wt A', 'Wt B', 'Exp Δ', 'ORTG Δ', 'eFG Δ', 'BPM Δ'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: '#6b7280', fontSize: 10, textTransform: 'uppercase', borderBottom: '1px solid #2c2c2c', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {posCompare.map(row => (
                    <tr key={row.position} style={{ borderBottom: '1px solid #1a1a1a' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: '#a5b4fc' }}>{row.position}</td>
                      <td style={{ padding: '8px 10px', color: colorA }}>{inchesToFtIn(row.teamA?.avgHeightIn)}</td>
                      <td style={{ padding: '8px 10px', color: colorB }}>{inchesToFtIn(row.teamB?.avgHeightIn)}</td>
                      <td style={{ padding: '8px 10px' }}><DiffBadge value={row.diffHeightIn} unit='"' /></td>
                      <td style={{ padding: '8px 10px', color: colorA }}>{posAggA[row.position]?.avgWeightLbs != null ? posAggA[row.position].avgWeightLbs+'lb' : '—'}</td>
                      <td style={{ padding: '8px 10px', color: colorB }}>{posAggB[row.position]?.avgWeightLbs != null ? posAggB[row.position].avgWeightLbs+'lb' : '—'}</td>
                      <td style={{ padding: '8px 10px' }}><DiffBadge value={row.diffExperience} unit=' yr' /></td>
                      <td style={{ padding: '8px 10px' }}><DiffBadge value={row.diffOrtg} /></td>
                      <td style={{ padding: '8px 10px' }}><DiffBadge value={row.teamA?.avgEfg != null && row.teamB?.avgEfg != null ? +(row.teamA.avgEfg - row.teamB.avgEfg).toFixed(1) : null} unit='%' /></td>
                      <td style={{ padding: '8px 10px' }}><DiffBadge value={row.diffBpm} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Depth & Roster ── */}
      {activeSection === 'roster' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {[
            { school: analyzerTeamA, year: analyzerYearA, squad: squadA, color: colorA, meta: metaA, notable: notableA },
            { school: analyzerTeamB, year: analyzerYearB, squad: squadB, color: colorB, meta: metaB, notable: notableB },
          ].map(({ school, squad, color, meta, year, notable }) => (
            <div key={school}>
              <div style={{ fontSize: 14, fontWeight: 700, color, marginBottom: 14 }}>
                {meta.fullName} · {year}
              </div>
              {/* Notable players */}
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Notable Players</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {notable.map(p => (
                  <NotablePlayerCard key={p.name} player={p} teamColor={color} />
                ))}
              </div>

              {/* Depth chart */}
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Depth Chart (by minutes)</div>
              <div style={{ background: '#111111', border: '1px solid #2c2c2c', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 44px 44px 44px 44px 52px', background: '#0c0c0c' }}>
                  {['Player', 'Min', 'Pts', 'Reb', 'Ast', 'eFG%'].map(h => (
                    <div key={h} style={{ padding: '7px 10px', fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #2c2c2c' }}>{h}</div>
                  ))}
                </div>
                {squad.filter(p => p.min_pg >= 6).slice(0, 10).map(p => (
                  <div key={p.name} style={{ display: 'grid', gridTemplateColumns: '1fr 44px 44px 44px 44px 52px', borderBottom: '1px solid #0e0e0e' }}>
                    <div style={{ padding: '7px 10px', fontSize: 12, color }}>
                      <div style={{ fontWeight: 500 }}>{p.name}</div>
                      <div style={{ fontSize: 10, color: '#4b5563' }}>{p.pos_type} · {p.class_yr}</div>
                    </div>
                    {[p.min_pg?.toFixed(0), p.pts?.toFixed(1), p.treb?.toFixed(1), p.ast?.toFixed(1)].map((v, i) => (
                      <div key={i} style={{ padding: '7px 10px', fontSize: 12, color: '#ebebeb', textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>{v ?? '—'}</div>
                    ))}
                    <div style={{ padding: '7px 10px', fontSize: 12, color: '#9ca3af', textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                      {p.efg != null ? p.efg.toFixed(1)+'%' : '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Practice Insights ── */}
      {activeSection === 'insights' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>
            Actionable preparation insights based on statistical matchup analysis
          </div>
          {matchupInsights.length === 0 && (
            <div style={{ color: '#4b5563', fontSize: 13 }}>Select two teams to generate insights.</div>
          )}
          {matchupInsights.map((ins, i) => (
            <div key={i} style={{ background: '#111111', border: '1px solid #2c2c2c', borderRadius: 10, padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 18 }}>{ins.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#a5b4fc' }}>{ins.category}</span>
              </div>
              <div style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.7 }}>{ins.text}</div>
            </div>
          ))}

          {/* Scheme comparison summary */}
          <div style={{ ...CARD, marginTop: 8 }}>
            <div style={SECTION_TITLE}>Scheme Summary</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {[
                { team: analyzerTeamA, meta: metaA, color: colorA, coach: coachA, offScheme: schemeOffA, defScheme: schemeDefA },
                { team: analyzerTeamB, meta: metaB, color: colorB, coach: coachB, offScheme: schemeOffB, defScheme: schemeDefB },
              ].map(({ team, meta, color, coach, offScheme, defScheme }) => (
                <div key={team}>
                  <div style={{ fontSize: 13, fontWeight: 600, color, marginBottom: 10 }}>{meta.abbr}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>Coach</div>
                  <div style={{ fontSize: 12, color: '#ebebeb', marginBottom: 8 }}>{coach.name}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>Offense</div>
                  <div style={{ fontSize: 12, color: '#f59e0b', marginBottom: 2 }}>{offScheme}</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>{coach.style}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>Defense</div>
                  <div style={{ fontSize: 12, color: '#6366f1' }}>{defScheme}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      </div>{/* end inner padding wrapper */}
    </div>
  )
}
