import { useMemo, useState } from 'react'
import {
  ComposedChart, Scatter, Line,
  BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import teamSeasons from '../data/teamSeasons.json'
import players from '../data/players.json'
import { SCHOOL_META, SCHOOL_COLORS, TEAM_METRICS, PLAYER_METRICS } from '../data/constants.js'
import useInsightStore from '../store/useInsightStore.js'
import {
  computeRelationship, scoreInsight, timeWindowComparison,
  detectThreshold, generateInsightText, linearRegression, detectStyleInteractions,
  schemeBreakdown, buildRosterAggregates, computeBiodataRelationship,
  computePlayerRelationship, parseHeightIn, classYearNum,
} from '../utils/insightEngine.js'

const SEL = { background: '#13131f', border: '1px solid #1e1e2e', color: '#e2e8f0', borderRadius: 6, padding: '6px 10px', fontSize: 13 }
const BTN = (active, color = '#4f46e5') => ({
  padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
  cursor: 'pointer', border: 'none',
  background: active ? color : '#1e1e2e', color: active ? '#fff' : '#9ca3af',
})

function ConfidencePill({ confidence }) {
  const colors = { HIGH: '#10b981', MEDIUM: '#f59e0b', LOW: '#ef4444' }
  return (
    <span style={{
      background: colors[confidence] + '22', color: colors[confidence],
      borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600,
    }}>
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
      stroke="#0d0d14" strokeWidth={1}
    />
  )
}

// ── Correlation Tab ───────────────────────────────────────────────────────────

function CorrelationPanel() {
  const { xVar, yVar, yearRange, savedInsights,
    setXVar, setYVar, saveInsight, removeInsight } = useInsightStore()
  const [styleKey, setStyleKey] = useState('three_rate_o')

  const { points, correlation, n } = useMemo(() =>
    computeRelationship(teamSeasons, xVar, yVar, { yearRange })
  , [xVar, yVar, yearRange])

  const { valid, confidence, reason } = useMemo(() => scoreInsight(correlation, n), [correlation, n])
  const threshold = useMemo(() => detectThreshold(teamSeasons, xVar, yVar, yearRange), [xVar, yVar, yearRange])
  const windows   = useMemo(() => timeWindowComparison(teamSeasons, xVar, yVar), [xVar, yVar])
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
        <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
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

        <div style={{ background: '#0f0f1a', border: '1px solid #1e1e2e', borderRadius: 12, padding: '20px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0' }}>r = {correlation.toFixed(3)}</span>
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
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
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
                  <div style={{ background: '#13131f', border: '1px solid #1e1e2e', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
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
          <div style={{ marginTop: 16, padding: '12px 16px', background: '#13131f', borderRadius: 8, fontSize: 13, color: '#9ca3af', lineHeight: 1.6 }}>
            {insightText}
          </div>
        </div>

        <div style={{ marginTop: 20, background: '#0f0f1a', border: '1px solid #1e1e2e', borderRadius: 12, padding: '16px 20px' }}>
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
              <div key={b.label} style={{ flex: 1, background: '#13131f', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>{b.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: b.r == null ? '#4b5563' : Math.abs(b.r) >= 0.45 ? '#10b981' : Math.abs(b.r) >= 0.25 ? '#f59e0b' : '#6b7280' }}>
                  {b.r == null ? '—' : b.r.toFixed(2)}
                </div>
                <div style={{ fontSize: 10, color: '#4b5563' }}>r · n={b.n}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 16, background: '#0f0f1a', border: '1px solid #1e1e2e', borderRadius: 12, padding: '16px 20px' }}>
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
          <div style={{ fontSize: 13, color: '#4b5563', padding: '16px', background: '#0f0f1a', borderRadius: 8, border: '1px solid #1e1e2e' }}>
            Find a strong correlation and click Save.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {savedInsights.map(ins => (
              <div key={ins.id} style={{ background: '#0f0f1a', border: '1px solid #1e1e2e', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>{ins.title}</span>
                  <button style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: 14, padding: 0 }}
                    onClick={() => removeInsight(ins.id)}>×</button>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>r = {ins.correlation.toFixed(2)}</span>
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
  'Run & Gun':        'Fast pace, 3-heavy — Cornell/Dartmouth style',
  'Transition Attack':'Fast pace, attacks rim off push — Cornell 2024',
  'Spread Offense':   'Deliberate + perimeter-heavy — Princeton style',
  'Grind It Out':     'Slow, inside-focused — Yale defensive model',
}

const DEF_DESCRIPTIONS = {
  'High Pressure':   'Forces turnovers (tov_d ≥ 31)',
  'Rim Protection':  'Blocks shots (blk_d ≥ 11)',
  'Coverage':        'Limits eFG% (efg_d ≤ 50)',
  'Standard':        'Balanced defensive approach',
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
          <div key={s.scheme} style={{ background: '#0f0f1a', border: `1px solid ${colors[i]}33`, borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: colors[i], marginBottom: 2 }}>{s.scheme}</div>
            <div style={{ fontSize: 10, color: '#4b5563', marginBottom: 8 }}>{descriptions[s.scheme]}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0' }}>
                  {s.avgWinPct != null ? (s.avgWinPct * 100).toFixed(1) + '%' : '—'}
                </div>
                <div style={{ fontSize: 10, color: '#6b7280' }}>avg win%</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: '#4b5563' }}>n={s.n}</div>
              </div>
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

      <div style={{ background: '#0f0f1a', border: '1px solid #1e1e2e', borderRadius: 10, padding: '14px 12px' }}>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 52, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
            <XAxis dataKey="scheme" tick={{ fill: '#6b7280', fontSize: 9 }} angle={-25} textAnchor="end" interval={0} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} domain={['auto', 'auto']} width={44} />
            <Tooltip
              contentStyle={{ background: '#13131f', border: '1px solid #1e1e2e', borderRadius: 8, fontSize: 12 }}
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

function SchemePanel() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
      <SchemeHalf
        title="Offensive Schemes" schemeType="off"
        metrics={OFF_METRICS} defaultMetric="win_pct"
        colors={OFF_COLORS} descriptions={OFF_DESCRIPTIONS}
      />
      <SchemeHalf
        title="Defensive Schemes" schemeType="def"
        metrics={DEF_METRICS} defaultMetric="adjde"
        colors={DEF_COLORS} descriptions={DEF_DESCRIPTIONS}
      />
    </div>
  )
}

// ── Biodata Tab ───────────────────────────────────────────────────────────────

const BIODATA_TEAM_METRICS = [
  { key: 'avg_height_in',  label: 'Avg Roster Height (in)' },
  { key: 'avg_experience', label: 'Avg Experience (yr)' },
  { key: 'pct_guards',     label: '% Guards' },
  { key: 'pct_forwards',   label: '% Forwards' },
  { key: 'pct_bigs',       label: '% Bigs/Centers' },
]

const PLAYER_BIO_KEYS = [
  { key: 'height_in',    label: 'Height (in)' },
  { key: 'class_yr_num', label: 'Experience (class yr)' },
]

const rosterAggs = buildRosterAggregates(players)

const enrichedPlayers = players.map(p => ({
  ...p,
  height_in:    parseHeightIn(p.height),
  class_yr_num: classYearNum(p.class_yr),
}))

function ScatterBlock({ points, regressionLine, correlation, n, confidence, xLabel, yLabel, tooltipExtra }) {
  const coloredPoints = points.map(p => ({ ...p, fill: SCHOOL_COLORS[p.school] ?? '#6366f1' }))
  const { valid, reason } = scoreInsight(correlation, n)
  return (
    <div style={{ background: '#0f0f1a', border: '1px solid #1e1e2e', borderRadius: 12, padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>r = {correlation.toFixed(3)}</span>
        <ConfidencePill confidence={confidence} />
        <span style={{ fontSize: 12, color: '#6b7280' }}>n = {n}</span>
        {!valid && reason && <span style={{ fontSize: 11, color: '#ef4444' }}>({reason})</span>}
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart margin={{ top: 8, right: 16, bottom: 28, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
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
              <div style={{ background: '#13131f', border: '1px solid #1e1e2e', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
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

const TBL_HDR = { padding: '7px 10px', fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #1e1e2e', background: '#0a0a14' }
const TBL_CELL = { padding: '7px 10px', fontSize: 12, borderBottom: '1px solid #13131f' }

function BioPanel() {
  const [biodataKey, setBiodataKey] = useState('avg_height_in')
  const [outcomeKey, setOutcomeKey] = useState('win_pct')
  const [playerXKey, setPlayerXKey] = useState('height_in')
  const [playerYKey, setPlayerYKey] = useState('bpm')

  const teamBio = useMemo(() =>
    computeBiodataRelationship(rosterAggs, teamSeasons, biodataKey, outcomeKey)
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

  const teamRanked = useMemo(() =>
    [...teamBio.points].sort((a, b) => b.x - a.x)
  , [teamBio])

  const playerBio = useMemo(() =>
    computePlayerRelationship(enrichedPlayers, playerXKey, playerYKey)
  , [playerXKey, playerYKey])

  const { confidence: playerConf } = useMemo(() => scoreInsight(playerBio.correlation, playerBio.n), [playerBio])

  const playerRegLine = useMemo(() => {
    if (playerBio.points.length < 3) return []
    const { slope, intercept } = linearRegression(playerBio.points)
    const xs = playerBio.points.map(p => p.x)
    const xMin = Math.min(...xs), xMax = Math.max(...xs)
    const pad = (xMax - xMin) * 0.05
    return [
      { x: xMin - pad, y: slope * (xMin - pad) + intercept },
      { x: xMax + pad, y: slope * (xMax + pad) + intercept },
    ]
  }, [playerBio])

  const playerRanked = useMemo(() =>
    [...playerBio.points].sort((a, b) => b.x - a.x).slice(0, 30)
  , [playerBio])

  const xBioMeta = BIODATA_TEAM_METRICS.find(m => m.key === biodataKey)
  const yOutMeta = TEAM_METRICS.find(m => m.key === outcomeKey)
  const xPlyMeta = PLAYER_BIO_KEYS.find(m => m.key === playerXKey)
  const yPlyMeta = PLAYER_METRICS.find(m => m.key === playerYKey)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>

      {/* ── Team Roster → Outcomes ── */}
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#a5b4fc', marginBottom: 2 }}>Roster Composition → Team Outcomes</div>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
          Aggregated roster biodata (min 6 mpg) correlated with season outcomes
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Roster metric →</span>
            <select style={SEL} value={biodataKey} onChange={e => setBiodataKey(e.target.value)}>
              {BIODATA_TEAM_METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Outcome ↑</span>
            <select style={SEL} value={outcomeKey} onChange={e => setOutcomeKey(e.target.value)}>
              {TEAM_METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
          <ScatterBlock
            points={teamBio.points}
            regressionLine={teamRegLine}
            correlation={teamBio.correlation}
            n={teamBio.n}
            confidence={teamConf}
            xLabel={xBioMeta?.label ?? biodataKey}
            yLabel={yOutMeta?.label ?? outcomeKey}
            tooltipExtra={d => null}
          />

          {/* Ranked table */}
          <div style={{ background: '#0f0f1a', border: '1px solid #1e1e2e', borderRadius: 12, overflow: 'hidden', alignSelf: 'start' }}>
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
                  <div style={{ ...TBL_CELL, color }}>
                    {SCHOOL_META[d.school]?.abbr} <span style={{ color: '#4b5563', fontSize: 11 }}>{d.year}</span>
                  </div>
                  <div style={{ ...TBL_CELL, color: '#e2e8f0', textAlign: 'right', fontWeight: 600 }}>
                    {d.x?.toFixed(1)}
                  </div>
                  <div style={{ ...TBL_CELL, color: '#9ca3af', textAlign: 'right' }}>
                    {yFmt}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Player Biodata → Performance ── */}
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#a5b4fc', marginBottom: 2 }}>Player Biodata → Individual Performance</div>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
          Physical/demographic attributes vs per-game stats (min 10 mpg, all years)
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Bio →</span>
            <select style={SEL} value={playerXKey} onChange={e => setPlayerXKey(e.target.value)}>
              {PLAYER_BIO_KEYS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Stat ↑</span>
            <select style={SEL} value={playerYKey} onChange={e => setPlayerYKey(e.target.value)}>
              {PLAYER_METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
          <ScatterBlock
            points={playerBio.points}
            regressionLine={playerRegLine}
            correlation={playerBio.correlation}
            n={playerBio.n}
            confidence={playerConf}
            xLabel={xPlyMeta?.label ?? playerXKey}
            yLabel={yPlyMeta?.label ?? playerYKey}
            tooltipExtra={d => (
              <div style={{ fontSize: 11, color: '#6b7280' }}>{d.pos_type}</div>
            )}
          />

          {/* Top-30 ranked table */}
          <div style={{ background: '#0f0f1a', border: '1px solid #1e1e2e', borderRadius: 12, overflow: 'hidden', alignSelf: 'start' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 52px 52px 52px' }}>
              <div style={TBL_HDR}>Player</div>
              <div style={{ ...TBL_HDR, textAlign: 'right' }}>Pos</div>
              <div style={{ ...TBL_HDR, textAlign: 'right' }}>{xPlyMeta?.label?.split(' ')[0] ?? 'Bio'}</div>
              <div style={{ ...TBL_HDR, textAlign: 'right' }}>{yPlyMeta?.label ?? playerYKey}</div>
            </div>
            {playerRanked.map((d, i) => {
              const color = SCHOOL_COLORS[d.school] ?? '#6b7280'
              const yFmt = yPlyMeta?.fmt ? yPlyMeta.fmt(d.y) : d.y?.toFixed(1)
              return (
                <div key={`${d.name}${d.year}${i}`} style={{ display: 'grid', gridTemplateColumns: '1fr 52px 52px 52px' }}>
                  <div style={{ ...TBL_CELL, color }}>
                    <div>{d.name?.split(' ').pop()}</div>
                    <div style={{ fontSize: 10, color: '#4b5563' }}>{SCHOOL_META[d.school]?.abbr} {d.year}</div>
                  </div>
                  <div style={{ ...TBL_CELL, color: '#6b7280', textAlign: 'right', fontSize: 11 }}>
                    {d.pos_type?.split(' ').pop() ?? '—'}
                  </div>
                  <div style={{ ...TBL_CELL, color: '#e2e8f0', textAlign: 'right', fontWeight: 600 }}>
                    {d.x?.toFixed(1)}
                  </div>
                  <div style={{ ...TBL_CELL, color: '#9ca3af', textAlign: 'right' }}>
                    {yFmt}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
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
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Insights Lab</h1>
        <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 12px' }}>
          Explore relationships in Ivy League basketball data
        </p>
        <div style={{ display: 'flex', gap: 6 }}>
          {TABS.map(([v, lbl]) => (
            <button key={v} style={BTN(tab === v)} onClick={() => setTab(v)}>{lbl}</button>
          ))}
        </div>
      </div>

      {tab === 'correlation' && <CorrelationPanel />}
      {tab === 'schemes'     && <SchemePanel />}
      {tab === 'biodata'     && <BioPanel />}
    </div>
  )
}
