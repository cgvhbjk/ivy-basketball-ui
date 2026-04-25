import { useMemo, useState, useRef, useEffect } from 'react'
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import players from '../data/players.json'
import nbaCombine from '../data/nbaCombine.json'
import { SCHOOLS, SCHOOL_META, SCHOOL_COLORS, YEARS, PLAYER_METRICS } from '../data/constants.js'
import usePlayerStore from '../store/usePlayerStore.js'
import GlossaryTooltip from '../components/shared/GlossaryTooltip.jsx'
import PageHeader from '../components/shared/PageHeader.jsx'
import Accordion from '../components/shared/Accordion.jsx'
import { T, CARD, SEL, BTN } from '../styles/theme.js'
import {
  parseHeightIn, classYearNum, broadPositionGroup,
  generateTrainingPlan,
  findNBAComparables, computeNBAHeightPercentile, computeNBACollegeBenchmarks,
} from '../utils/insightEngine.js'

function inchesToFtIn(inches) {
  if (inches == null) return '—'
  return `${Math.floor(inches / 12)}'${Math.round(inches % 12)}"`
}

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
  { key: 'pts',  label: 'Scoring',    higherBetter: true  },
  { key: 'treb', label: 'Rebounds',   higherBetter: true  },
  { key: 'ast',  label: 'Playmaking', higherBetter: true  },
  { key: 'efg',  label: 'Shooting',   higherBetter: true  },
  { key: 'drtg', label: 'Defense',    higherBetter: false },
  { key: 'stl',  label: 'Steals',     higherBetter: true  },
]

function positionBreakdownWeighted(allPlayers, year) {
  const pool = allPlayers.filter(p => p.year === year && p.min_pg >= 8 && p.pos_type)
  const groups = {}
  for (const p of pool) {
    const g = p.pos_type
    if (!groups[g]) groups[g] = []
    groups[g].push(p)
  }

  function wAvg(ps, key) {
    const valid = ps.filter(p => p[key] != null && p.min_pg > 0)
    if (!valid.length) return 0
    const total = valid.reduce((s, p) => s + p.min_pg, 0)
    return valid.reduce((s, p) => s + p[key] * p.min_pg, 0) / total
  }

  return Object.entries(groups)
    .map(([pos, ps]) => ({
      pos, n: ps.length,
      pts:  +wAvg(ps, 'pts').toFixed(1),
      ortg: +wAvg(ps, 'ortg').toFixed(1),
      efg:  +wAvg(ps, 'efg').toFixed(1),
      bpm:  +wAvg(ps, 'bpm').toFixed(2),
    }))
    .filter(g => g.n >= 2)
    .sort((a, b) => b.ortg - a.ortg)
}

const PRIORITY_COLORS = { High: '#ef4444', Medium: '#f59e0b', Maintenance: '#10b981' }

function SearchableSelect({ options, value, onChange, placeholder = 'Select…', style = {} }) {
  const [open,   setOpen]   = useState(false)
  const [query,  setQuery]  = useState('')
  const wrapRef = useRef(null)

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return q === '' ? options : options.filter(o => o.label.toLowerCase().includes(q))
  }, [options, query])

  useEffect(() => {
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function select(val) {
    onChange(val)
    setOpen(false)
    setQuery('')
  }

  const selected = options.find(o => o.value === value)

  return (
    <div ref={wrapRef} style={{ position: 'relative', ...style }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          ...SEL, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', userSelect: 'none', gap: 6,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : placeholder}
        </span>
        <span style={{ color: '#6b7280', fontSize: 10, flexShrink: 0 }}>▾</span>
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
          background: '#1a1a1a', border: '1px solid #2c2c2c', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,.5)', overflow: 'hidden', minWidth: 220,
        }}>
          <div style={{ padding: '6px 8px', borderBottom: '1px solid #2c2c2c' }}>
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              onMouseDown={e => e.stopPropagation()}
              placeholder="Search players…"
              style={{ ...SEL, width: '100%', boxSizing: 'border-box', padding: '5px 8px' }}
            />
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto', padding: '4px 0' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '8px 14px', fontSize: 12, color: '#4b5563' }}>No matches</div>
            ) : filtered.map(o => (
              <div
                key={o.value}
                onMouseDown={() => select(o.value)}
                style={{
                  padding: '7px 14px', fontSize: 13, cursor: 'pointer',
                  background: o.value === value ? '#2c2c2c' : 'transparent',
                  color: o.value === value ? '#ebebeb' : '#9ca3af',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#2a2a2a'}
                onMouseLeave={e => e.currentTarget.style.background = o.value === value ? '#2c2c2c' : 'transparent'}
              >
                {o.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Typical NBA Draft Combine target ranges by position group (2019–2024 aggregate)
// Sources: ESPN/NBA.com combine coverage; ranges represent 25th–75th percentile of drafted players
const NBA_COMBINE_TARGETS = {
  Guard: [
    { label: 'Listed Height',    range: "6'1\"–6'5\"",  note: 'Typical drafted guard range' },
    { label: 'Weight',           range: '180–205 lbs',  note: 'Lean, athletic build expected' },
    { label: 'Wingspan',         range: "6'4\"–6'8\"",  note: 'Wingspan-to-height ratio critical for perimeter D' },
    { label: 'Max Vert',         range: '33.0–38.5"',   note: 'Explosion metric scouts track closely' },
    { label: 'Lane Agility',     range: '10.7–11.3 s',  note: 'Lower = faster lateral quickness' },
    { label: '¾ Sprint',         range: '3.10–3.30 s',  note: 'Straight-line speed, transition threat' },
  ],
  Forward: [
    { label: 'Listed Height',    range: "6'6\"–6'9\"",  note: 'Typical drafted wing/forward range' },
    { label: 'Weight',           range: '205–230 lbs',  note: 'Frame strength for physical play' },
    { label: 'Wingspan',         range: "6'9\"–7'1\"",  note: 'Long wingspan enables switch-everything defense' },
    { label: 'Max Vert',         range: '33.5–38.0"',   note: 'Jump required for above-rim play' },
    { label: 'Lane Agility',     range: '10.9–11.5 s',  note: 'Key for guarding multiple positions' },
    { label: '¾ Sprint',         range: '3.20–3.40 s',  note: 'Fast break wing speed' },
  ],
  Big: [
    { label: 'Listed Height',    range: "6'9\"–7'1\"",  note: 'Typical drafted big/center range' },
    { label: 'Weight',           range: '225–260 lbs',  note: 'Mass for interior positioning' },
    { label: 'Wingspan',         range: "7'0\"–7'5\"",  note: 'Wingspan is primary rim protection predictor' },
    { label: 'Max Vert',         range: '30.5–36.0"',   note: 'Explosiveness off two feet for blocks/boards' },
    { label: 'Lane Agility',     range: '11.3–12.0 s',  note: 'Foot speed for drop coverage and hedges' },
    { label: '¾ Sprint',         range: '3.30–3.50 s',  note: 'Transition defense from 5 position' },
  ],
}

export default function PlayerLab() {
  const {
    selectedSchool, selectedYear, selectedPlayer, compareSchool, compareYear,
    setSelectedSchool, setSelectedYear, setSelectedPlayer, setCompareSchool, setCompareYear,
  } = usePlayerStore()

  const [tab, setTab] = useState('profile')

  const colorA = SCHOOL_COLORS[selectedSchool]
  const colorB = SCHOOL_COLORS[compareSchool]

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

  const radarData = useMemo(() => {
    if (!player) return []
    return RADAR_DIMS.map(dim => {
      const { min, max } = norms[dim.key] ?? { min: 0, max: 1 }
      return { axis: dim.label, Player: norm(player[dim.key], min, max, dim.higherBetter) }
    })
  }, [player, norms])

  const posBiodata = useMemo(() => positionBreakdownWeighted(players, selectedYear), [selectedYear])

  // S&C training plan — based on position and combine targets only, not in-game stats
  const trainingPlan = useMemo(() => generateTrainingPlan(player), [player])

  // NBA prospect comparisons
  const nbaComparables = useMemo(() =>
    player ? findNBAComparables(player, nbaCombine, { maxHeightDiff: 2, n: 5 }) : []
  , [player])

  const heightIn = useMemo(() => parseHeightIn(player?.height), [player])

  const nbaHeightPctile = useMemo(() => {
    const pos = broadPositionGroup(player?.pos_type)
    return (heightIn && pos) ? computeNBAHeightPercentile(heightIn, pos, nbaCombine) : null
  }, [heightIn, player])

  const nbaBenchmarks = useMemo(() => {
    const pos = broadPositionGroup(player?.pos_type)
    return pos ? computeNBACollegeBenchmarks(pos, nbaCombine) : null
  }, [player])

  function handleSchoolChange(school) {
    setSelectedSchool(school)
  }

  function handleYearChange(year) {
    setSelectedYear(+year)
  }

  const fmtStat = (v, key) => {
    const m = PLAYER_METRICS.find(pm => pm.key === key)
    return v != null ? (m?.fmt ? m.fmt(v) : v.toFixed(1)) : '—'
  }

  function statRow(label, key, p) {
    const v = p?.[key]
    return (
      <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #2c2c2c' }}>
        <GlossaryTooltip metricKey={key}>
          <span style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
        </GlossaryTooltip>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#ebebeb' }}>{v != null ? fmtStat(v, key) : '—'}</span>
      </div>
    )
  }

  // Build PageHeader KPI stats for the selected player
  const headerStats = useMemo(() => {
    if (!player) return []
    return [
      { label: 'Points/G',   value: player.pts?.toFixed(1),               color: colorA },
      { label: 'Rebounds/G', value: player.treb?.toFixed(1) },
      { label: 'Assists/G',  value: player.ast?.toFixed(1) },
      { label: 'eFG%',       value: player.efg != null ? player.efg.toFixed(1)+'%' : null },
      { label: 'BPM',        value: player.bpm != null ? (player.bpm > 0 ? '+' : '') + player.bpm.toFixed(2) : null,
        color: player.bpm > 0 ? T.green : player.bpm < 0 ? T.red : T.textMd },
      { label: 'Min/G',      value: player.min_pg?.toFixed(1) },
    ]
  }, [player, colorA])

  return (
    <div style={{ background: T.bg, minHeight: '100vh' }}>
      <PageHeader
        title={player ? player.name : 'Player Lab'}
        subtitle={player
          ? `${SCHOOL_META[selectedSchool].fullName} · ${selectedYear} · ${player.pos_type} · ${player.class_yr}${player.weight_lbs ? ` · ${inchesToFtIn(heightIn)} · ${player.weight_lbs} lbs` : ` · ${inchesToFtIn(heightIn)}`}`
          : 'Individual player analysis · Ivy League Basketball · 2022–2025'}
        stats={headerStats}
        controls={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Selectors */}
            <select style={SEL} value={selectedSchool} onChange={e => handleSchoolChange(e.target.value)}>
              {SCHOOLS.map(s => <option key={s} value={s}>{SCHOOL_META[s].fullName}</option>)}
            </select>
            <select style={SEL} value={selectedYear} onChange={e => handleYearChange(e.target.value)}>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <SearchableSelect
              options={schoolPlayers.map(p => ({ value: p.name, label: p.name }))}
              value={player?.name ?? ''}
              onChange={setSelectedPlayer}
              style={{ minWidth: 160 }}
            />
            {/* Tab nav */}
            <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
              {[['profile','Profile'], ['positions','Positions'], ['training','Training Plan']].map(([v, lbl]) => (
                <button key={v} style={BTN(tab === v)} onClick={() => setTab(v)}>{lbl}</button>
              ))}
            </div>
          </div>
        }
      />

      <div style={{ padding: '0 28px 28px', maxWidth: 1320, margin: '0 auto' }}>

      {/* ── Profile Tab ── */}
      {tab === 'profile' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* Left — player card */}
          <div>

            {player && (
              <div style={CARD}>
                {/* Player header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, borderBottom: '1px solid #2c2c2c', paddingBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: colorA }}>{player.name}</div>
                    <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 3 }}>
                      {player.pos_type} · {player.class_yr} · {inchesToFtIn(heightIn)}
                    </div>
                    <div style={{ fontSize: 12, color: '#4b5563', marginTop: 2 }}>{player.hometown}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 30, fontWeight: 800, color: '#ebebeb' }}>{player.pts?.toFixed(1)}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>pts/g · {player.gp} GP · {player.min_pg?.toFixed(1)} mpg</div>
                  </div>
                </div>

                {/* Biodata strip */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 18 }}>
                  {[
                    ['Height',  heightIn ? inchesToFtIn(heightIn) : player.height ?? '—'],
                    ['Weight',  player.weight_lbs ? player.weight_lbs + ' lbs' : '—'],
                    ['Class',   player.class_yr ?? '—'],
                    ['Exp',     classYearNum(player.class_yr) != null ? classYearNum(player.class_yr) + ' yr' : '—'],
                  ].map(([lbl, val]) => (
                    <div key={lbl} style={{ textAlign: 'center', background: '#1a1a1a', borderRadius: 8, padding: '8px' }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#ebebeb' }}>{val}</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>{lbl}</div>
                    </div>
                  ))}
                </div>

                {/* Primary counting stats — always visible */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
                  {[['Reb/G','treb'],['Ast/G','ast'],['Stl/G','stl'],['Blk/G','blk']].map(([lbl, key]) => (
                    <div key={key} style={{ textAlign: 'center', background: T.surf2, borderRadius: 8, padding: '10px 6px' }}>
                      <div style={{ fontSize: 17, fontWeight: 700, color: T.text }}>{player[key]?.toFixed(1) ?? '—'}</div>
                      <div style={{ fontSize: 10, color: T.textLow }}>{lbl}</div>
                    </div>
                  ))}
                </div>

                {/* Radar — primary visual, always visible */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: T.textLow, marginBottom: 4 }}>
                    vs Ivy League {selectedYear} (min 10 mpg)
                  </div>
                  <ResponsiveContainer width="100%" height={175}>
                    <RadarChart data={radarData} margin={{ top: 4, right: 20, bottom: 4, left: 20 }}>
                      <PolarGrid stroke={T.border} />
                      <PolarAngleAxis dataKey="axis" tick={{ fill: T.textLow, fontSize: 10 }} />
                      <Radar dataKey="Player" stroke={colorA} fill={colorA} fillOpacity={0.22} strokeWidth={2} />
                      <Tooltip
                        contentStyle={{ background: T.surf2, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12 }}
                        formatter={v => [(v * 100).toFixed(0) + 'th pctile', '']}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>

                {/* Accordion: Shooting & Efficiency */}
                <Accordion title="Shooting & Efficiency" defaultOpen>
                  {statRow('Off Rating',     'ortg',   player)}
                  {statRow('eFG%',           'efg',    player)}
                  {statRow('True Shooting%', 'ts_pct', player)}
                  {statRow('FT%',            'ft_pct', player)}
                  {statRow('FT Rate',        'ftr',    player)}
                </Accordion>

                {/* Accordion: Playmaking & Role */}
                <Accordion title="Playmaking & Role">
                  {statRow('Usage%',    'usg',     player)}
                  {statRow('Assist%',   'ast_pct', player)}
                  {statRow('Def Rating','drtg',    player)}
                  {statRow('Off Reb%',  'or_pct',  player)}
                  {statRow('BPM',       'bpm',     player)}
                </Accordion>
              </div>
            )}
          </div>

          {/* Right — compare roster table */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#a5b4fc', marginBottom: 10 }}>Compare Against Roster</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <select style={SEL} value={compareSchool} onChange={e => setCompareSchool(e.target.value)}>
                {SCHOOLS.map(s => <option key={s} value={s}>{SCHOOL_META[s].fullName}</option>)}
              </select>
              <select style={SEL} value={compareYear} onChange={e => setCompareYear(+e.target.value)}>
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            <div style={{ background: '#111111', border: '1px solid #2c2c2c', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 44px 44px 44px 52px 56px', background: '#0c0c0c' }}>
                {['Player / Pos', 'PTS', 'REB', 'AST', 'eFG%', 'BPM'].map(h => (
                  <div key={h} style={{ padding: '9px 10px', fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #2c2c2c' }}>
                    {h}
                  </div>
                ))}
              </div>
              {comparePlayers.filter(p => p.min_pg >= 6).map(p => {
                const htIn = parseHeightIn(p.height)
                return (
                  <div key={p.name + p.year} style={{ display: 'grid', gridTemplateColumns: '1fr 44px 44px 44px 52px 56px', borderBottom: '1px solid #0e0e0e' }}>
                    <div style={{ padding: '8px 10px', fontSize: 12, color: colorB, fontWeight: 500 }}>
                      <div>{p.name}</div>
                      <div style={{ fontSize: 10, color: '#4b5563' }}>{p.pos_type} · {p.class_yr} · {htIn ? inchesToFtIn(htIn) : p.height} · {p.min_pg?.toFixed(0)}m</div>
                    </div>
                    {[p.pts, p.treb, p.ast].map((v, i) => (
                      <div key={i} style={{ padding: '8px 10px', fontSize: 13, color: '#ebebeb', textAlign: 'right', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                        {v?.toFixed(1) ?? '—'}
                      </div>
                    ))}
                    <div style={{ padding: '8px 10px', fontSize: 13, color: '#ebebeb', textAlign: 'right', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                      {p.efg?.toFixed(1) ?? '—'}
                    </div>
                    <div style={{ padding: '8px 10px', fontSize: 13, textAlign: 'right', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                      color: p.bpm != null ? (p.bpm >= 0 ? '#10b981' : '#ef4444') : '#4b5563' }}>
                      {p.bpm != null ? (p.bpm > 0 ? '+' : '') + p.bpm.toFixed(1) : '—'}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Positions Tab ── */}
      {tab === 'positions' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#6b7280' }}>Season:</span>
            <select style={SEL} value={selectedYear} onChange={e => setSelectedYear(+e.target.value)}>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <span style={{ fontSize: 12, color: '#4b5563', marginLeft: 8 }}>Playing-time weighted averages · min 8 min/g</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginBottom: 28 }}>
            {posBiodata.map(g => (
              <div key={g.pos} style={{ background: '#111111', border: '1px solid #2c2c2c', borderRadius: 10, padding: '16px 18px' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#a5b4fc', marginBottom: 4 }}>{g.pos}</div>
                <div style={{ fontSize: 11, color: '#4b5563', marginBottom: 12 }}>n={g.n} players</div>
                {[
                  ['Pts/G',  g.pts],
                  ['ORTG',   g.ortg],
                  ['eFG%',   g.efg + '%'],
                  ['BPM',    g.bpm > 0 ? '+' + g.bpm : g.bpm],
                ].map(([lbl, val]) => (
                  <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #2c2c2c' }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{lbl}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#ebebeb' }}>{val}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div style={{ background: '#111111', border: '1px solid #2c2c2c', borderRadius: 12, padding: '20px 24px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#a5b4fc', marginBottom: 4 }}>Offensive Rating &amp; Scoring by Position Type</div>
            <div style={{ fontSize: 11, color: '#4b5563', marginBottom: 16 }}>
              <span style={{ color: '#6366f1' }}>■</span> ORTG (left axis) &nbsp;
              <span style={{ color: '#10b981' }}>■</span> Pts/G (right axis)
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={posBiodata} margin={{ top: 4, right: 48, bottom: 40, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
                <XAxis dataKey="pos" tick={{ fill: '#6b7280', fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis yAxisId="left"  tick={{ fill: '#6b7280', fontSize: 11 }} domain={['auto', 'auto']} width={48} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: '#6b7280', fontSize: 11 }} domain={[0, 'auto']} width={40} />
                <Tooltip
                  contentStyle={{ background: '#1a1a1a', border: '1px solid #2c2c2c', borderRadius: 8, fontSize: 12 }}
                  formatter={(v, name) => [v.toFixed(1), name]}
                />
                <Bar yAxisId="left"  dataKey="ortg" name="ORTG"  fill="#6366f1" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar yAxisId="right" dataKey="pts"  name="Pts/G" fill="#10b981" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Training Plan Tab ── */}
      {tab === 'training' && (
        <div>
          {/* Team · Year · Player all on one row */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <select style={SEL} value={selectedSchool} onChange={e => handleSchoolChange(e.target.value)}>
              {SCHOOLS.map(s => <option key={s} value={s}>{SCHOOL_META[s].fullName}</option>)}
            </select>
            <select style={SEL} value={selectedYear} onChange={e => handleYearChange(e.target.value)}>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <SearchableSelect
              options={schoolPlayers.map(p => ({ value: p.name, label: p.name }))}
              value={player?.name ?? ''}
              onChange={setSelectedPlayer}
              style={{ minWidth: 180 }}
            />
          </div>

          {player ? (
            <div>
              {/* Player header */}
              <div style={{ ...CARD, marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: colorA }}>{player.name}</div>
                    <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>
                      {player.pos_type} · {player.class_yr} · {inchesToFtIn(heightIn)}{player.weight_lbs ? ` · ${player.weight_lbs} lbs` : ''} · {player.min_pg?.toFixed(1)} mpg
                    </div>
                    <div style={{ fontSize: 12, color: '#4b5563', marginTop: 2 }}>Broad position: {broadPositionGroup(player.pos_type) ?? 'Unknown'}</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, minWidth: 240 }}>
                    {[['Pts/G', player.pts], ['ORTG', player.ortg], ['eFG%', player.efg != null ? player.efg+'%' : '—']].map(([lbl, val]) => (
                      <div key={lbl} style={{ textAlign: 'center', background: '#1a1a1a', borderRadius: 8, padding: '8px' }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#ebebeb' }}>{typeof val === 'number' ? val.toFixed(1) : val}</div>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>{lbl}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* NBA Combine Targets */}
              {(() => {
                const pos = broadPositionGroup(player.pos_type)
                const targets = NBA_COMBINE_TARGETS[pos]
                return (
                  <div style={{ marginBottom: 28 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#a5b4fc', marginBottom: 4 }}>
                      NBA Combine Targets — {pos}
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
                      Ranges represent the 25th–75th percentile of {pos}s measured at the NBA Draft Combine (2019–2024).
                      These are the physical and athletic benchmarks scouts use to evaluate next-level readiness.
                    </div>

                    {/* Physical combine targets */}
                    {targets && (
                      <div style={{ background: '#111111', border: '1px solid #2c2c2c', borderRadius: 10, padding: '14px 18px', marginBottom: 14 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#ebebeb', marginBottom: 12 }}>Physical Combine Targets</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                          {targets.map(t => {
                            const isHeight = t.label === 'Listed Height'
                            const isWeight = t.label === 'Weight'
                            const playerVal = isHeight
                              ? (heightIn ? inchesToFtIn(heightIn) : null)
                              : isWeight
                              ? (player.weight_lbs ? `${player.weight_lbs} lbs` : null)
                              : null
                            return (
                              <div key={t.label} style={{ background: '#1a1a1a', borderRadius: 8, padding: '12px 14px' }}>
                                <div style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{t.label}</div>
                                <div style={{ fontSize: 15, fontWeight: 700, color: '#6366f1', marginBottom: 4 }}>{t.range}</div>
                                {isHeight && playerVal && (
                                  <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>
                                    You: <span style={{ fontWeight: 600, color: nbaHeightPctile >= 40 ? '#10b981' : '#f59e0b' }}>{playerVal}</span>
                                    {' '}
                                    <span style={{ fontSize: 11, color: nbaHeightPctile >= 60 ? '#10b981' : nbaHeightPctile >= 40 ? '#f59e0b' : '#ef4444' }}>
                                      ({nbaHeightPctile != null ? `${nbaHeightPctile}th pctile` : '—'})
                                    </span>
                                  </div>
                                )}
                                {isWeight && playerVal && (
                                  <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>
                                    You: <span style={{ fontWeight: 600, color: '#ebebeb' }}>{playerVal}</span>
                                  </div>
                                )}
                                {!isHeight && !isWeight && (
                                  <div style={{ fontSize: 11, color: '#4b5563', marginBottom: 4 }}>Not measured at college level</div>
                                )}
                                {(isWeight && !playerVal) && (
                                  <div style={{ fontSize: 11, color: '#4b5563', marginBottom: 4 }}>No weight on record</div>
                                )}
                                <div style={{ fontSize: 10, color: '#374151', lineHeight: 1.5 }}>{t.note}</div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* College efficiency targets — what comparable draftees put up */}
                    {nbaBenchmarks && (
                      <div style={{ background: '#111111', border: '1px solid #2c2c2c', borderRadius: 10, padding: '14px 18px', marginBottom: 14 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#ebebeb', marginBottom: 4 }}>College Production Targets</div>
                        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12 }}>
                          Average college stats put up by drafted {pos}s with US college experience (n={nbaBenchmarks.n}).
                          Green = at or above target. These are the numbers scouts expect.
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                          {[
                            { lbl: 'PPG',  val: player.pts,    target: nbaBenchmarks.avgPpg, unit: '',  higherBetter: true },
                            { lbl: 'eFG%', val: player.efg,    target: nbaBenchmarks.avgEfg, unit: '%', higherBetter: true },
                            { lbl: 'TS%',  val: player.ts_pct, target: nbaBenchmarks.avgTs,  unit: '%', higherBetter: true },
                            { lbl: 'USG%', val: player.usg,    target: nbaBenchmarks.avgUsg, unit: '%', higherBetter: null },
                          ].map(({ lbl, val, target, unit, higherBetter }) => {
                            const gap = (val != null && target != null) ? val - target : null
                            const atTarget = gap == null ? null : higherBetter === true ? gap >= 0 : higherBetter === false ? gap <= 0 : null
                            const statColor = atTarget === true ? '#10b981' : atTarget === false ? '#ef4444' : '#ebebeb'
                            return (
                              <div key={lbl} style={{ background: '#1a1a1a', borderRadius: 8, padding: '12px' }}>
                                <div style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', marginBottom: 6 }}>{lbl}</div>
                                <div style={{ fontSize: 18, fontWeight: 800, color: statColor }}>
                                  {val != null ? val.toFixed(1) + unit : '—'}
                                </div>
                                {target != null && (
                                  <div style={{ marginTop: 4 }}>
                                    <div style={{ fontSize: 11, color: '#6b7280' }}>Target: <span style={{ color: '#6366f1', fontWeight: 600 }}>{target.toFixed(1)}{unit}</span></div>
                                    {gap != null && (
                                      <div style={{ fontSize: 11, color: statColor, marginTop: 2 }}>
                                        {gap >= 0 ? '▲ +' : '▼ '}{gap.toFixed(1)}{unit} {atTarget === true ? '✓' : atTarget === false ? 'gap' : ''}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Comparable draft profiles */}
                    <div style={{ background: '#111111', border: '1px solid #2c2c2c', borderRadius: 10, padding: '14px 18px', marginBottom: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#ebebeb', marginBottom: 4 }}>Comparable Draft Profiles</div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12 }}>
                        NBA draftees matching this player's position ({pos}) within ±2" height. Use their college numbers as concrete production targets.
                      </div>
                      {nbaComparables.length === 0 ? (
                        <div style={{ fontSize: 12, color: '#4b5563' }}>No matching prospects within ±2" in the 2019–2024 dataset.</div>
                      ) : (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 56px 52px 52px 52px 52px 60px', gap: 2, marginBottom: 4, padding: '0 8px' }}>
                            {['Player / Pick', 'Year', 'Ht', 'Wt', 'PPG', 'TS%', 'School'].map(h => (
                              <div key={h} style={{ fontSize: 9, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</div>
                            ))}
                          </div>
                          {nbaComparables.map(p => (
                            <div key={p.name + p.draft_year}
                              style={{ display: 'grid', gridTemplateColumns: '1fr 56px 52px 52px 52px 52px 60px', gap: 2, padding: '8px', borderRadius: 6, background: '#0e0e0e', marginBottom: 3 }}>
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#ebebeb' }}>{p.name}</div>
                                <div style={{ fontSize: 10, color: '#4b5563' }}>{p.round === 1 ? `R1 #${p.draft_pick}` : `R2 #${p.draft_pick}`}</div>
                              </div>
                              <div style={{ fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center' }}>{p.draft_year}</div>
                              <div style={{ fontSize: 12, color: '#9ca3af', display: 'flex', alignItems: 'center' }}>{inchesToFtIn(p.height_in)}</div>
                              <div style={{ fontSize: 12, color: '#9ca3af', display: 'flex', alignItems: 'center' }}>{p.weight_lbs ? p.weight_lbs+'lb' : '—'}</div>
                              <div style={{ fontSize: 12, display: 'flex', alignItems: 'center',
                                color: p.college_ppg != null && nbaBenchmarks?.avgPpg != null && p.college_ppg >= nbaBenchmarks.avgPpg ? '#10b981' : '#9ca3af' }}>
                                {p.college_ppg?.toFixed(1) ?? '—'}
                              </div>
                              <div style={{ fontSize: 12, display: 'flex', alignItems: 'center',
                                color: p.college_ts_pct != null && nbaBenchmarks?.avgTs != null && p.college_ts_pct >= nbaBenchmarks.avgTs ? '#10b981' : '#9ca3af' }}>
                                {p.college_ts_pct != null ? p.college_ts_pct.toFixed(0)+'%' : '—'}
                              </div>
                              <div style={{ fontSize: 11, color: '#4b5563', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
                                {p.college ?? 'Overseas'}
                              </div>
                            </div>
                          ))}
                          <div style={{ fontSize: 10, color: '#374151', marginTop: 8 }}>
                            College stats from public records · approximate · verify on Basketball Reference
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* S&C Training Program */}
              <div style={{ fontSize: 14, fontWeight: 600, color: '#a5b4fc', marginBottom: 4 }}>
                Strength &amp; Conditioning Program — {broadPositionGroup(player.pos_type)}
              </div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
                Position-specific S&C targets derived from NBA Draft Combine benchmarks (2019–2024).
                Focus on physical development — not in-game statistics.
              </div>
              {trainingPlan.length === 0 ? (
                <div style={{ fontSize: 13, color: '#4b5563' }}>No program available for this position.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {trainingPlan.map((rec, i) => (
                    <div key={i} style={{ background: '#111111', border: `1px solid ${PRIORITY_COLORS[rec.priority] ?? '#2c2c2c'}33`, borderRadius: 10, padding: '18px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: PRIORITY_COLORS[rec.priority] ?? '#9ca3af' }}>{rec.area}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                          background: (PRIORITY_COLORS[rec.priority] ?? '#6b7280') + '22',
                          color: PRIORITY_COLORS[rec.priority] ?? '#6b7280' }}>
                          {rec.phase}
                        </span>
                        <span style={{ fontSize: 10, color: '#4b5563' }}>{rec.priority} priority</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
                        <div style={{ background: '#1a1a1a', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', marginBottom: 5 }}>Combine Target</div>
                          <div style={{ fontSize: 12, color: '#6366f1', fontWeight: 600, lineHeight: 1.4 }}>{rec.target}</div>
                        </div>
                        <div style={{ background: '#1a1a1a', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', marginBottom: 5 }}>Frequency</div>
                          <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.4 }}>{rec.frequency}</div>
                        </div>
                      </div>
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', marginBottom: 5 }}>Protocol</div>
                        <div style={{ fontSize: 12, color: '#ebebeb', lineHeight: 1.7, background: '#1a1a1a', borderRadius: 8, padding: '10px 12px' }}>
                          {rec.protocol}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: '#4b5563', lineHeight: 1.6, paddingTop: 8, borderTop: '1px solid #2c2c2c' }}>
                        {rec.rationale}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: T.textMin }}>Select a player above to view their training plan.</div>
          )}
        </div>
      )}

      </div>{/* end inner padding wrapper */}
    </div>
  )
}
