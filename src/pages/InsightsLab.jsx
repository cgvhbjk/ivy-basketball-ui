import { useMemo, useState } from 'react'
import {
  ComposedChart, Scatter, Line,
  BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import teamSeasons from '../data/teamSeasons.json'
import players from '../data/players.json'
import { SCHOOLS, SCHOOL_META, SCHOOL_COLORS, YEARS, TEAM_METRICS } from '../data/constants.js'
import useInsightStore from '../store/useInsightStore.js'
import GlossaryTooltip from '../components/shared/GlossaryTooltip.jsx'
import PageHeader from '../components/shared/PageHeader.jsx'
import Accordion from '../components/shared/Accordion.jsx'
import { T } from '../styles/theme.js'
import {
  computeRelationship, scoreInsight, timeWindowComparison,
  detectThreshold, generateInsightText, linearRegression, detectStyleInteractions,
  schemeBreakdown, computeBiodataRelationship,
  buildRosterAggregatesWeighted, buildPhysicalMatchupPairs, pearsonCorrelation,
  classifySchemeFromRoster, computeTeamArchetype, ARCHETYPES,
  computeArchetypeMatchupMatrix, computePositionPhysicalImpact,
} from '../utils/insightEngine.js'
import games from '../data/games.json'

const SEL = { background: '#1a1a1a', border: '1px solid #2c2c2c', color: '#ebebeb', borderRadius: 6, padding: '6px 10px', fontSize: 13 }
const BTN = (active, color = '#4f46e5') => ({
  padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
  cursor: 'pointer', border: 'none',
  background: active ? color : '#2c2c2c', color: active ? '#fff' : '#9ca3af',
})
const CARD = { background: '#111111', border: '1px solid #2c2c2c', borderRadius: 12, padding: '16px 20px' }

function ConfidencePill({ confidence }) {
  const colors = { HIGH: '#10b981', MEDIUM: '#f59e0b', LOW: '#ef4444' }
  return (
    <span style={{ background: colors[confidence] + '22', color: colors[confidence], borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
      {confidence}
    </span>
  )
}

const STYLE_KEYS = [
  { key: 'three_rate_o', label: '3-Point Rate' },
  { key: 'tempo',        label: 'Tempo' },
]

function CustomDot({ cx, cy, payload }) {
  return (
    <circle cx={cx} cy={cy} r={5}
      fill={payload?.fill ?? '#6366f1'} fillOpacity={0.85}
      stroke="#0e0e0e" strokeWidth={1} />
  )
}

// ── Correlation Tab ────────────────────────────────────────────────────────────

const METRIC_GROUPS_LIST = [...new Set(TEAM_METRICS.map(m => m.group))]

function CorrelationPanel() {
  const { xVar, yVar, yearRange, savedInsights, setXVar, setYVar, saveInsight, removeInsight } = useInsightStore()
  const [styleKey, setStyleKey]   = useState('three_rate_o')
  const [searchTerm, setSearchTerm] = useState('')

  const { points, correlation, n } = useMemo(() =>
    computeRelationship(teamSeasons, xVar, yVar, { yearRange })
  , [xVar, yVar, yearRange])

  const { valid, confidence, reason } = useMemo(() => scoreInsight(correlation, n), [correlation, n])
  const threshold       = useMemo(() => detectThreshold(teamSeasons, xVar, yVar, yearRange), [xVar, yVar, yearRange])
  const windows         = useMemo(() => timeWindowComparison(teamSeasons, xVar, yVar), [xVar, yVar])
  const styleInteractions = useMemo(() => detectStyleInteractions(teamSeasons, xVar, yVar, styleKey), [xVar, yVar, styleKey])

  const xMeta = TEAM_METRICS.find(m => m.key === xVar)
  const yMeta = TEAM_METRICS.find(m => m.key === yVar)
  const insightText = useMemo(() =>
    generateInsightText(xMeta?.label ?? xVar, yMeta?.label ?? yVar, correlation, n, threshold)
  , [xMeta, yMeta, correlation, n, threshold])

  const coloredPoints = useMemo(() =>
    points.map(p => ({ ...p, fill: SCHOOL_COLORS[p.school] ?? '#6366f1' }))
  , [points])

  const regressionLine = useMemo(() => {
    if (points.length < 3) return []
    const { slope, intercept } = linearRegression(points)
    const xs = points.map(p => p.x)
    const xMin = Math.min(...xs), xMax = Math.max(...xs)
    const pad = (xMax - xMin) * 0.05
    return [
      { x: xMin - pad, y: slope * (xMin - pad) + intercept },
      { x: xMax + pad, y: slope * (xMax + pad) + intercept },
    ]
  }, [points])

  const filteredGroups = useMemo(() => {
    const q = searchTerm.toLowerCase()
    return METRIC_GROUPS_LIST.map(group => ({
      group,
      metrics: TEAM_METRICS.filter(m => m.group === group &&
        (q === '' || m.label.toLowerCase().includes(q) || m.key.includes(q)))
    })).filter(g => g.metrics.length > 0)
  }, [searchTerm])

  function handleSave() {
    saveInsight({
      id: `${xVar}_${yVar}`,
      title: `${xMeta?.label} → ${yMeta?.label}`,
      variable: xVar, targetMetric: yVar,
      correlation, n, confidence,
      strengthScore: Math.abs(correlation),
      threshold, text: insightText,
    })
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 28 }}>
      <div>
        {/* Metric selector with search */}
        <div style={{ ...CARD, marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: '#6b7280' }}>X →</span>
              <select style={SEL} value={xVar} onChange={e => setXVar(e.target.value)}>
                {TEAM_METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: '#6b7280' }}>Y ↑</span>
              <select style={SEL} value={yVar} onChange={e => setYVar(e.target.value)}>
                {TEAM_METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </div>
          </div>

          {/* Metric browser — collapsed by default */}
          <Accordion title="Browse all metrics" badge={`${TEAM_METRICS.length} metrics`}>
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Filter metrics..."
              style={{ ...SEL, width: '100%', boxSizing: 'border-box', marginBottom: 12 }}
            />
            {filteredGroups.map(({ group, metrics }) => (
              <div key={group} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>{group}</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {metrics.map(m => (
                    <GlossaryTooltip key={m.key} metricKey={m.key}>
                      <button
                        style={{ ...BTN(xVar === m.key || yVar === m.key, xVar === m.key ? '#6366f1' : '#059669'), fontSize: 11, padding: '3px 9px' }}
                        onClick={() => xVar === m.key ? setYVar(m.key) : setXVar(m.key)}>
                        {m.label}
                      </button>
                    </GlossaryTooltip>
                  ))}
                </div>
              </div>
            ))}
          </Accordion>
        </div>

        <div style={CARD}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#ebebeb' }}>r = {correlation.toFixed(3)}</span>
            <ConfidencePill confidence={confidence} />
            <span style={{ fontSize: 12, color: '#6b7280' }}>n = {n} team-seasons</span>
            {!valid && reason && <span style={{ fontSize: 12, color: '#ef4444' }}>({reason})</span>}
          </div>
          <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
            <span style={{ fontSize: 11, color: '#6366f1' }}>— line of best fit</span>
            {threshold && <span style={{ fontSize: 11, color: '#f59e0b' }}>— threshold split</span>}
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart margin={{ top: 8, right: 16, bottom: 28, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
              <XAxis dataKey="x" type="number" scale="linear" domain={['auto', 'auto']}
                tick={{ fill: '#6b7280', fontSize: 11 }}
                label={{ value: xMeta?.label, position: 'insideBottom', offset: -16, fill: '#6b7280', fontSize: 12 }} />
              <YAxis dataKey="y" type="number" domain={['auto', 'auto']}
                tick={{ fill: '#6b7280', fontSize: 11 }} width={54}
                label={{ value: yMeta?.label, angle: -90, position: 'insideLeft', offset: 10, fill: '#6b7280', fontSize: 12 }} />
              {threshold && (
                <ReferenceLine x={threshold.threshold} stroke="#f59e0b" strokeDasharray="5 5" strokeWidth={1.5}
                  label={{ value: `split @ ${threshold.threshold}`, position: 'top', fill: '#f59e0b', fontSize: 10 }} />
              )}
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null
                const d = payload[0].payload
                if (!d.school) return null
                return (
                  <div style={{ background: '#1a1a1a', border: '1px solid #2c2c2c', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                    <div style={{ color: SCHOOL_COLORS[d.school], fontWeight: 600 }}>
                      {SCHOOL_META[d.school]?.fullName} {d.year}
                    </div>
                    <div style={{ color: '#9ca3af' }}>{xMeta?.label}: {xMeta?.fmt ? xMeta.fmt(d.x) : d.x?.toFixed(2)}</div>
                    <div style={{ color: '#9ca3af' }}>{yMeta?.label}: {yMeta?.fmt ? yMeta.fmt(d.y) : d.y?.toFixed(2)}</div>
                  </div>
                )
              }} />
              <Scatter data={coloredPoints} shape={<CustomDot />} isAnimationActive={false} legendType="none" />
              {regressionLine.length === 2 && (
                <Line data={regressionLine} dataKey="y" type="linear" dot={false} activeDot={false}
                  stroke="#6366f1" strokeWidth={2} strokeDasharray="6 3" isAnimationActive={false} legendType="none" />
              )}
            </ComposedChart>
          </ResponsiveContainer>
          <div style={{ marginTop: 16, padding: '12px 16px', background: '#1a1a1a', borderRadius: 8, fontSize: 13, color: '#9ca3af', lineHeight: 1.6 }}>
            {insightText}
          </div>
        </div>

        <div style={{ ...CARD, marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#a5b4fc' }}>Style Interaction</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {STYLE_KEYS.map(sk => (
                <button key={sk.key} style={BTN(styleKey === sk.key)} onClick={() => setStyleKey(sk.key)}>{sk.label}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            {styleInteractions.map(b => (
              <div key={b.label} style={{ flex: 1, background: '#1a1a1a', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>{b.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: b.r == null ? '#4b5563' : Math.abs(b.r) >= 0.45 ? '#10b981' : Math.abs(b.r) >= 0.25 ? '#f59e0b' : '#6b7280' }}>
                  {b.r == null ? '—' : b.r.toFixed(2)}
                </div>
                <div style={{ fontSize: 10, color: '#4b5563' }}>r · n={b.n}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...CARD, marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#a5b4fc', marginBottom: 12 }}>Stability Over Time</div>
          <div style={{ display: 'flex', gap: 16 }}>
            {windows.map(w => (
              <div key={w.label} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{w.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: w.r == null ? '#4b5563' : Math.abs(w.r) > 0.4 ? '#10b981' : '#f59e0b' }}>
                  {w.r == null ? '—' : w.r.toFixed(2)}
                </div>
                <div style={{ fontSize: 11, color: '#4b5563' }}>n={w.n}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <button style={{ ...BTN(valid), padding: '8px 20px', fontSize: 13, opacity: valid ? 1 : 0.5, cursor: valid ? 'pointer' : 'not-allowed' }}
            onClick={handleSave} disabled={!valid}>
            Save Insight
          </button>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#a5b4fc', marginBottom: 12 }}>Saved Insights</div>
        {savedInsights.length === 0 ? (
          <div style={{ fontSize: 13, color: '#4b5563', padding: '16px', background: '#111111', borderRadius: 8, border: '1px solid #2c2c2c' }}>
            Find a strong correlation and click Save.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {savedInsights.map(ins => (
              <div key={ins.id} style={{ background: '#111111', border: '1px solid #2c2c2c', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#ebebeb' }}>{ins.title}</span>
                  <button style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: 14, padding: 0 }}
                    onClick={() => removeInsight(ins.id)}>×</button>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#ebebeb' }}>r = {ins.correlation.toFixed(2)}</span>
                  <ConfidencePill confidence={ins.confidence} />
                </div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>{ins.text}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Scheme Tab ────────────────────────────────────────────────────────────────

const OFF_COLORS = ['#f59e0b', '#10b981', '#6366f1', '#ec4899']
const DEF_COLORS = ['#ef4444', '#8b5cf6', '#06b6d4', '#6b7280']

const OFF_METRICS = [
  { key: 'win_pct',        label: 'Win %',           fmt: v => (v * 100).toFixed(1) + '%' },
  { key: 'adjoe',          label: 'Adj Off Eff',      fmt: v => v.toFixed(1) },
  { key: 'net_efficiency', label: 'Net Efficiency',   fmt: v => (v > 0 ? '+' : '') + v.toFixed(1) },
  { key: 'barthag',        label: 'Predictive Win%',  fmt: v => (v * 100).toFixed(1) + '%' },
  { key: 'efg_o',          label: 'eFG% (Off)',       fmt: v => v.toFixed(1) + '%' },
]

const DEF_METRICS = [
  { key: 'adjde',          label: 'Adj Def Eff',      fmt: v => v.toFixed(1) },
  { key: 'win_pct',        label: 'Win %',            fmt: v => (v * 100).toFixed(1) + '%' },
  { key: 'net_efficiency', label: 'Net Efficiency',   fmt: v => (v > 0 ? '+' : '') + v.toFixed(1) },
  { key: 'efg_d',          label: 'eFG% Allowed',     fmt: v => v.toFixed(1) + '%' },
  { key: 'tov_d',          label: 'TOV% Forced',      fmt: v => v.toFixed(1) + '%' },
]

const OFF_DESCRIPTIONS = {
  'Run & Gun':         'Fast pace + 3-heavy: Cornell/Dartmouth style',
  'Transition Attack': 'Fast pace, attacks rim off push — Cornell 2024',
  'Spread Offense':    'Deliberate + perimeter-heavy — Princeton style',
  'Grind It Out':      'Slow, inside-focused — Yale/Harvard defensive model',
}
const DEF_DESCRIPTIONS = {
  'High Pressure':  'Forces turnovers (tov_d ≥ 31)',
  'Rim Protection': 'Blocks shots (blk_d ≥ 11)',
  'Coverage':       'Limits eFG% (efg_d ≤ 50)',
  'Standard':       'Balanced defensive approach',
}

function SchemeHalf({ title, schemeType, metrics, defaultMetric, colors, descriptions }) {
  const [metric, setMetric] = useState(defaultMetric)
  const data = useMemo(() => schemeBreakdown(teamSeasons, schemeType, metric), [schemeType, metric])
  const metaFmt = metrics.find(m => m.key === metric)?.fmt ?? (v => v?.toFixed(2))

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#a5b4fc', marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
        {schemeType === 'off' ? 'Classified by tempo × 3-point rate' : 'Classified by turnover forcing, rim protection, eFG% limiting'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        {data.map((s, i) => (
          <div key={s.scheme} style={{ background: '#111111', border: `1px solid ${colors[i]}33`, borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: colors[i], marginBottom: 2 }}>{s.scheme}</div>
            <div style={{ fontSize: 10, color: '#4b5563', marginBottom: 8 }}>{descriptions[s.scheme]}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#ebebeb' }}>
                  {s.avgWinPct != null ? (s.avgWinPct * 100).toFixed(1) + '%' : '—'}
                </div>
                <div style={{ fontSize: 10, color: '#6b7280' }}>avg win%</div>
              </div>
              <div style={{ textAlign: 'right' }}><div style={{ fontSize: 12, color: '#4b5563' }}>n={s.n}</div></div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: '#6b7280' }}>Compare:</span>
        <select style={SEL} value={metric} onChange={e => setMetric(e.target.value)}>
          {metrics.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
      </div>
      <div style={CARD}>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 52, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
            <XAxis dataKey="scheme" tick={{ fill: '#6b7280', fontSize: 9 }} angle={-25} textAnchor="end" interval={0} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} domain={['auto', 'auto']} width={44} />
            <Tooltip
              contentStyle={{ background: '#1a1a1a', border: '1px solid #2c2c2c', borderRadius: 8, fontSize: 12 }}
              formatter={(v) => [v != null ? metaFmt(v) : '—', metrics.find(m => m.key === metric)?.label]}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map((entry, i) => <Cell key={entry.scheme} fill={colors[i]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function SchemeYearCard({ school, year }) {
  const color  = SCHOOL_COLORS[school]
  const season = useMemo(() => teamSeasons.find(s => s.school === school && s.year === year), [school, year])
  const squad  = useMemo(() => players.filter(p => p.school === school && p.year === year), [school, year])
  const scheme = useMemo(() => classifySchemeFromRoster(season, squad), [season, squad])
  const arch   = useMemo(() => computeTeamArchetype(squad, season), [squad, season])

  return (
    <div style={{ background: T.surf2, borderRadius: 10, padding: '14px 16px', border: `1px solid ${T.border}` }}>
      {/* Year badge + archetype */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1 }}>{year}</span>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
          background: `${color}22`, color }}>
          {arch.archetype}
        </span>
      </div>

      {/* Offense row */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9, color: T.textMin, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Offense</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.amber, marginBottom: 4 }}>{scheme.offScheme}</div>
        {scheme.offSignals.map((s, i) => (
          <div key={i} style={{ fontSize: 11, color: T.textMd }}>▸ {s}</div>
        ))}
      </div>

      {/* Defense row */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9, color: T.textMin, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Defense</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.accentSoft, marginBottom: 4 }}>{scheme.defScheme}</div>
        {scheme.defSignals.map((s, i) => (
          <div key={i} style={{ fontSize: 11, color: T.textMd }}>▸ {s}</div>
        ))}
      </div>

      {/* Efficacy strip */}
      {season && (
        <div style={{ paddingTop: 10, borderTop: `1px solid ${T.border}`, display: 'flex', gap: 12 }}>
          {[
            ['Win%', (season.win_pct * 100).toFixed(0) + '%'],
            ['AdjOE', season.adjoe?.toFixed(1)],
            ['AdjDE', season.adjde?.toFixed(1)],
            ['PPP',   season.ppp?.toFixed(1)],
          ].map(([lbl, val]) => (
            <div key={lbl} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{val ?? '—'}</div>
              <div style={{ fontSize: 9, color: T.textLow }}>{lbl}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SchemeClassifierPanel() {
  const { saveScheme } = useInsightStore()
  const [school,       setSchool]       = useState('yale')
  const [activeYears,  setActiveYears]  = useState(new Set([2025]))

  function toggleYear(y) {
    setActiveYears(prev => {
      const next = new Set(prev)
      if (next.has(y)) { if (next.size > 1) next.delete(y) }
      else next.add(y)
      return next
    })
  }

  const color = SCHOOL_COLORS[school]
  const sortedYears = YEARS.filter(y => activeYears.has(y))

  return (
    <div style={{ ...CARD, marginBottom: 28 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: T.accentSoft, marginBottom: 4 }}>
        Roster-Based Scheme Classifier
      </div>
      <div style={{ fontSize: 12, color: T.textLow, marginBottom: 16 }}>
        Predicts scheme from playing-time distribution, position mix, and physical profile. Select multiple years to track scheme evolution.
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <select style={SEL} value={school} onChange={e => setSchool(e.target.value)}>
          {SCHOOLS.map(s => <option key={s} value={s}>{SCHOOL_META[s].fullName}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 4 }}>
          {YEARS.map(y => (
            <button
              key={y}
              onClick={() => toggleYear(y)}
              style={{
                padding: '5px 11px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', border: `1px solid ${activeYears.has(y) ? color : T.border}`,
                background: activeYears.has(y) ? `${color}22` : 'transparent',
                color: activeYears.has(y) ? color : T.textLow,
              }}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${sortedYears.length}, 1fr)`, gap: 12, marginBottom: 16 }}>
        {sortedYears.map(y => (
          <SchemeYearCard key={y} school={school} year={y} />
        ))}
      </div>

      <button
        onClick={() => {
          const cards = sortedYears.map(y => {
            const s = teamSeasons.find(ts => ts.school === school && ts.year === y)
            const sq = players.filter(p => p.school === school && p.year === y)
            const scheme = classifySchemeFromRoster(s, sq)
            const arch   = computeTeamArchetype(sq, s)
            return { year: y, offScheme: scheme.offScheme, defScheme: scheme.defScheme,
                     archetype: arch.archetype, winPct: s?.win_pct, adjoe: s?.adjoe,
                     adjde: s?.adjde, ppp: s?.ppp, record: s?.record }
          })
          saveScheme({
            id:     `scheme_${school}_${sortedYears.join('_')}`,
            school,
            years:  sortedYears,
            label:  `${SCHOOL_META[school].abbr} · ${sortedYears.join(', ')}`,
            cards,
            savedAt: new Date().toLocaleDateString(),
          })
        }}
        style={{ ...BTN(true, T.accent), padding: '7px 18px', fontSize: 13 }}
      >
        Save Scheme Snapshot
      </button>
    </div>
  )
}

function SavedSchemes() {
  const { savedSchemes, removeScheme } = useInsightStore()
  if (savedSchemes.length === 0) return null
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: T.accentSoft, marginBottom: 10 }}>
        Saved Scheme Snapshots
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {savedSchemes.map(item => {
          const color = SCHOOL_COLORS[item.school]
          return (
            <div key={item.id} style={{ background: T.surf, border: `1px solid ${T.border}`, borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color }}>{SCHOOL_META[item.school].fullName}</span>
                  <span style={{ fontSize: 11, color: T.textLow, marginLeft: 8 }}>{item.savedAt}</span>
                </div>
                <button onClick={() => removeScheme(item.id)}
                  style={{ background: 'none', border: 'none', color: T.textMin, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>
                  ×
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${item.cards.length}, 1fr)`, gap: 8 }}>
                {item.cards.map(c => (
                  <div key={c.year} style={{ background: T.surf2, borderRadius: 8, padding: '10px 12px', borderLeft: `3px solid ${color}` }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color, marginBottom: 6 }}>{c.year}</div>
                    <div style={{ fontSize: 11, color: T.amber, marginBottom: 2 }}>{c.offScheme}</div>
                    <div style={{ fontSize: 11, color: T.accentSoft, marginBottom: 6 }}>{c.defScheme}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {[['Win%', c.winPct != null ? (c.winPct*100).toFixed(0)+'%' : '—'],
                        ['PPP',  c.ppp?.toFixed(1) ?? '—']].map(([lbl, val]) => (
                        <div key={lbl} style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{val}</div>
                          <div style={{ fontSize: 9, color: T.textLow }}>{lbl}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SchemePanel() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <SchemeClassifierPanel />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
        <SchemeHalf title="Offensive Schemes" schemeType="off" metrics={OFF_METRICS} defaultMetric="win_pct" colors={OFF_COLORS} descriptions={OFF_DESCRIPTIONS} />
        <SchemeHalf title="Defensive Schemes" schemeType="def" metrics={DEF_METRICS} defaultMetric="adjde"   colors={DEF_COLORS} descriptions={DEF_DESCRIPTIONS} />
      </div>
      <SavedSchemes />
    </div>
  )
}

// ── Biodata Tab ───────────────────────────────────────────────────────────────

const BIODATA_TEAM_METRICS = [
  { key: 'avg_height_in',  label: 'Avg Roster Height (in)' },
  { key: 'avg_weight_lbs', label: 'Avg Roster Weight (lbs)' },
  { key: 'avg_experience', label: 'Avg Experience (yr)' },
  { key: 'pct_guards',     label: '% Guards' },
  { key: 'pct_forwards',   label: '% Forwards' },
  { key: 'pct_bigs',       label: '% Bigs/Centers' },
]

const rosterAggsWeighted       = buildRosterAggregatesWeighted(players)
const archetypeMatchupData     = computeArchetypeMatchupMatrix(teamSeasons, players, games)
const positionPhysicalImpact   = computePositionPhysicalImpact(games, players)

function ScatterBlock({ points, regressionLine, correlation, n, confidence, xLabel, yLabel, tooltipExtra }) {
  const coloredPoints = points.map(p => ({ ...p, fill: SCHOOL_COLORS[p.school] ?? '#6366f1' }))
  const { valid, reason } = scoreInsight(correlation, n)
  return (
    <div style={CARD}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#ebebeb' }}>r = {correlation.toFixed(3)}</span>
        <ConfidencePill confidence={confidence} />
        <span style={{ fontSize: 12, color: '#6b7280' }}>n = {n}</span>
        {!valid && reason && <span style={{ fontSize: 11, color: '#ef4444' }}>({reason})</span>}
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart margin={{ top: 8, right: 16, bottom: 28, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
          <XAxis dataKey="x" type="number" scale="linear" domain={['auto', 'auto']}
            tick={{ fill: '#6b7280', fontSize: 11 }}
            label={{ value: xLabel, position: 'insideBottom', offset: -16, fill: '#6b7280', fontSize: 12 }} />
          <YAxis dataKey="y" type="number" domain={['auto', 'auto']}
            tick={{ fill: '#6b7280', fontSize: 11 }} width={54}
            label={{ value: yLabel, angle: -90, position: 'insideLeft', offset: 10, fill: '#6b7280', fontSize: 12 }} />
          <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.[0]) return null
            const d = payload[0].payload
            if (!d.school) return null
            return (
              <div style={{ background: '#1a1a1a', border: '1px solid #2c2c2c', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                <div style={{ color: SCHOOL_COLORS[d.school], fontWeight: 600 }}>
                  {d.name ?? SCHOOL_META[d.school]?.fullName} {d.year}
                </div>
                {tooltipExtra && tooltipExtra(d)}
                <div style={{ color: '#9ca3af' }}>{xLabel}: {d.x?.toFixed(1)}</div>
                <div style={{ color: '#9ca3af' }}>{yLabel}: {d.y?.toFixed(2)}</div>
              </div>
            )
          }} />
          <Scatter data={coloredPoints} shape={<CustomDot />} isAnimationActive={false} legendType="none" />
          {regressionLine.length === 2 && (
            <Line data={regressionLine} dataKey="y" type="linear" dot={false} activeDot={false}
              stroke="#6366f1" strokeWidth={2} strokeDasharray="6 3" isAnimationActive={false} legendType="none" />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

const TBL_HDR  = { padding: '7px 10px', fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #2c2c2c', background: '#0c0c0c' }
const TBL_CELL = { padding: '7px 10px', fontSize: 12, borderBottom: '1px solid #1a1a1a' }

// ── Roster & Bio Panel ────────────────────────────────────────────────────────

function RosterBioPanel() {
  const { saveRosterFinding, removeRosterFinding, savedRosterFindings } = useInsightStore()
  const [biodataKey, setBiodataKey] = useState('avg_height_in')
  const [outcomeKey, setOutcomeKey] = useState('win_pct')
  const [physYear,   setPhysYear]   = useState(0)   // 0 = all years

  const teamBio = useMemo(() =>
    computeBiodataRelationship(rosterAggsWeighted, teamSeasons, biodataKey, outcomeKey)
  , [biodataKey, outcomeKey])

  const { confidence: teamConf } = useMemo(() => scoreInsight(teamBio.correlation, teamBio.n), [teamBio])

  const teamRegLine = useMemo(() => {
    if (teamBio.points.length < 3) return []
    const { slope, intercept } = linearRegression(teamBio.points)
    const xs = teamBio.points.map(p => p.x)
    const xMin = Math.min(...xs), xMax = Math.max(...xs)
    const pad = (xMax - xMin) * 0.05
    return [
      { x: xMin - pad, y: slope * (xMin - pad) + intercept },
      { x: xMax + pad, y: slope * (xMax + pad) + intercept },
    ]
  }, [teamBio])

  const teamRanked = useMemo(() => [...teamBio.points].sort((a, b) => b.x - a.x), [teamBio])

  const xBioMeta = BIODATA_TEAM_METRICS.find(m => m.key === biodataKey)
  const yOutMeta = TEAM_METRICS.find(m => m.key === outcomeKey)

  const physPairs  = useMemo(() => {
    const aggsAll = buildRosterAggregatesWeighted(players)
    const filteredSeasons = physYear === 0 ? teamSeasons : teamSeasons.filter(s => s.year === physYear)
    const filteredAggs    = physYear === 0 ? aggsAll     : aggsAll.filter(a => a.year === physYear)
    return buildPhysicalMatchupPairs(filteredSeasons, filteredAggs)
  }, [physYear])
  const physR = useMemo(() => {
    const valid = physPairs.filter(p => p.heightDiff != null)
    return valid.length >= 4 ? pearsonCorrelation(valid.map(p => p.heightDiff), valid.map(p => p.winPctDiff)) : null
  }, [physPairs])
  const physPoints = useMemo(() =>
    physPairs.filter(p => p.heightDiff != null).map(p => ({
      x: p.heightDiff, y: p.winPctDiff,
      label: `${SCHOOL_META[p.schoolA]?.abbr} vs ${SCHOOL_META[p.schoolB]?.abbr}`, fill: '#6366f1',
    }))
  , [physPairs])
  const physRegLine = useMemo(() => {
    if (physPoints.length < 3) return []
    const { slope, intercept } = linearRegression(physPoints)
    const xs = physPoints.map(p => p.x)
    const xMin = Math.min(...xs), xMax = Math.max(...xs)
    const pad = (xMax - xMin) * 0.05
    return [{ x: xMin-pad, y: slope*(xMin-pad)+intercept }, { x: xMax+pad, y: slope*(xMax+pad)+intercept }]
  }, [physPoints])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 44 }}>

      {/* ── Roster Composition → Team Outcomes ── */}
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#a5b4fc', marginBottom: 2 }}>Roster Composition → Team Outcomes</div>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
          Playing-time weighted roster biodata (min 6 mpg) correlated with season outcomes · all years 2022–2025
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Roster metric →</span>
            <GlossaryTooltip metricKey={biodataKey}>
              <select style={SEL} value={biodataKey} onChange={e => setBiodataKey(e.target.value)}>
                {BIODATA_TEAM_METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </GlossaryTooltip>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Outcome ↑</span>
            <GlossaryTooltip metricKey={outcomeKey}>
              <select style={SEL} value={outcomeKey} onChange={e => setOutcomeKey(e.target.value)}>
                {TEAM_METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </GlossaryTooltip>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
          <button
            onClick={() => {
              const { valid } = scoreInsight(teamBio.correlation, teamBio.n)
              if (!valid) return
              saveRosterFinding({
                id:    `roster_${biodataKey}_${outcomeKey}`,
                type:  'correlation',
                title: `${xBioMeta?.label ?? biodataKey} → ${yOutMeta?.label ?? outcomeKey}`,
                body:  `r = ${teamBio.correlation.toFixed(3)} · n = ${teamBio.n} team-seasons`,
                savedAt: new Date().toLocaleDateString(),
              })
            }}
            style={{ ...BTN(true, T.accent), padding: '6px 16px', fontSize: 12 }}
          >
            Save Finding
          </button>
          <span style={{ fontSize: 11, color: T.textLow }}>
            {(() => { const {valid, reason} = scoreInsight(teamBio.correlation, teamBio.n); return valid ? `r = ${teamBio.correlation.toFixed(3)}` : reason })()}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
          <ScatterBlock
            points={teamBio.points} regressionLine={teamRegLine}
            correlation={teamBio.correlation} n={teamBio.n} confidence={teamConf}
            xLabel={xBioMeta?.label ?? biodataKey} yLabel={yOutMeta?.label ?? outcomeKey}
            tooltipExtra={() => null}
          />
          <div style={{ background: '#111111', border: '1px solid #2c2c2c', borderRadius: 12, overflow: 'hidden', alignSelf: 'start' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 64px 64px' }}>
              <div style={TBL_HDR}>Team / Year</div>
              <div style={{ ...TBL_HDR, textAlign: 'right' }}>{xBioMeta?.label?.split(' ').pop() ?? 'Bio'}</div>
              <div style={{ ...TBL_HDR, textAlign: 'right' }}>{yOutMeta?.label ?? outcomeKey}</div>
            </div>
            {teamRanked.map(d => {
              const color = SCHOOL_COLORS[d.school] ?? '#6b7280'
              const yFmt = yOutMeta?.fmt ? yOutMeta.fmt(d.y) : d.y?.toFixed(2)
              return (
                <div key={`${d.school}${d.year}`} style={{ display: 'grid', gridTemplateColumns: '1fr 64px 64px' }}>
                  <div style={{ ...TBL_CELL, color }}>{SCHOOL_META[d.school]?.abbr} <span style={{ color: '#4b5563', fontSize: 11 }}>{d.year}</span></div>
                  <div style={{ ...TBL_CELL, color: '#ebebeb', textAlign: 'right', fontWeight: 600 }}>{d.x?.toFixed(1)}</div>
                  <div style={{ ...TBL_CELL, color: '#9ca3af', textAlign: 'right' }}>{yFmt}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Section 3: Physical Advantage Analysis ── */}
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#a5b4fc', marginBottom: 2 }}>Height Advantage vs Win % Advantage</div>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
          Each point = one cross-school pairing in the same season. Answers: does the taller roster win more often?
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: T.textLow }}>Season:</span>
          {[0, ...YEARS].map(y => (
            <button key={y} onClick={() => setPhysYear(y)}
              style={{ ...BTN(physYear === y), padding: '5px 12px', fontSize: 12 }}>
              {y === 0 ? 'All' : y}
            </button>
          ))}
          {physR != null && (
            <span style={{ fontSize: 13, color: '#9ca3af' }}>
              r = <span style={{ fontWeight: 700, color: Math.abs(physR) >= 0.35 ? '#10b981' : '#6b7280' }}>{physR.toFixed(3)}</span>
              <span style={{ color: '#4b5563', marginLeft: 6 }}>n={physPoints.length} pairings</span>
            </span>
          )}
        </div>
        <div style={CARD}>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart margin={{ top: 8, right: 16, bottom: 28, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
              <XAxis dataKey="x" type="number" scale="linear" domain={['auto','auto']}
                tick={{ fill: '#6b7280', fontSize: 11 }}
                label={{ value: 'Height Diff (in, Team A − Team B)', position: 'insideBottom', offset: -16, fill: '#6b7280', fontSize: 12 }} />
              <YAxis dataKey="y" type="number" domain={['auto','auto']}
                tick={{ fill: '#6b7280', fontSize: 11 }} width={54}
                label={{ value: 'Win % Diff', angle: -90, position: 'insideLeft', offset: 10, fill: '#6b7280', fontSize: 12 }} />
              <ReferenceLine x={0} stroke="#374151" strokeDasharray="3 3" />
              <ReferenceLine y={0} stroke="#374151" strokeDasharray="3 3" />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null
                const d = payload[0].payload
                return (
                  <div style={{ background: '#1a1a1a', border: '1px solid #2c2c2c', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                    <div style={{ color: '#ebebeb', fontWeight: 600, marginBottom: 4 }}>{d.label}</div>
                    <div style={{ color: '#9ca3af' }}>Height diff: {d.x > 0 ? '+' : ''}{d.x}"</div>
                    <div style={{ color: '#9ca3af' }}>Win% diff: {d.y > 0 ? '+' : ''}{(d.y * 100).toFixed(1)}%</div>
                  </div>
                )
              }} />
              <Scatter data={physPoints} shape={<CustomDot />} isAnimationActive={false} legendType="none" />
              {physRegLine.length === 2 && (
                <Line data={physRegLine} dataKey="y" type="linear" dot={false} activeDot={false}
                  stroke="#6366f1" strokeWidth={2} strokeDasharray="6 3" isAnimationActive={false} legendType="none" />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Composition Archetype Matchup Matrix ── */}
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#a5b4fc', marginBottom: 2 }}>
          Composition Archetype Matchups
        </div>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
          Win rate when each archetype faces each other · all Ivy vs Ivy games 2022–2025 · n={archetypeMatchupData.archetypes.length * archetypeMatchupData.archetypes.length} pairings
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 520 }}>
            <thead>
              <tr>
                <th style={{ padding: '6px 12px', fontSize: 10, color: '#6b7280', textAlign: 'left', borderBottom: '1px solid #2c2c2c', background: '#0c0c0c' }}>
                  Offense ↓ vs Defense →
                </th>
                {archetypeMatchupData.archetypes.map(b => (
                  <th key={b} style={{ padding: '6px 10px', fontSize: 10, color: '#9ca3af', fontWeight: 600, textAlign: 'center', borderBottom: '1px solid #2c2c2c', background: '#0c0c0c', whiteSpace: 'nowrap' }}>
                    {b}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {archetypeMatchupData.archetypes.map(a => (
                <tr key={a} style={{ borderBottom: '1px solid #1a1a1a' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600, color: '#a5b4fc', whiteSpace: 'nowrap', background: '#0e0e0e' }}>{a}</td>
                  {archetypeMatchupData.archetypes.map(b => {
                    const cell = archetypeMatchupData.matrix[a][b]
                    if (!cell) return <td key={b} style={{ padding: '8px 10px', textAlign: 'center', color: '#374151' }}>—</td>
                    const wr = cell.winRate
                    const bg = wr >= 60 ? '#10b98122' : wr >= 50 ? '#6366f122' : wr >= 40 ? '#f59e0b22' : '#ef444422'
                    const fg = wr >= 60 ? '#10b981'  : wr >= 50 ? '#a5b4fc'  : wr >= 40 ? '#f59e0b'  : '#ef4444'
                    const isSaved = savedRosterFindings.some(f => f.id === `arch_${a}_${b}`)
                    return (
                      <td
                        key={b}
                        title="Click to save this matchup finding"
                        onClick={() => saveRosterFinding({
                          id: `arch_${a}_${b}`,
                          type: 'archetype',
                          title: `${a} vs ${b}`,
                          body: `${wr}% win rate · ${cell.wins}W–${cell.games - cell.wins}L · ${cell.games} games`,
                          savedAt: new Date().toLocaleDateString(),
                        })}
                        style={{ padding: '8px 10px', textAlign: 'center', background: bg, borderRadius: 4,
                          cursor: 'pointer', outline: isSaved ? `2px solid ${fg}` : 'none' }}>
                        <div style={{ fontWeight: 700, color: fg }}>{wr}%</div>
                        <div style={{ fontSize: 9, color: '#4b5563' }}>{cell.games}g</div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11, color: '#374151', marginTop: 8 }}>
          Green ≥ 60% win rate · Purple 50–60% · Amber 40–50% · Red &lt; 40%
        </div>
      </div>

      {/* ── Position Physical Impact ── */}
      {positionPhysicalImpact && (
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#a5b4fc', marginBottom: 2 }}>
            Position Physical Advantage → Point Differential
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
            OLS regression across {positionPhysicalImpact.n} unique Ivy matchups · R² = {positionPhysicalImpact.r2} (physical attributes explain {(positionPhysicalImpact.r2 * 100).toFixed(0)}% of score differential variance)
          </div>
          <div style={{ fontSize: 12, color: '#f59e0b', marginBottom: 16 }}>
            Coefficients = pts per inch/lb of advantage. Negative sign = that position's height advantage historically correlates with fewer points (Ivy-specific finding).
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Height coefficients */}
            <div style={CARD}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#ebebeb', marginBottom: 14 }}>Height Advantage (pts/inch)</div>
              {[
                { label: 'Guard Height Δ',   coef: positionPhysicalImpact.coefficients.guardHeight, pearson: positionPhysicalImpact.pearson.guardHeight },
                { label: 'Forward Height Δ', coef: positionPhysicalImpact.coefficients.fwdHeight,   pearson: positionPhysicalImpact.pearson.fwdHeight   },
                { label: 'Big/C Height Δ',   coef: positionPhysicalImpact.coefficients.bigHeight,   pearson: positionPhysicalImpact.pearson.bigHeight    },
              ].map(({ label, coef, pearson }) => {
                const absMax = 2.5
                const barW = Math.min(Math.abs(coef) / absMax * 100, 100)
                const barColor = coef >= 0 ? '#10b981' : '#ef4444'
                return (
                  <div key={label} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 12, color: '#9ca3af' }}>{label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: barColor }}>{coef > 0 ? '+' : ''}{coef}</span>
                    </div>
                    <div style={{ background: '#2c2c2c', borderRadius: 3, height: 8, position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', [coef >= 0 ? 'left' : 'right']: '50%', width: barW / 2 + '%', height: '100%', background: barColor, opacity: 0.7 }} />
                      <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: '#374151' }} />
                    </div>
                    <div style={{ fontSize: 10, color: '#4b5563', marginTop: 2 }}>Pearson r = {pearson > 0 ? '+' : ''}{pearson}</div>
                  </div>
                )
              })}
            </div>

            {/* Weight coefficients */}
            <div style={CARD}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#ebebeb', marginBottom: 14 }}>Weight Advantage (pts/lb)</div>
              {[
                { label: 'Guard Weight Δ',   coef: positionPhysicalImpact.coefficients.guardWeight, pearson: positionPhysicalImpact.pearson.guardWeight },
                { label: 'Forward Weight Δ', coef: positionPhysicalImpact.coefficients.fwdWeight,   pearson: positionPhysicalImpact.pearson.fwdWeight   },
                { label: 'Big/C Weight Δ',   coef: positionPhysicalImpact.coefficients.bigWeight,   pearson: positionPhysicalImpact.pearson.bigWeight    },
              ].map(({ label, coef, pearson }) => {
                const absMax = 0.4
                const barW = Math.min(Math.abs(coef) / absMax * 100, 100)
                const barColor = coef >= 0 ? '#10b981' : '#ef4444'
                return (
                  <div key={label} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 12, color: '#9ca3af' }}>{label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: barColor }}>{coef > 0 ? '+' : ''}{coef}</span>
                    </div>
                    <div style={{ background: '#2c2c2c', borderRadius: 3, height: 8, position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', [coef >= 0 ? 'left' : 'right']: '50%', width: barW / 2 + '%', height: '100%', background: barColor, opacity: 0.7 }} />
                      <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: '#374151' }} />
                    </div>
                    <div style={{ fontSize: 10, color: '#4b5563', marginTop: 2 }}>Pearson r = {pearson > 0 ? '+' : ''}{pearson}</div>
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{ ...CARD, marginTop: 16, background: '#0e0e0e', borderColor: '#f59e0b33' }}>
            <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600, marginBottom: 6 }}>Key Finding</div>
            <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.7 }}>
              Physical attributes collectively explain only <strong style={{ color: '#ebebeb' }}>{(positionPhysicalImpact.r2 * 100).toFixed(0)}%</strong> of point differential variance in Ivy League games —
              skill, scheme, and execution dominate. Guard weight advantage ({positionPhysicalImpact.pearson.guardWeight > 0 ? '+' : ''}{positionPhysicalImpact.pearson.guardWeight} r) shows the strongest positive individual correlation,
              while height advantages at all positions are near-zero or slightly negative — contrary to the conventional wisdom that bigger teams win.
              Center height advantage (r = {positionPhysicalImpact.pearson.bigHeight}) is <em>not</em> stronger than guard height (r = {positionPhysicalImpact.pearson.guardHeight}).
            </div>
            <button
              onClick={() => saveRosterFinding({
                id: 'physical_impact_regression',
                type: 'physical',
                title: 'Position Physical Impact (OLS)',
                body: `R² = ${positionPhysicalImpact.r2} · ${positionPhysicalImpact.n} matchups · Guard weight r = ${positionPhysicalImpact.pearson.guardWeight > 0 ? '+' : ''}${positionPhysicalImpact.pearson.guardWeight} · Big height r = ${positionPhysicalImpact.pearson.bigHeight}`,
                savedAt: new Date().toLocaleDateString(),
              })}
              style={{ ...BTN(true, T.accent), marginTop: 12, padding: '6px 16px', fontSize: 12 }}
            >
              Save Finding
            </button>
          </div>
        </div>
      )}

      {/* ── Saved Roster Findings ── */}
      {savedRosterFindings.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.accentSoft, marginBottom: 10 }}>
            Saved Findings
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {savedRosterFindings.map(item => (
              <div key={item.id} style={{ background: T.surf, border: `1px solid ${T.border}`, borderRadius: 8, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4,
                      background: item.type === 'archetype' ? `${T.accent}22` : item.type === 'physical' ? `${T.amber}22` : `${T.green}22`,
                      color:      item.type === 'archetype' ? T.accentSoft : item.type === 'physical' ? T.amber : T.green,
                      fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {item.type}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{item.title}</span>
                    <span style={{ fontSize: 10, color: T.textMin }}>{item.savedAt}</span>
                  </div>
                  <div style={{ fontSize: 12, color: T.textMd }}>{item.body}</div>
                </div>
                <button onClick={() => removeRosterFinding(item.id)}
                  style={{ background: 'none', border: 'none', color: T.textMin, cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0, padding: 0 }}>
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────

const TABS = [
  ['correlation', 'Metric Correlation'],
  ['schemes',     'Scheme Analysis'],
  ['biodata',     'Roster & Bio'],
]

export default function InsightsLab() {
  const [tab, setTab] = useState('correlation')

  return (
    <div style={{ background: T.bg, minHeight: '100vh' }}>
      <PageHeader
        title="Insights Lab"
        subtitle="Explore relationships in Ivy League basketball data · 2022–2025"
        stats={[
          { label: 'Team-Seasons',   value: '32' },
          { label: 'Player-Seasons', value: '458' },
          { label: 'Ivy Games',      value: '236' },
          { label: 'Metrics',        value: String(TEAM_METRICS.length) },
        ]}
        controls={
          <div style={{ display: 'flex', gap: 4 }}>
            {TABS.map(([v, lbl]) => (
              <button key={v} style={BTN(tab === v)} onClick={() => setTab(v)}>{lbl}</button>
            ))}
          </div>
        }
      />

      <div style={{ padding: '0 28px 28px', maxWidth: 1280, margin: '0 auto' }}>

      {tab === 'correlation' && <CorrelationPanel />}
      {tab === 'schemes'     && <SchemePanel />}
      {tab === 'biodata'     && <RosterBioPanel />}

      </div>{/* end inner padding wrapper */}
    </div>
  )
}
