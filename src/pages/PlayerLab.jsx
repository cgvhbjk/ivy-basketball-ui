import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
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
import PageConclusions from '../components/shared/PageConclusions.jsx'
import { T, CARD, SEL, BTN } from '../styles/theme.js'
import {
  parseHeightIn, classYearNum, broadPositionGroup,
  generateTrainingPlan, generatePlayerRoleSummary,
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
  // year === null means use allPlayers as-is (already pre-filtered by caller)
  const pool = year === null
    ? allPlayers.filter(p => p.min_pg >= 8 && p.pos_type)
    : allPlayers.filter(p => p.year === year && p.min_pg >= 8 && p.pos_type)
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

const PRIORITY_COLORS = { Critical: '#ef4444', High: '#f97316', Medium: '#f59e0b', Maintenance: '#10b981' }

// higherBetter: true = higher wins, false = lower wins, null = neutral (no color coding)
const STAT_HB = {
  pts: true, treb: true, ast: true, stl: true, blk: true,
  ortg: true, efg: true, ts_pct: true, ft_pct: true,
  ftr: null, usg: null, ast_pct: true, drtg: false, or_pct: true, bpm: true,
}

function statColorFor(key, myVal, otherVal, myColor) {
  const hb = STAT_HB[key]
  if (hb == null || myVal == null || otherVal == null) return T.text
  return (hb ? myVal > otherVal + 0.01 : myVal < otherVal - 0.01) ? myColor : T.textMd
}

const COMPARE_STATS = [
  { key: 'pts',     label: 'Points/G',   higherBetter: true,  fmt: v => v.toFixed(1) },
  { key: 'treb',    label: 'Rebounds/G', higherBetter: true,  fmt: v => v.toFixed(1) },
  { key: 'ast',     label: 'Assists/G',  higherBetter: true,  fmt: v => v.toFixed(1) },
  { key: 'stl',     label: 'Steals/G',   higherBetter: true,  fmt: v => v.toFixed(1) },
  { key: 'blk',     label: 'Blocks/G',   higherBetter: true,  fmt: v => v.toFixed(1) },
  { key: 'efg',     label: 'eFG%',       higherBetter: true,  fmt: v => v.toFixed(1) + '%' },
  { key: 'ts_pct',  label: 'TS%',        higherBetter: true,  fmt: v => v.toFixed(1) + '%' },
  { key: 'ortg',    label: 'Off Rating', higherBetter: true,  fmt: v => v.toFixed(0) },
  { key: 'drtg',    label: 'Def Rating', higherBetter: false, fmt: v => v.toFixed(0) },
  { key: 'usg',     label: 'Usage%',     higherBetter: null,  fmt: v => v.toFixed(1) + '%' },
  { key: 'ast_pct', label: 'Assist%',    higherBetter: true,  fmt: v => v.toFixed(1) + '%' },
  { key: 'bpm',     label: 'BPM',        higherBetter: true,  fmt: v => (v > 0 ? '+' : '') + v.toFixed(2) },
  { key: 'min_pg',  label: 'Min/G',      higherBetter: null,  fmt: v => v.toFixed(1) },
]

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

// NBA Draft Combine target ranges by position (25th–75th pctile, 2019–2024 data).
// trainable=true  → affects training plan priority order.
// trainable=false → measured/recorded but not trainable; still shows input & range comparison.
// numericMin/Max used for gap computation.
const NBA_COMBINE_TARGETS = {
  Guard: [
    // Physical measurements — all get input fields; trainable=false means no training plan boost
    { key: 'height_no_shoes', label: 'Height (No Shoes)', range: "6'1\"–6'4\"",  unit: 'in',   group: 'physical', trainable: false, numericMin: 73,   numericMax: 76,   higherBetter: null, note: 'Height without shoes measured at combine' },
    { key: 'wingspan',        label: 'Wingspan',          range: "6'4\"–6'8\"",  unit: 'in',   group: 'physical', trainable: false, numericMin: 76,   numericMax: 80,   higherBetter: true, note: 'Wingspan-to-height ratio critical for perimeter D' },
    { key: 'standing_reach',  label: 'Standing Reach',    range: "7'9\"–8'0\"",  unit: 'in',   group: 'physical', trainable: false, numericMin: 93.5, numericMax: 96.5, higherBetter: true, note: 'Two-hand standing reach; predictor of shot-contest range' },
    { key: 'hand_length',     label: 'Hand Length',       range: '8.0"–8.75"',   unit: 'in',   group: 'physical', trainable: false, numericMin: 8.0,  numericMax: 8.75, higherBetter: null, note: 'Tip of middle finger to base of palm' },
    // Body composition — trainable
    { key: 'weight',       label: 'Weight',        range: '185–200 lbs', unit: 'lbs',  group: 'composition', trainable: true, numericMin: 185,  numericMax: 200,  higherBetter: null,  planArea: 'Lean Mass & Strength Base', note: 'Lean athletic build; sufficient mass to absorb contact' },
    { key: 'body_fat_pct', label: 'Body Fat %',    range: '5–10%',       unit: '%',   group: 'composition', trainable: true, numericMin: 5,    numericMax: 10,   higherBetter: false, planArea: 'Lean Mass & Strength Base', note: 'Lower body fat at same weight = more functional mass' },
    { key: 'bench_reps',   label: 'Bench Press',   range: '5–12 reps',   unit: 'reps',group: 'composition', trainable: true, numericMin: 5,    numericMax: 12,   higherBetter: true,  planArea: 'Lean Mass & Strength Base', note: '185 lbs max reps — upper-body endurance, not 1RM' },
    // Athletic testing — trainable
    { key: 'max_vert',     label: 'Max Vertical',  range: '33.5"–38.5"', unit: 'in',  group: 'athletic',    trainable: true, numericMin: 33.5, numericMax: 38.5, higherBetter: true,  planArea: 'Lower Body Power',                      note: 'Running-start leap — primary explosion marker' },
    { key: 'no_step_vert', label: 'No-Step Vert',  range: '28"–33"',     unit: 'in',  group: 'athletic',    trainable: true, numericMin: 28,   numericMax: 33,   higherBetter: true,  planArea: 'Lower Body Power',                      note: 'Standing two-foot vertical — raw lower-body power' },
    { key: 'lane_agility', label: 'Lane Agility',  range: '10.75–11.3 s',unit: 's',   group: 'athletic',    trainable: true, numericMin: 10.75,numericMax: 11.3, higherBetter: false, planArea: 'Lateral Agility & Change of Direction', note: 'Standard NBA agility circuit — lower is faster' },
    { key: 'sprint_34',    label: '¾ Court Sprint',range: '3.10–3.30 s', unit: 's',   group: 'athletic',    trainable: true, numericMin: 3.10, numericMax: 3.30, higherBetter: false, planArea: 'Linear Speed',                          note: 'Straight-line speed — transition threat potential' },
  ],
  Forward: [
    { key: 'height_no_shoes', label: 'Height (No Shoes)', range: "6'6\"–6'9\"",  unit: 'in',   group: 'physical', trainable: false, numericMin: 78,   numericMax: 81,   higherBetter: null, note: 'Typical drafted forward range' },
    { key: 'wingspan',        label: 'Wingspan',          range: "6'9\"–7'1\"",  unit: 'in',   group: 'physical', trainable: false, numericMin: 81,   numericMax: 85,   higherBetter: true, note: 'Long wingspan enables switch-everything defense' },
    { key: 'standing_reach',  label: 'Standing Reach',    range: "8'2\"–8'7\"",  unit: 'in',   group: 'physical', trainable: false, numericMin: 98,   numericMax: 103,  higherBetter: true, note: 'Two-hand reach determines shot-contest window' },
    { key: 'hand_length',     label: 'Hand Length',       range: '8.25"–9.25"',  unit: 'in',   group: 'physical', trainable: false, numericMin: 8.25, numericMax: 9.25, higherBetter: null, note: 'Larger hands improve ball control and touch at rim' },
    { key: 'weight',       label: 'Weight',        range: '210–230 lbs', unit: 'lbs',  group: 'composition', trainable: true, numericMin: 210,  numericMax: 230,  higherBetter: null,  planArea: 'Upper Body Strength', note: 'Frame strength for physical perimeter play' },
    { key: 'body_fat_pct', label: 'Body Fat %',    range: '6.5–11%',     unit: '%',   group: 'composition', trainable: true, numericMin: 6.5,  numericMax: 11,   higherBetter: false, planArea: 'Upper Body Strength', note: 'Functional mass ratio; lean but physically imposing' },
    { key: 'bench_reps',   label: 'Bench Press',   range: '6–14 reps',   unit: 'reps',group: 'composition', trainable: true, numericMin: 6,    numericMax: 14,   higherBetter: true,  planArea: 'Upper Body Strength', note: '185 lbs reps — frame strength for physical matchups' },
    { key: 'max_vert',     label: 'Max Vertical',  range: '33.5"–38.5"', unit: 'in',  group: 'athletic',    trainable: true, numericMin: 33.5, numericMax: 38.5, higherBetter: true,  planArea: 'Lower Body Power',        note: 'Jump required for above-rim play and defensive contests' },
    { key: 'no_step_vert', label: 'No-Step Vert',  range: '27"–32.5"',   unit: 'in',  group: 'athletic',    trainable: true, numericMin: 27,   numericMax: 32.5, higherBetter: true,  planArea: 'Lower Body Power',        note: 'Two-foot explosiveness for rebounding and post play' },
    { key: 'lane_agility', label: 'Lane Agility',  range: '10.9–11.6 s', unit: 's',   group: 'athletic',    trainable: true, numericMin: 10.9, numericMax: 11.6, higherBetter: false, planArea: 'Multi-Directional Agility', note: 'Modern wings must guard 1–4; this is the test' },
    { key: 'sprint_34',    label: '¾ Court Sprint',range: '3.20–3.40 s', unit: 's',   group: 'athletic',    trainable: true, numericMin: 3.20, numericMax: 3.40, higherBetter: false, planArea: 'Linear Speed',             note: 'Fast-break wing speed and closeout recovery' },
  ],
  Big: [
    { key: 'height_no_shoes', label: 'Height (No Shoes)', range: "6'9\"–7'1\"",  unit: 'in',   group: 'physical', trainable: false, numericMin: 81,   numericMax: 85,   higherBetter: null, note: 'Typical drafted big/center range' },
    { key: 'wingspan',        label: 'Wingspan',          range: "7'0\"–7'6\"",  unit: 'in',   group: 'physical', trainable: false, numericMin: 84,   numericMax: 90,   higherBetter: true, note: 'Wingspan is the primary rim protection predictor' },
    { key: 'standing_reach',  label: 'Standing Reach',    range: "8'7\"–9'2\"",  unit: 'in',   group: 'physical', trainable: false, numericMin: 103,  numericMax: 110,  higherBetter: true, note: 'High reach dramatically extends block and lob window' },
    { key: 'hand_length',     label: 'Hand Length',       range: '8.75"–9.75"',  unit: 'in',   group: 'physical', trainable: false, numericMin: 8.75, numericMax: 9.75, higherBetter: null, note: 'Larger hands improve post touch and ball security' },
    { key: 'weight',       label: 'Weight',        range: '230–260 lbs', unit: 'lbs',  group: 'composition', trainable: true, numericMin: 230,  numericMax: 260,  higherBetter: null,  planArea: 'Upper Body Strength & Mass', note: 'Mass for interior positioning and contact absorption' },
    { key: 'body_fat_pct', label: 'Body Fat %',    range: '7.5–14%',     unit: '%',   group: 'composition', trainable: true, numericMin: 7.5,  numericMax: 14,   higherBetter: false, planArea: 'Upper Body Strength & Mass', note: 'Excessive fat hurts mobility; functional mass preferred' },
    { key: 'bench_reps',   label: 'Bench Press',   range: '10–18 reps',  unit: 'reps',group: 'composition', trainable: true, numericMin: 10,   numericMax: 18,   higherBetter: true,  planArea: 'Upper Body Strength & Mass', note: '185 lbs reps — scouts weight this heavily for bigs' },
    { key: 'max_vert',     label: 'Max Vertical',  range: '29.5"–36"',   unit: 'in',  group: 'athletic',    trainable: true, numericMin: 29.5, numericMax: 36,   higherBetter: true,  planArea: 'Lower Body Power',           note: 'Explosiveness for shot-blocking and offensive boards' },
    { key: 'no_step_vert', label: 'No-Step Vert',  range: '25"–30.5"',   unit: 'in',  group: 'athletic',    trainable: true, numericMin: 25,   numericMax: 30.5, higherBetter: true,  planArea: 'Lower Body Power',           note: 'Two-foot leap for interior positioning and post work' },
    { key: 'lane_agility', label: 'Lane Agility',  range: '11.3–12.2 s', unit: 's',   group: 'athletic',    trainable: true, numericMin: 11.3, numericMax: 12.2, higherBetter: false, planArea: 'Hip Mobility & Foot Speed',  note: 'Foot speed determines hedge recovery and drop coverage' },
    { key: 'sprint_34',    label: '¾ Court Sprint',range: '3.30–3.55 s', unit: 's',   group: 'athletic',    trainable: true, numericMin: 3.30, numericMax: 3.55, higherBetter: false, planArea: 'Lower Body Power',           note: 'Transition defense sprint speed from the 5 position' },
  ],
}

// Returns gap display info for any metric that has numericMin/Max.
// trainable=false → neutral range display (no red/green urgency).
// trainable=true  → full color-coded gap display tied to training plan priority.
function getCombineGap(inputVal, def) {
  if (def?.numericMin == null || inputVal === '' || inputVal == null) return null
  const v = parseFloat(inputVal)
  if (isNaN(v)) return null

  if (!def.trainable) {
    // Non-trainable: show whether the measurement is within, below, or above typical range
    if (v >= def.numericMin && v <= def.numericMax) return { color: T.accentSoft, icon: '✓', text: 'Within typical range' }
    if (def.higherBetter === true) {
      if (v < def.numericMin) return { color: T.textMd, icon: '▼', text: `${(def.numericMin - v).toFixed(1)} ${def.unit} below typical range` }
      return { color: T.textMd, icon: '▲', text: `${(v - def.numericMax).toFixed(1)} ${def.unit} above typical range` }
    }
    return { color: T.textMd, icon: '—', text: 'Measured' }
  }

  if (def.higherBetter === null) return null
  if (def.higherBetter) {
    if (v < def.numericMin) return { color: T.red,   icon: '▼', text: `${(def.numericMin - v).toFixed(1)} ${def.unit} below target` }
    if (v > def.numericMax) return { color: T.green, icon: '▲', text: `${(v - def.numericMax).toFixed(1)} ${def.unit} above target` }
    return { color: T.green, icon: '✓', text: 'On target' }
  } else {
    if (v > def.numericMax) return { color: T.red,   icon: '▼', text: `${(v - def.numericMax).toFixed(2)} ${def.unit} above target (slower)` }
    if (v < def.numericMin) return { color: T.green, icon: '▲', text: `${(def.numericMin - v).toFixed(2)} ${def.unit} below target (faster)` }
    return { color: T.green, icon: '✓', text: 'On target' }
  }
}

// Standalone component — defined at module level so React never remounts it on re-render.
// If defined inside the training-tab IIFE it gets a new reference every render, losing focus.
function MetricCard({ t, inputVal, onInput, recordedHeightIn, nbaHeightPctile }) {
  const gap = getCombineGap(inputVal, t)
  return (
    <div style={{ background: T.surf2, borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, color: T.textMin, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>
        {t.label}
        {!t.trainable && <span style={{ fontWeight: 400, marginLeft: 4, color: T.textMin }}>· measured</span>}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: T.accentSoft, marginBottom: 8 }}>{t.range}</div>

      {t.key === 'height_no_shoes' && recordedHeightIn && (
        <div style={{ fontSize: 11, color: T.textMd, marginBottom: 8 }}>
          Recorded: <span style={{ fontWeight: 600, color: nbaHeightPctile >= 40 ? T.green : T.amber }}>
            {inchesToFtIn(recordedHeightIn)}
          </span>
          {nbaHeightPctile != null && (
            <span style={{ color: nbaHeightPctile >= 60 ? T.green : nbaHeightPctile >= 40 ? T.amber : T.red, marginLeft: 4 }}>
              ({nbaHeightPctile}th pctile)
            </span>
          )}
        </div>
      )}

      <input
        type="number"
        step="0.1"
        value={inputVal}
        onChange={e => onInput(t.key, e.target.value)}
        placeholder={`Result (${t.unit})`}
        style={{ ...SEL, fontSize: 12, padding: '5px 8px', width: '100%', boxSizing: 'border-box' }}
      />
      {gap && (
        <div style={{ fontSize: 11, color: gap.color, marginTop: 4, fontWeight: 500 }}>
          {gap.icon} {gap.text}
        </div>
      )}
      <div style={{ fontSize: 10, color: T.textMin, lineHeight: 1.5, marginTop: 6 }}>{t.note}</div>
    </div>
  )
}

export default function PlayerLab() {
  const {
    selectedSchool, selectedYear, selectedPlayer, compareSchool, compareYear,
    setSelectedSchool, setSelectedYear, setSelectedPlayer, setCompareSchool, setCompareYear,
  } = usePlayerStore()

  const [tab,              setTab]              = useState('profile')
  const [posYear,          setPosYear]          = useState(0)
  const [combineInputs,    setCombineInputs]    = useState({})
  const [comparePlayerName,setComparePlayerName] = useState(null)

  // localStorage key for a player's combine inputs
  const combineStorageKey = player =>
    player ? `ivy_combine_${player.school}_${player.year}_${player.name}` : null

  // Stable input handler — defined once, never causes MetricCard remounts
  const handleCombineInput = useCallback((key, value) => {
    setCombineInputs(prev => ({ ...prev, [key]: value }))
  }, [])

  const playerKeyRef = useRef(null)

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

  // Reset compare player when the comparison school/year changes
  useEffect(() => { setComparePlayerName(null) }, [compareSchool, compareYear])

  const comparePlayer = useMemo(() =>
    comparePlayerName
      ? comparePlayers.find(p => p.name === comparePlayerName) ?? null
      : null
  , [comparePlayers, comparePlayerName])

  const compareHeightIn = useMemo(() => parseHeightIn(comparePlayer?.height), [comparePlayer])

  const norms = useMemo(() => buildNorms(players, selectedYear), [selectedYear])

  const player = useMemo(() =>
    schoolPlayers.find(p => p.name === selectedPlayer) ?? schoolPlayers[0]
  , [schoolPlayers, selectedPlayer])

  // Persist combine inputs per player — load on player change, save on input change
  useEffect(() => {
    const k = combineStorageKey(player)
    if (!k) { playerKeyRef.current = null; setCombineInputs({}); return }
    if (k !== playerKeyRef.current) {
      playerKeyRef.current = k
      try {
        const saved = localStorage.getItem(k)
        setCombineInputs(saved ? JSON.parse(saved) : {})
      } catch { setCombineInputs({}) }
    } else {
      try {
        const hasValues = Object.values(combineInputs).some(v => v !== '' && v != null)
        if (hasValues) localStorage.setItem(k, JSON.stringify(combineInputs))
        else localStorage.removeItem(k)
      } catch {}
    }
  }, [combineInputs, player?.school, player?.year, player?.name])

  const radarData = useMemo(() => {
    if (!player) return []
    return RADAR_DIMS.map(dim => {
      const { min, max } = norms[dim.key] ?? { min: 0, max: 1 }
      return { axis: dim.label, Player: norm(player[dim.key], min, max, dim.higherBetter) }
    })
  }, [player, norms])

  // Dual radar — same normalization as primary player for a fair overlay
  const dualRadarData = useMemo(() => {
    return RADAR_DIMS.map((dim, i) => {
      const { min, max } = norms[dim.key] ?? { min: 0, max: 1 }
      return {
        axis: dim.label,
        A: radarData[i]?.Player ?? 0,
        B: comparePlayer ? norm(comparePlayer[dim.key], min, max, dim.higherBetter) : null,
      }
    })
  }, [radarData, comparePlayer, norms])

  // Single-player radar for the compare player card (same "Player" key as primary)
  const compareRadarData = useMemo(() => {
    if (!comparePlayer) return []
    return RADAR_DIMS.map(dim => {
      const { min, max } = norms[dim.key] ?? { min: 0, max: 1 }
      return { axis: dim.label, Player: norm(comparePlayer[dim.key], min, max, dim.higherBetter) }
    })
  }, [comparePlayer, norms])

  // posYear === 0 means aggregate all years; otherwise filter to the specific year
  const posBiodata = useMemo(() => {
    const pool = posYear === 0 ? players : players.filter(p => p.year === posYear)
    return positionBreakdownWeighted(pool, null)   // null = don't filter by year inside
  }, [posYear])

  // S&C training plan — re-prioritised dynamically if combine inputs are entered
  const trainingPlan = useMemo(() => generateTrainingPlan(player, combineInputs), [player, combineInputs])

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

  function statRow(label, key, p, vsP, myColor) {
    const v = p?.[key]
    const col = vsP && myColor ? statColorFor(key, v, vsP[key], myColor) : T.text
    return (
      <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${T.border}` }}>
        <GlossaryTooltip metricKey={key}>
          <span style={{ fontSize: 12, color: T.textLow }}>{label}</span>
        </GlossaryTooltip>
        <span style={{ fontSize: 13, fontWeight: 600, color: col }}>{v != null ? fmtStat(v, key) : '—'}</span>
      </div>
    )
  }

  // PageHeader — profile tab shows "Player Lab" title only; stats live in the cards below
  const headerTitle = tab === 'training' && player
    ? `Training Plan — ${player.name}`
    : 'Player Lab'

  const headerSubtitle = tab === 'training' && player
    ? `${SCHOOL_META[selectedSchool].fullName} · ${selectedYear} · ${player.pos_type} · ${broadPositionGroup(player.pos_type)}`
    : 'Ivy League Basketball · 2022–2025'

  const headerStats = []

  const TAB_NAV = (
    <div style={{ display: 'flex', gap: 4 }}>
      {[['profile','Profile'], ['positions','Positions'], ['training','Training Plan']].map(([v, lbl]) => (
        <button key={v} style={BTN(tab === v)} onClick={() => setTab(v)}>{lbl}</button>
      ))}
    </div>
  )

  return (
    <div style={{ background: T.bg, minHeight: '100vh' }}>
      <PageHeader
        title={tab !== 'positions' ? headerTitle : null}
        subtitle={tab !== 'positions' ? headerSubtitle : null}
        stats={tab !== 'positions' ? headerStats : []}
        controls={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {tab !== 'positions' && (
              <>
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
                {tab === 'profile' && (
                  <>
                    <span style={{ fontSize: 12, color: T.textMin, padding: '0 4px', alignSelf: 'center' }}>vs</span>
                    <select style={SEL} value={compareSchool} onChange={e => setCompareSchool(e.target.value)}>
                      {SCHOOLS.map(s => <option key={s} value={s}>{SCHOOL_META[s].fullName}</option>)}
                    </select>
                    <select style={SEL} value={compareYear} onChange={e => setCompareYear(+e.target.value)}>
                      {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <SearchableSelect
                      options={comparePlayers.filter(p => p.min_pg >= 6).map(p => ({ value: p.name, label: p.name }))}
                      value={comparePlayerName ?? ''}
                      onChange={setComparePlayerName}
                      placeholder="Compare player…"
                      style={{ minWidth: 160 }}
                    />
                  </>
                )}
              </>
            )}
            <div style={{ marginLeft: tab !== 'positions' ? 6 : 0 }}>{TAB_NAV}</div>
          </div>
        }
      />

      <div style={{ padding: '0 28px 28px', maxWidth: 1320, margin: '0 auto' }}>

      {/* ── Profile Tab ── */}
      {tab === 'profile' && (
        <div>
          {/* Dual radar — shown at the top spanning both cards when a comparison is active */}
          {player && comparePlayer && (
            <div style={{ ...CARD, marginBottom: 20, padding: '14px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 32, marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: colorA }}>— {player.name}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: colorB }}>— {comparePlayer.name}</span>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={dualRadarData} margin={{ top: 8, right: 30, bottom: 8, left: 30 }}>
                  <PolarGrid stroke={T.border} />
                  <PolarAngleAxis dataKey="axis" tick={{ fill: T.textLow, fontSize: 10 }} />
                  <Radar dataKey="A" stroke={colorA} fill={colorA} fillOpacity={0.18} strokeWidth={2} dot={false} />
                  <Radar dataKey="B" stroke={colorB} fill={colorB} fillOpacity={0.18} strokeWidth={2} dot={false} />
                  <Tooltip
                    contentStyle={{ background: T.surf2, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 11 }}
                    formatter={(v, key) => [(v * 100).toFixed(0) + 'th pctile', key === 'A' ? player.name.split(' ').slice(-1)[0] : comparePlayer.name.split(' ').slice(-1)[0]]}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Side-by-side player cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

            {/* ── Primary player card ── */}
            {player ? (
              <div style={CARD}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, borderBottom: `1px solid ${T.border}`, paddingBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: colorA }}>{player.name}</div>
                    <div style={{ fontSize: 13, color: T.textMd, marginTop: 3 }}>{player.pos_type} · {player.class_yr} · {inchesToFtIn(heightIn)}</div>
                    <div style={{ fontSize: 12, color: T.textMin, marginTop: 2 }}>{player.hometown}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 30, fontWeight: 800, color: statColorFor('pts', player.pts, comparePlayer?.pts, colorA) }}>
                      {player.pts?.toFixed(1)}
                    </div>
                    <div style={{ fontSize: 11, color: T.textLow }}>pts/g · {player.gp} GP · {player.min_pg?.toFixed(1)} mpg</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 18 }}>
                  {[['Height', heightIn ? inchesToFtIn(heightIn) : player.height ?? '—'],['Weight', player.weight_lbs ? player.weight_lbs + ' lbs' : '—'],['Class', player.class_yr ?? '—'],['Exp', classYearNum(player.class_yr) != null ? classYearNum(player.class_yr) + ' yr' : '—']].map(([lbl, val]) => (
                    <div key={lbl} style={{ textAlign: 'center', background: T.surf2, borderRadius: 8, padding: '8px' }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{val}</div>
                      <div style={{ fontSize: 11, color: T.textLow }}>{lbl}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
                  {[['Reb/G','treb'],['Ast/G','ast'],['Stl/G','stl'],['Blk/G','blk']].map(([lbl, key]) => (
                    <div key={key} style={{ textAlign: 'center', background: T.surf2, borderRadius: 8, padding: '10px 6px' }}>
                      <div style={{ fontSize: 17, fontWeight: 700, color: statColorFor(key, player[key], comparePlayer?.[key], colorA) }}>{player[key]?.toFixed(1) ?? '—'}</div>
                      <div style={{ fontSize: 10, color: T.textLow }}>{lbl}</div>
                    </div>
                  ))}
                </div>
                {!comparePlayer && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: T.textLow, marginBottom: 4 }}>vs Ivy League {selectedYear} (min 10 mpg)</div>
                    <ResponsiveContainer width="100%" height={175}>
                      <RadarChart data={radarData} margin={{ top: 4, right: 20, bottom: 4, left: 20 }}>
                        <PolarGrid stroke={T.border} />
                        <PolarAngleAxis dataKey="axis" tick={{ fill: T.textLow, fontSize: 10 }} />
                        <Radar dataKey="Player" stroke={colorA} fill={colorA} fillOpacity={0.22} strokeWidth={2} />
                        <Tooltip contentStyle={{ background: T.surf2, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12 }} formatter={v => [(v * 100).toFixed(0) + 'th pctile', '']} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <Accordion title="Shooting & Efficiency" defaultOpen>
                  {statRow('Off Rating',     'ortg',   player, comparePlayer, colorA)}
                  {statRow('eFG%',           'efg',    player, comparePlayer, colorA)}
                  {statRow('True Shooting%', 'ts_pct', player, comparePlayer, colorA)}
                  {statRow('FT%',            'ft_pct', player, comparePlayer, colorA)}
                  {statRow('FT Rate',        'ftr',    player, comparePlayer, colorA)}
                </Accordion>
                <Accordion title="Playmaking & Role">
                  {statRow('Usage%',    'usg',     player, comparePlayer, colorA)}
                  {statRow('Assist%',   'ast_pct', player, comparePlayer, colorA)}
                  {statRow('Def Rating','drtg',    player, comparePlayer, colorA)}
                  {statRow('Off Reb%',  'or_pct',  player, comparePlayer, colorA)}
                  {statRow('BPM',       'bpm',     player, comparePlayer, colorA)}
                </Accordion>
              </div>
            ) : null}

            {/* ── Compare player card (same format) ── */}
            {comparePlayer ? (
              <div style={CARD}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, borderBottom: `1px solid ${T.border}`, paddingBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: colorB }}>{comparePlayer.name}</div>
                    <div style={{ fontSize: 13, color: T.textMd, marginTop: 3 }}>{comparePlayer.pos_type} · {comparePlayer.class_yr} · {inchesToFtIn(compareHeightIn)}</div>
                    <div style={{ fontSize: 12, color: T.textMin, marginTop: 2 }}>{comparePlayer.hometown}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 30, fontWeight: 800, color: statColorFor('pts', comparePlayer.pts, player?.pts, colorB) }}>
                      {comparePlayer.pts?.toFixed(1)}
                    </div>
                    <div style={{ fontSize: 11, color: T.textLow }}>pts/g · {comparePlayer.gp} GP · {comparePlayer.min_pg?.toFixed(1)} mpg</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 18 }}>
                  {[['Height', compareHeightIn ? inchesToFtIn(compareHeightIn) : comparePlayer.height ?? '—'],['Weight', comparePlayer.weight_lbs ? comparePlayer.weight_lbs + ' lbs' : '—'],['Class', comparePlayer.class_yr ?? '—'],['Exp', classYearNum(comparePlayer.class_yr) != null ? classYearNum(comparePlayer.class_yr) + ' yr' : '—']].map(([lbl, val]) => (
                    <div key={lbl} style={{ textAlign: 'center', background: T.surf2, borderRadius: 8, padding: '8px' }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{val}</div>
                      <div style={{ fontSize: 11, color: T.textLow }}>{lbl}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
                  {[['Reb/G','treb'],['Ast/G','ast'],['Stl/G','stl'],['Blk/G','blk']].map(([lbl, key]) => (
                    <div key={key} style={{ textAlign: 'center', background: T.surf2, borderRadius: 8, padding: '10px 6px' }}>
                      <div style={{ fontSize: 17, fontWeight: 700, color: statColorFor(key, comparePlayer[key], player?.[key], colorB) }}>{comparePlayer[key]?.toFixed(1) ?? '—'}</div>
                      <div style={{ fontSize: 10, color: T.textLow }}>{lbl}</div>
                    </div>
                  ))}
                </div>
                <Accordion title="Shooting & Efficiency" defaultOpen>
                  {statRow('Off Rating',     'ortg',   comparePlayer, player, colorB)}
                  {statRow('eFG%',           'efg',    comparePlayer, player, colorB)}
                  {statRow('True Shooting%', 'ts_pct', comparePlayer, player, colorB)}
                  {statRow('FT%',            'ft_pct', comparePlayer, player, colorB)}
                  {statRow('FT Rate',        'ftr',    comparePlayer, player, colorB)}
                </Accordion>
                <Accordion title="Playmaking & Role">
                  {statRow('Usage%',    'usg',     comparePlayer, player, colorB)}
                  {statRow('Assist%',   'ast_pct', comparePlayer, player, colorB)}
                  {statRow('Def Rating','drtg',    comparePlayer, player, colorB)}
                  {statRow('Off Reb%',  'or_pct',  comparePlayer, player, colorB)}
                  {statRow('BPM',       'bpm',     comparePlayer, player, colorB)}
                </Accordion>
              </div>
            ) : (
              <div style={{ ...CARD, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 14, color: T.textMin, marginBottom: 6 }}>No comparison player</div>
                  <div style={{ fontSize: 12, color: T.textMin }}>Select a player using the "vs" selector in the header</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Positions Tab ── */}
      {tab === 'positions' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: T.textLow }}>Season:</span>
            {[0, ...YEARS].map(y => (
              <button key={y} onClick={() => setPosYear(y)}
                style={{ ...BTN(posYear === y), padding: '5px 12px', fontSize: 12 }}>
                {y === 0 ? 'All Years' : y}
              </button>
            ))}
            <span style={{ fontSize: 12, color: T.textMin, marginLeft: 4 }}>
              · Playing-time weighted averages · min 8 min/g
              {posYear === 0 && <span style={{ color: T.amber }}> · aggregated 2022–2025</span>}
            </span>
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
            <div style={{ fontSize: 13, fontWeight: 600, color: '#a5b4fc', marginBottom: 4 }}>
              Offensive Rating &amp; Scoring by Position Type
              <span style={{ fontSize: 11, fontWeight: 400, color: T.textLow, marginLeft: 8 }}>
                {posYear === 0 ? 'All Years 2022–2025' : posYear}
              </span>
            </div>
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

              {/* NBA Combine Assessment */}
              {(() => {
                const pos = broadPositionGroup(player.pos_type)
                const targets = NBA_COMBINE_TARGETS[pos] ?? []
                const physical     = targets.filter(t => t.group === 'physical')
                const composition  = targets.filter(t => t.group === 'composition')
                const athletic     = targets.filter(t => t.group === 'athletic')
                const hasInputs    = Object.values(combineInputs).some(v => v !== '')
                const filledCount  = Object.values(combineInputs).filter(v => v !== '').length

                // Use the module-level MetricCard — shared props for all cards
                const mcProps = {
                  onInput: handleCombineInput,
                  recordedHeightIn: heightIn,
                  nbaHeightPctile,
                }

                return (
                  <div style={{ marginBottom: 28 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: T.accentSoft }}>NBA Combine Assessment — {pos}</div>
                      {hasInputs && (
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: T.green }}>{filledCount} metric{filledCount !== 1 ? 's' : ''} entered · training plan updated</span>
                          <button onClick={() => setCombineInputs({})}
                            style={{ fontSize: 11, color: T.textMd, background: 'none', border: `1px solid ${T.border}`, borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>
                            Reset
                          </button>
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: T.textLow, marginBottom: 16 }}>
                      25th–75th percentile of {pos}s at the NBA Draft Combine (2019–2024).
                      Enter any measured results — trainable metrics update the S&C program below. Physical metrics are stored for your scouting profile.
                    </div>

                    {/* Physical measurements */}
                    <div style={{ background: T.surf, border: `1px solid ${T.border}`, borderRadius: 10, padding: '14px 18px', marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: T.textMd, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Physical Measurements — enter measured values
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                        {physical.map(t => <MetricCard key={t.key} t={t} inputVal={combineInputs[t.key] ?? ''} {...mcProps} />)}
                      </div>
                    </div>

                    {/* Body composition */}
                    <div style={{ background: T.surf, border: `1px solid ${T.border}`, borderRadius: 10, padding: '14px 18px', marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: T.amber, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Body Composition — enter your results
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                        {composition.map(t => <MetricCard key={t.key} t={t} inputVal={combineInputs[t.key] ?? ''} {...mcProps} />)}
                      </div>
                    </div>

                    {/* Athletic testing */}
                    <div style={{ background: T.surf, border: `1px solid ${T.border}`, borderRadius: 10, padding: '14px 18px', marginBottom: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: T.cyan, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Athletic Testing — enter your results
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                        {athletic.map(t => <MetricCard key={t.key} t={t} inputVal={combineInputs[t.key] ?? ''} {...mcProps} />)}
                      </div>
                    </div>

                    {/* College production vs comparable draftees */}
                    {nbaBenchmarks && (
                      <Accordion title="College Production vs Drafted Comparables" badge={`n=${nbaBenchmarks.n} draftees`}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
                          {[
                            { lbl: 'PPG',  val: player.pts,    target: nbaBenchmarks.avgPpg, unit: '',  higherBetter: true },
                            { lbl: 'eFG%', val: player.efg,    target: nbaBenchmarks.avgEfg, unit: '%', higherBetter: true },
                            { lbl: 'TS%',  val: player.ts_pct, target: nbaBenchmarks.avgTs,  unit: '%', higherBetter: true },
                            { lbl: 'USG%', val: player.usg,    target: nbaBenchmarks.avgUsg, unit: '%', higherBetter: null },
                          ].map(({ lbl, val, target, unit, higherBetter }) => {
                            const gap = (val != null && target != null) ? val - target : null
                            const atTarget = gap == null ? null : higherBetter === true ? gap >= 0 : higherBetter === false ? gap <= 0 : null
                            const col = atTarget === true ? T.green : atTarget === false ? T.red : T.text
                            return (
                              <div key={lbl} style={{ background: T.surf2, borderRadius: 8, padding: '12px' }}>
                                <div style={{ fontSize: 10, color: T.textMin, textTransform: 'uppercase', marginBottom: 6 }}>{lbl}</div>
                                <div style={{ fontSize: 18, fontWeight: 800, color: col }}>{val != null ? val.toFixed(1)+unit : '—'}</div>
                                {target != null && (
                                  <div style={{ marginTop: 4 }}>
                                    <div style={{ fontSize: 11, color: T.textLow }}>Target: <span style={{ color: T.accentSoft, fontWeight: 600 }}>{target.toFixed(1)}{unit}</span></div>
                                    {gap != null && <div style={{ fontSize: 11, color: col, marginTop: 2 }}>{gap >= 0 ? '▲ +' : '▼ '}{gap.toFixed(1)}{unit}</div>}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                        {nbaComparables.length > 0 && (
                          <>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 56px 52px 52px 52px 52px 60px', gap: 2, marginBottom: 4, padding: '0 8px' }}>
                              {['Player / Pick', 'Year', 'Ht', 'Wt', 'PPG', 'TS%', 'School'].map(h => (
                                <div key={h} style={{ fontSize: 9, color: T.textMin, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</div>
                              ))}
                            </div>
                            {nbaComparables.map(p => (
                              <div key={p.name + p.draft_year}
                                style={{ display: 'grid', gridTemplateColumns: '1fr 56px 52px 52px 52px 52px 60px', gap: 2, padding: '8px', borderRadius: 6, background: T.bgDeep, marginBottom: 3 }}>
                                <div>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{p.name}</div>
                                  <div style={{ fontSize: 10, color: T.textMin }}>{p.round === 1 ? `R1 #${p.draft_pick}` : `R2 #${p.draft_pick}`}</div>
                                </div>
                                <div style={{ fontSize: 12, color: T.textLow, display: 'flex', alignItems: 'center' }}>{p.draft_year}</div>
                                <div style={{ fontSize: 12, color: T.textMd,  display: 'flex', alignItems: 'center' }}>{inchesToFtIn(p.height_in)}</div>
                                <div style={{ fontSize: 12, color: T.textMd,  display: 'flex', alignItems: 'center' }}>{p.weight_lbs ? p.weight_lbs+'lb' : '—'}</div>
                                <div style={{ fontSize: 12, display: 'flex', alignItems: 'center',
                                  color: p.college_ppg != null && nbaBenchmarks?.avgPpg != null && p.college_ppg >= nbaBenchmarks.avgPpg ? T.green : T.textMd }}>
                                  {p.college_ppg?.toFixed(1) ?? '—'}
                                </div>
                                <div style={{ fontSize: 12, display: 'flex', alignItems: 'center',
                                  color: p.college_ts_pct != null && nbaBenchmarks?.avgTs != null && p.college_ts_pct >= nbaBenchmarks.avgTs ? T.green : T.textMd }}>
                                  {p.college_ts_pct != null ? p.college_ts_pct.toFixed(0)+'%' : '—'}
                                </div>
                                <div style={{ fontSize: 11, color: T.textMin, display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
                                  {p.college ?? 'Overseas'}
                                </div>
                              </div>
                            ))}
                            <div style={{ fontSize: 10, color: T.textMin, marginTop: 8 }}>College stats from public records · approximate</div>
                          </>
                        )}
                      </Accordion>
                    )}
                  </div>
                )
              })()}

              {/* S&C Training Program */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.accentSoft }}>
                  S&amp;C Program — {broadPositionGroup(player.pos_type)}
                </div>
                {Object.values(combineInputs).some(v => v !== '') && (
                  <span style={{ fontSize: 11, color: T.cyan }}>↕ Re-ordered by combine gap</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: T.textLow, marginBottom: 16 }}>
                Position-specific program from NBA Draft Combine benchmarks.
                Enter combine results above to automatically re-prioritise the modules below.
              </div>
              {trainingPlan.length === 0 ? (
                <div style={{ fontSize: 13, color: T.textMin }}>No program available for this position.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {trainingPlan.map((rec, i) => {
                    const displayPriority = rec.effectivePriority ?? rec.priority
                    const pColor = PRIORITY_COLORS[displayPriority] ?? T.textMd
                    const changed = rec.effectivePriority && rec.effectivePriority !== rec.priority
                    return (
                      <div key={i} style={{ background: T.surf, border: `1px solid ${pColor}33`, borderRadius: 10, padding: '18px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: pColor }}>{rec.area}</span>
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                            background: pColor + '22', color: pColor }}>
                            {rec.phase}
                          </span>
                          <span style={{ fontSize: 10, color: T.textMin }}>
                            {displayPriority} priority
                            {changed && <span style={{ color: pColor, marginLeft: 4 }}>↑ boosted</span>}
                          </span>
                        </div>
                        {rec.gapNote && (
                          <div style={{ fontSize: 11, color: pColor, background: pColor + '11', borderRadius: 6,
                            padding: '6px 10px', marginBottom: 10, fontWeight: 500 }}>
                            ⚡ {rec.gapNote}
                          </div>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
                          <div style={{ background: T.surf2, borderRadius: 8, padding: '10px 12px' }}>
                            <div style={{ fontSize: 10, color: T.textMin, textTransform: 'uppercase', marginBottom: 5 }}>Combine Target</div>
                            <div style={{ fontSize: 12, color: T.accentSoft, fontWeight: 600, lineHeight: 1.4 }}>{rec.target}</div>
                          </div>
                          <div style={{ background: T.surf2, borderRadius: 8, padding: '10px 12px' }}>
                            <div style={{ fontSize: 10, color: T.textMin, textTransform: 'uppercase', marginBottom: 5 }}>Frequency</div>
                            <div style={{ fontSize: 12, color: T.textMd, lineHeight: 1.4 }}>{rec.frequency}</div>
                          </div>
                        </div>
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 10, color: T.textMin, textTransform: 'uppercase', marginBottom: 5 }}>Protocol</div>
                          <div style={{ fontSize: 12, color: T.text, lineHeight: 1.7, background: T.surf2, borderRadius: 8, padding: '10px 12px' }}>
                            {rec.protocol}
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: T.textMin, lineHeight: 1.6, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
                          {rec.rationale}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: T.textMin }}>Select a player above to view their training plan.</div>
          )}
        </div>
      )}

      {/* ── Tab-aware Page Conclusions ── */}
      {tab === 'profile' && player && (
        <PageConclusions title="Player Takeaways" conclusions={[
          {
            label: 'Role',
            text: `${generatePlayerRoleSummary(player)} — ${player.min_pg?.toFixed(1)} min/g across ${player.gp} games for ${SCHOOL_META[selectedSchool]?.fullName} ${selectedYear}.`,
            color: colorA,
          },
          nbaBenchmarks ? {
            label: 'vs Draftees',
            text: (() => {
              const ppgGap = player.pts != null && nbaBenchmarks.avgPpg != null ? player.pts - nbaBenchmarks.avgPpg : null
              const tsGap  = player.ts_pct != null && nbaBenchmarks.avgTs  != null ? player.ts_pct - nbaBenchmarks.avgTs : null
              const parts  = []
              if (ppgGap != null) parts.push(`PPG ${ppgGap >= 0 ? '+' : ''}${ppgGap.toFixed(1)} vs draftee avg (${nbaBenchmarks.avgPpg?.toFixed(1)})`)
              if (tsGap  != null) parts.push(`TS% ${tsGap  >= 0 ? '+' : ''}${tsGap.toFixed(1)}% vs draftee avg (${nbaBenchmarks.avgTs?.toFixed(1)}%)`)
              const readiness = (ppgGap ?? 0) >= 0 && (tsGap ?? 0) >= 0 ? 'Production is at or above draft-level benchmarks.' : 'Production gaps remain — efficiency improvement is the primary development lever.'
              return parts.join(' · ') + '. ' + readiness
            })(),
            color: (() => {
              const ppgGap = player.pts != null && nbaBenchmarks.avgPpg != null ? player.pts - nbaBenchmarks.avgPpg : 0
              const tsGap  = player.ts_pct != null && nbaBenchmarks.avgTs  != null ? player.ts_pct - nbaBenchmarks.avgTs : 0
              return (ppgGap >= 0 && tsGap >= 0) ? T.green : T.amber
            })(),
          } : null,
          nbaComparables.length > 0 ? {
            label: 'Comparables',
            text: `Closest NBA comp by height + position: ${nbaComparables[0].name} (${nbaComparables[0].round === 1 ? 'R1 #' : 'R2 #'}${nbaComparables[0].draft_pick}, ${nbaComparables[0].draft_year}) — ${inchesToFtIn(nbaComparables[0].height_in)}, ${nbaComparables[0].college_ppg?.toFixed(1) ?? '—'} ppg in college.`,
            color: T.accentSoft,
          } : null,
        ].filter(Boolean)} />
      )}

      {tab === 'positions' && (
        <PageConclusions title="Position Breakdown Takeaways" conclusions={(() => {
          if (!posBiodata.length) return []
          const byOrtg  = [...posBiodata].sort((a, b) => b.ortg - a.ortg)
          const byPts   = [...posBiodata].sort((a, b) => b.pts  - a.pts)
          const byBpm   = [...posBiodata].sort((a, b) => b.bpm  - a.bpm)
          return [
            {
              label: 'Most Efficient',
              text: `${byOrtg[0].pos} leads Ivy ${posYear === 0 ? '(2022–2025 avg)' : posYear} in offensive rating (${byOrtg[0].ortg} ORTG, n=${byOrtg[0].n} players). ${byOrtg[byOrtg.length - 1].pos} posts the lowest at ${byOrtg[byOrtg.length - 1].ortg}.`,
              color: T.accentSoft,
            },
            {
              label: 'Top Scorers',
              text: `${byPts[0].pos} averages the most points per game (${byPts[0].pts} pts/g). Use this to identify where offensive load is concentrated by position type.`,
              color: T.green,
            },
            {
              label: 'BPM Leader',
              text: `${byBpm[0].pos} posts the highest Box Plus/Minus (${byBpm[0].bpm > 0 ? '+' : ''}${byBpm[0].bpm}), suggesting the greatest positive impact relative to replacement. ${byBpm[byBpm.length - 1].pos} (${byBpm[byBpm.length - 1].bpm > 0 ? '+' : ''}${byBpm[byBpm.length - 1].bpm} BPM) lags — a targeting insight for roster construction.`,
              color: T.amber,
            },
          ]
        })()} />
      )}

      {tab === 'training' && player && (
        <PageConclusions title="Training Plan Takeaways" conclusions={(() => {
          if (!trainingPlan.length) return []
          const critical = trainingPlan.filter(r => (r.effectivePriority ?? r.priority) === 'Critical')
          const high     = trainingPlan.filter(r => (r.effectivePriority ?? r.priority) === 'High')
          const items    = []
          if (critical.length) items.push({
            label: 'Critical Gaps',
            text: `${critical.map(r => r.area).join(', ')} — significantly below combine targets. Address before in-season training.`,
            color: T.red,
          })
          if (high.length) items.push({
            label: 'Priority Areas',
            text: `${high.map(r => r.area).join(', ')} — below target range. These should anchor the off-season training block.`,
            color: T.amber,
          })
          items.push({
            label: 'Program',
            text: `${trainingPlan.length}-module ${broadPositionGroup(player.pos_type) ?? ''} program ordered by ${Object.values(combineInputs).some(v => v !== '') ? 'measured combine gaps' : 'standard positional priority'}. Enter combine test results above to personalise module order.`,
            color: T.accentSoft,
          })
          return items
        })()} />
      )}

      </div>{/* end inner padding wrapper */}
    </div>
  )
}
