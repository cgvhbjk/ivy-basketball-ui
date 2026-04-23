import { useMemo, useState } from 'react'
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import players from '../data/players.json'
import { SCHOOLS, SCHOOL_META, SCHOOL_COLORS, YEARS, PLAYER_METRICS } from '../data/constants.js'
import usePlayerStore from '../store/usePlayerStore.js'
import { computePowerRatings } from '../utils/powerRating.js'
import teamSeasons from '../data/teamSeasons.json'

const SEL = { background: '#13131f', border: '1px solid #1e1e2e', color: '#e2e8f0', borderRadius: 6, padding: '6px 10px', fontSize: 13 }
const BTN = (active, color = '#4f46e5') => ({
  padding: '5px 11px', borderRadius: 6, fontSize: 12, cursor: 'pointer', border: 'none',
  background: active ? color : '#1e1e2e', color: active ? '#fff' : '#9ca3af',
})

// Normalize player stat to 0–1 across Ivy pool for that year (min 10 min/g)
function buildNorms(allPlayers, year) {
  const pool = allPlayers.filter(p => p.year === year && p.min_pg >= 10)
  const DIMS = ['pts', 'treb', 'ast', 'efg', 'drtg', 'stl']
  const result = {}
  DIMS.forEach(key => {
    const vals = pool.map(p => p[key]).filter(v => v != null)
    result[key] = { min: Math.min(...vals), max: Math.max(...vals) }
  })
  return result
}

function norm(v, min, max, higherBetter) {
  if (v == null || max === min) return 0.5
  const n = (v - min) / (max - min)
  return higherBetter === false ? 1 - n : n
}

const RADAR_DIMS = [
  { key: 'pts',  label: 'Scoring',    higherBetter: true },
  { key: 'treb', label: 'Rebounds',   higherBetter: true },
  { key: 'ast',  label: 'Playmaking', higherBetter: true },
  { key: 'efg',  label: 'Shooting',   higherBetter: true },
  { key: 'drtg', label: 'Defense',    higherBetter: false },
  { key: 'stl',  label: 'Steals',     higherBetter: true },
]

// Position-group statistics: average key metrics per position type in a given year
function positionBreakdown(allPlayers, year) {
  const pool = allPlayers.filter(p => p.year === year && p.min_pg >= 8 && p.pos_type)
  const groups = {}
  for (const p of pool) {
    const g = p.pos_type
    if (!groups[g]) groups[g] = []
    groups[g].push(p)
  }
  return Object.entries(groups)
    .map(([pos, ps]) => ({
      pos,
      n: ps.length,
      pts:  +(ps.reduce((s, p) => s + (p.pts  ?? 0), 0) / ps.length).toFixed(1),
      ortg: +(ps.reduce((s, p) => s + (p.ortg ?? 0), 0) / ps.length).toFixed(1),
      efg:  +(ps.reduce((s, p) => s + (p.efg  ?? 0), 0) / ps.length).toFixed(1),
      bpm:  +(ps.reduce((s, p) => s + (p.bpm  ?? 0), 0) / ps.length).toFixed(2),
    }))
    .filter(g => g.n >= 2)
    .sort((a, b) => b.ortg - a.ortg)
}

// Power ratings computed once from the full dataset
const { ratings: allRatings, coefficients, avgOrtg, avgDrtg, r2 } =
  computePowerRatings(teamSeasons, players)

const prMap = new Map(allRatings.map(r => [`${r.name}||${r.year}`, r]))

export default function PlayerLab() {
  const { selectedSchool, selectedYear, selectedPlayer, compareSchool, compareYear,
    setSelectedSchool, setSelectedYear, setSelectedPlayer, setCompareSchool, setCompareYear } = usePlayerStore()

  const [tab, setTab] = useState('profile')

  const schoolPlayers = useMemo(() =>
    players.filter(p => p.school === selectedSchool && p.year === selectedYear)
      .sort((a, b) => b.min_pg - a.min_pg)
  , [selectedSchool, selectedYear])

  const comparePlayers = useMemo(() =>
    players.filter(p => p.school === compareSchool && p.year === compareYear)
      .sort((a, b) => b.min_pg - a.min_pg)
  , [compareSchool, compareYear])

  const norms = useMemo(() => buildNorms(players, selectedYear), [selectedYear])

  const player = useMemo(() =>
    schoolPlayers.find(p => p.name === selectedPlayer) ?? schoolPlayers[0]
  , [schoolPlayers, selectedPlayer])

  const playerRating = player ? prMap.get(`${player.name}||${player.year}`) : null

  const colorA = SCHOOL_COLORS[selectedSchool]
  const colorB = SCHOOL_COLORS[compareSchool]

  const radarData = useMemo(() => {
    if (!player) return []
    return RADAR_DIMS.map(dim => {
      const { min, max } = norms[dim.key] ?? { min: 0, max: 1 }
      return { axis: dim.label, Player: norm(player[dim.key], min, max, dim.higherBetter) }
    })
  }, [player, norms])

  const posBiodata = useMemo(() => positionBreakdown(players, selectedYear), [selectedYear])

  // Ivy-wide leaderboard for the selected year
  const leaderboard = useMemo(() =>
    allRatings
      .filter(r => r.year === selectedYear)
      .sort((a, b) => b.power_rating - a.power_rating)
      .slice(0, 20)
  , [selectedYear])

  const fmtStat = (v, key) => {
    const m = PLAYER_METRICS.find(pm => pm.key === key)
    return v != null ? (m?.fmt ? m.fmt(v) : v.toFixed(1)) : '—'
  }

  function statRow(label, key, p, extra) {
    const v = p?.[key]
    return (
      <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #1e1e2e' }}>
        <span style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{v != null ? fmtStat(v, key) : '—'}{extra}</span>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Player Lab</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>
            Individual player stats · Ivy League Basketball
            {coefficients && (
              <span style={{ color: '#4b5563' }}> · Power rating R²={r2}</span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['profile','Profile'],['leaderboard','Power Rank'],['positions','Positions']].map(([v, lbl]) => (
            <button key={v} style={BTN(tab === v)} onClick={() => setTab(v)}>{lbl}</button>
          ))}
        </div>
      </div>

      {tab === 'profile' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* Left — player selector + profile */}
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <select style={SEL} value={selectedSchool} onChange={e => setSelectedSchool(e.target.value)}>
                {SCHOOLS.map(s => <option key={s} value={s}>{SCHOOL_META[s].fullName}</option>)}
              </select>
              <select style={SEL} value={selectedYear} onChange={e => setSelectedYear(+e.target.value)}>
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 16 }}>
              {schoolPlayers.map(p => (
                <button key={p.name} style={BTN(player?.name === p.name, colorA)} onClick={() => setSelectedPlayer(p.name)}>
                  {p.name.split(' ').pop()}
                </button>
              ))}
            </div>

            {player && (
              <div style={{ background: '#0f0f1a', border: '1px solid #1e1e2e', borderRadius: 12, padding: '20px 24px' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, borderBottom: '1px solid #1e1e2e', paddingBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: colorA }}>{player.name}</div>
                    <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 3 }}>
                      {player.pos_type} · {player.class_yr} · {player.height}
                    </div>
                    <div style={{ fontSize: 12, color: '#4b5563', marginTop: 2 }}>{player.hometown}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 30, fontWeight: 800, color: '#e2e8f0' }}>{player.pts?.toFixed(1)}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>pts/g · {player.gp} GP · {player.min_pg?.toFixed(1)} mpg</div>
                  </div>
                </div>

                {/* Core counting */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 18 }}>
                  {[['Reb','treb'],['Ast','ast'],['Stl','stl'],['Blk','blk']].map(([lbl, key]) => (
                    <div key={key} style={{ textAlign: 'center', background: '#13131f', borderRadius: 8, padding: '10px 8px' }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0' }}>{player[key]?.toFixed(1) ?? '—'}</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>{lbl}/G</div>
                    </div>
                  ))}
                </div>

                {/* Efficiency */}
                <div style={{ fontSize: 12, fontWeight: 600, color: '#a5b4fc', marginBottom: 8 }}>Efficiency</div>
                {statRow('Off Rating', 'ortg', player)}
                {statRow('Def Rating', 'drtg', player)}
                {statRow('eFG%', 'efg', player)}
                {statRow('True Shooting%', 'ts_pct', player)}
                {statRow('FT%', 'ft_pct', player)}
                {statRow('Usage%', 'usg', player)}

                {/* Power Rating */}
                {playerRating && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#a5b4fc', margin: '14px 0 8px' }}>Power Rating (LS)</div>
                    <div style={{ background: '#13131f', borderRadius: 8, padding: '14px 16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <span style={{ fontSize: 11, color: '#6b7280' }}>Overall</span>
                        <span style={{ fontSize: 22, fontWeight: 800, color: playerRating.power_rating >= 0 ? '#10b981' : '#ef4444' }}>
                          {playerRating.power_rating > 0 ? '+' : ''}{playerRating.power_rating.toFixed(2)}
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>
                          Off component
                          <div style={{ fontSize: 15, fontWeight: 600, color: playerRating.off_component >= 0 ? '#60a5fa' : '#f87171', marginTop: 2 }}>
                            {playerRating.off_component > 0 ? '+' : ''}{playerRating.off_component.toFixed(2)}
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>
                          Def component
                          <div style={{ fontSize: 15, fontWeight: 600, color: playerRating.def_component >= 0 ? '#60a5fa' : '#f87171', marginTop: 2 }}>
                            {playerRating.def_component > 0 ? '+' : ''}{playerRating.def_component.toFixed(2)}
                          </div>
                        </div>
                      </div>
                      {coefficients && (
                        <div style={{ fontSize: 10, color: '#374151', marginTop: 10 }}>
                          β_ortg={coefficients.bOrtg} · β_drtg={coefficients.bDrtg} · weighted by min share
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Radar */}
                <div style={{ marginTop: 18 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#a5b4fc', marginBottom: 6 }}>
                    Profile vs Ivy League {selectedYear}
                  </div>
                  <ResponsiveContainer width="100%" height={190}>
                    <RadarChart data={radarData} margin={{ top: 4, right: 20, bottom: 4, left: 20 }}>
                      <PolarGrid stroke="#1e1e2e" />
                      <PolarAngleAxis dataKey="axis" tick={{ fill: '#6b7280', fontSize: 10 }} />
                      <Radar dataKey="Player" stroke={colorA} fill={colorA} fillOpacity={0.25} strokeWidth={2} />
                      <Tooltip
                        contentStyle={{ background: '#13131f', border: '1px solid #1e1e2e', borderRadius: 8, fontSize: 12 }}
                        formatter={v => [(v * 100).toFixed(0) + 'th pctile', '']}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          {/* Right — compare roster table */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#a5b4fc', marginBottom: 10 }}>Compare Against</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <select style={SEL} value={compareSchool} onChange={e => setCompareSchool(e.target.value)}>
                {SCHOOLS.map(s => <option key={s} value={s}>{SCHOOL_META[s].fullName}</option>)}
              </select>
              <select style={SEL} value={compareYear} onChange={e => setCompareYear(+e.target.value)}>
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            <div style={{ background: '#0f0f1a', border: '1px solid #1e1e2e', borderRadius: 12, overflow: 'hidden' }}>
              {/* Table header */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 44px 44px 44px 52px 56px', background: '#0a0a14' }}>
                {['Player / Pos', 'PTS', 'REB', 'AST', 'eFG%', 'PWR'].map(h => (
                  <div key={h} style={{ padding: '9px 10px', fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #1e1e2e' }}>
                    {h}
                  </div>
                ))}
              </div>
              {/* Rows */}
              {comparePlayers.filter(p => p.min_pg >= 6).map(p => {
                const pr = prMap.get(`${p.name}||${p.year}`)
                return (
                  <div key={p.name + p.year} style={{ display: 'grid', gridTemplateColumns: '1fr 44px 44px 44px 52px 56px', borderBottom: '1px solid #0d0d14' }}>
                    <div style={{ padding: '8px 10px', fontSize: 12, color: colorB, fontWeight: 500 }}>
                      <div>{p.name}</div>
                      <div style={{ fontSize: 10, color: '#4b5563' }}>{p.pos_type} · {p.class_yr} · {p.min_pg?.toFixed(0)}m</div>
                    </div>
                    {[p.pts, p.treb, p.ast].map((v, i) => (
                      <div key={i} style={{ padding: '8px 10px', fontSize: 13, color: '#e2e8f0', textAlign: 'right', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                        {v?.toFixed(1) ?? '—'}
                      </div>
                    ))}
                    <div style={{ padding: '8px 10px', fontSize: 13, color: '#e2e8f0', textAlign: 'right', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                      {p.efg?.toFixed(1) ?? '—'}
                    </div>
                    <div style={{ padding: '8px 10px', fontSize: 13, textAlign: 'right', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', color: pr && pr.power_rating >= 0 ? '#10b981' : '#ef4444' }}>
                      {pr ? (pr.power_rating > 0 ? '+' : '') + pr.power_rating.toFixed(1) : '—'}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {tab === 'leaderboard' && (
        <div style={{ maxWidth: 680 }}>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
            Ivy League power rankings · {selectedYear} · based on lineup-adjusted ORTG/DRTG via least-squares
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <select style={SEL} value={selectedYear} onChange={e => setSelectedYear(+e.target.value)}>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div style={{ background: '#0f0f1a', border: '1px solid #1e1e2e', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px 80px 80px', background: '#0a0a14' }}>
              {['#', 'Player / Team', 'Off', 'Def', 'PWR'].map(h => (
                <div key={h} style={{ padding: '9px 12px', fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #1e1e2e' }}>{h}</div>
              ))}
            </div>
            {leaderboard.map((r, i) => {
              const p = players.find(pl => pl.name === r.name && pl.year === r.year)
              const color = SCHOOL_COLORS[r.school] ?? '#888'
              return (
                <div key={r.name + r.year} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px 80px 80px', borderBottom: '1px solid #13131f' }}>
                  <div style={{ padding: '10px 12px', fontSize: 12, color: '#4b5563', display: 'flex', alignItems: 'center' }}>{i + 1}</div>
                  <div style={{ padding: '10px 12px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: '#4b5563' }}>{SCHOOL_META[r.school]?.abbr} · {p?.pos_type} · {p?.class_yr}</div>
                  </div>
                  <div style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, color: r.off_component >= 0 ? '#60a5fa' : '#f87171', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                    {r.off_component > 0 ? '+' : ''}{r.off_component.toFixed(1)}
                  </div>
                  <div style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, color: r.def_component >= 0 ? '#60a5fa' : '#f87171', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                    {r.def_component > 0 ? '+' : ''}{r.def_component.toFixed(1)}
                  </div>
                  <div style={{ padding: '10px 12px', fontSize: 14, fontWeight: 700, color: r.power_rating >= 0 ? '#10b981' : '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                    {r.power_rating > 0 ? '+' : ''}{r.power_rating.toFixed(2)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'positions' && (
        <div>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
            Average stats by Barttorvik position type · {selectedYear} · min 8 min/g
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <select style={SEL} value={selectedYear} onChange={e => setSelectedYear(+e.target.value)}>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginBottom: 28 }}>
            {posBiodata.map(g => (
              <div key={g.pos} style={{ background: '#0f0f1a', border: '1px solid #1e1e2e', borderRadius: 10, padding: '16px 18px' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#a5b4fc', marginBottom: 4 }}>{g.pos}</div>
                <div style={{ fontSize: 11, color: '#4b5563', marginBottom: 12 }}>n={g.n} players</div>
                {[
                  ['Pts/G', g.pts],
                  ['ORTG', g.ortg],
                  ['eFG%', g.efg + '%'],
                  ['BPM', g.bpm > 0 ? '+' + g.bpm : g.bpm],
                ].map(([lbl, val]) => (
                  <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #1e1e2e' }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{lbl}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{val}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* ORTG + Pts/G bar chart by position — dual Y-axis */}
          <div style={{ background: '#0f0f1a', border: '1px solid #1e1e2e', borderRadius: 12, padding: '20px 24px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#a5b4fc', marginBottom: 4 }}>Offensive Rating &amp; Scoring by Position Type</div>
            <div style={{ fontSize: 11, color: '#4b5563', marginBottom: 16 }}>
              <span style={{ color: '#6366f1' }}>■</span> ORTG (left axis) &nbsp;
              <span style={{ color: '#10b981' }}>■</span> Pts/G (right axis)
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={posBiodata} margin={{ top: 4, right: 48, bottom: 40, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                <XAxis dataKey="pos" tick={{ fill: '#6b7280', fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis yAxisId="left"  tick={{ fill: '#6b7280', fontSize: 11 }} domain={['auto', 'auto']} width={48} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: '#6b7280', fontSize: 11 }} domain={['auto', 'auto']} width={40} />
                <Tooltip
                  contentStyle={{ background: '#13131f', border: '1px solid #1e1e2e', borderRadius: 8, fontSize: 12 }}
                  formatter={(v, name) => [v.toFixed(1), name]}
                />
                <Bar yAxisId="left"  dataKey="ortg" name="ORTG"  fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="right" dataKey="pts"  name="Pts/G" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}

