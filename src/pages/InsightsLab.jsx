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
import PageConclusions from '../components/shared/PageConclusions.jsx'
import MethodologyPanel from '../components/shared/MethodologyPanel.jsx'
import { T } from '../styles/theme.js'
import {
  computeRelationship, scoreInsight, timeWindowComparison,
  detectThreshold, generateInsightText, linearRegression, detectStyleInteractions,
  schemeBreakdown, computeBiodataRelationship,
  buildRosterAggregatesWeighted, pearsonCorrelation,
  classifySchemeFromRoster, computeTeamArchetype, ARCHETYPES,
  computeArchetypeMatchupMatrix, computePositionPhysicalImpact,
  buildGameMatchupDataset, computeGameMatchupRelationship,
} from '../utils/insightEngine.js'
import games from '../data/games.json'
import { getCoach } from '../data/coachMeta.js'

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

// Preserves the insertion-order group sequence from constants.js
const METRIC_GROUPS_LIST = [...new Set(TEAM_METRICS.map(m => m.group))]

// Pre-grouped for <optgroup> rendering in selects
const METRIC_BY_GROUP = METRIC_GROUPS_LIST.map(group => ({
  group,
  metrics: TEAM_METRICS.filter(m => m.group === group),
}))

function CorrelationPanel() {
  const { xVar, yVar, yearRange, savedInsights, setXVar, setYVar, saveInsight, removeInsight } = useInsightStore()
  const [styleKey, setStyleKey]   = useState('three_rate_o')
  const [searchTerm, setSearchTerm] = useState('')

  const { points, correlation, n } = useMemo(() =>
    computeRelationship(enrichedSeasons, xVar, yVar, { yearRange })
  , [xVar, yVar, yearRange])

  const { valid, confidence, reason } = useMemo(() => scoreInsight(correlation, n), [correlation, n])
  const threshold         = useMemo(() => detectThreshold(enrichedSeasons, xVar, yVar, yearRange), [xVar, yVar, yearRange])
  const windows           = useMemo(() => timeWindowComparison(enrichedSeasons, xVar, yVar), [xVar, yVar])
  const styleInteractions = useMemo(() => detectStyleInteractions(enrichedSeasons, xVar, yVar, styleKey), [xVar, yVar, styleKey])

  const xMeta = ALL_METRICS_FLAT.find(m => m.key === xVar)
  const yMeta = ALL_METRICS_FLAT.find(m => m.key === yVar)
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
    return EXTENDED_METRIC_GROUPS.map(({ group, metrics }) => ({
      group,
      metrics: metrics.filter(m =>
        q === '' || m.label.toLowerCase().includes(q) || m.key.includes(q))
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
    <>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 28 }}>
      <div>
        {/* Metric selector + Save button */}
        <div style={{ ...CARD, marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            {[['X →', xVar, setXVar], ['Y ↑', yVar, setYVar]].map(([label, val, setter]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: '#6b7280', flexShrink: 0 }}>{label}</span>
                <select style={{ ...SEL, minWidth: 200 }} value={val} onChange={e => setter(e.target.value)}>
                  {EXTENDED_METRIC_GROUPS.map(({ group, metrics }) => (
                    <optgroup key={group} label={group}>
                      {metrics.map(m => (
                        <option key={m.key} value={m.key}>{m.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            ))}
            <button
              style={{ ...BTN(true), padding: '6px 16px', fontSize: 12, marginLeft: 'auto' }}
              onClick={handleSave}>
              Save Insight
            </button>
          </div>

          {/* Metric browser — collapsed by default */}
          <Accordion title="Browse all metrics" badge={`${ALL_METRICS_FLAT.length} metrics`}>
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
            <ComposedChart margin={{ top: threshold ? 28 : 8, right: 16, bottom: 28, left: 8 }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#a5b4fc' }}>Style Interaction</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {STYLE_KEYS.map(sk => (
                <button key={sk.key} style={BTN(styleKey === sk.key)} onClick={() => setStyleKey(sk.key)}>{sk.label}</button>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12, lineHeight: 1.55 }}>
            Does the X→Y relationship change based on playing style? Each bucket splits teams by {STYLE_KEYS.find(s => s.key === styleKey)?.label ?? styleKey} and re-computes the correlation. A big difference between buckets means the relationship is style-dependent — e.g., it may hold for uptempo teams but not slow ones.
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
          <div style={{ fontSize: 13, fontWeight: 600, color: '#a5b4fc', marginBottom: 6 }}>Stability Over Time</div>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12, lineHeight: 1.55 }}>
            Is this relationship consistent across seasons, or is it recent noise? The same correlation is re-computed over two time windows. If both r-values are similar, the pattern is reliable. If they diverge, the earlier or later window may be the outlier — check for rule changes or roster shifts.
          </div>
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
    <PageConclusions title="Correlation Takeaways" conclusions={[
      valid ? {
        label: 'Relationship',
        text: insightText,
        color: confidence === 'HIGH' ? '#10b981' : confidence === 'MEDIUM' ? '#f59e0b' : '#6b7280',
      } : {
        label: 'No Signal',
        text: `${xMeta?.label ?? xVar} → ${yMeta?.label ?? yVar}: ${reason ?? 'correlation too weak to interpret (|r| < 0.20 or n < 6).'}`,
        color: '#6b7280',
      },
      threshold ? {
        label: 'Threshold',
        text: `Teams with ${xMeta?.label ?? xVar} above ${threshold.threshold} average ${(threshold.aboveMean * (yMeta?.key?.includes('pct') || yMeta?.key === 'win_pct' ? 100 : 1)).toFixed(1)} vs ${(threshold.belowMean * (yMeta?.key?.includes('pct') || yMeta?.key === 'win_pct' ? 100 : 1)).toFixed(1)} below — a ${threshold.effect.toFixed(2)}-unit split effect.`,
        color: '#f59e0b',
      } : null,
      windows.length === 2 && windows[0].r != null && windows[1].r != null ? {
        label: 'Stability',
        text: `r = ${windows[0].r.toFixed(2)} in ${windows[0].label} vs ${windows[1].r.toFixed(2)} in ${windows[1].label} — ${Math.abs(windows[0].r - windows[1].r) < 0.15 ? 'relationship is stable across eras' : 'pattern has shifted — recent seasons may tell a different story'}.`,
        color: '#a5b4fc',
      } : null,
      {
        label: 'Coaching Use',
        text: (() => {
          const pred = xMeta?.label ?? xVar
          const outcome = yMeta?.label ?? yVar
          if (!valid) return `${pred} shows no reliable predictive relationship with ${outcome} in this dataset. Look for confounding factors or explore sub-group interactions via Style Interaction.`
          if (Math.abs(correlation) >= 0.55) return `Strong signal — directly prioritize ${pred} in roster construction and scheme design. Each unit of improvement is meaningfully associated with ${outcome} outcomes.`
          if (Math.abs(correlation) >= 0.35) return `Moderate signal — treat ${pred} as a supporting scouting filter alongside efficiency metrics. Investigate outliers in the scatter to find teams where the relationship breaks down.`
          return `Weak-to-moderate signal — ${pred} partially explains ${outcome} variance but should not be used as a standalone decision driver. Pair with additional context.`
        })(),
        color: valid ? (Math.abs(correlation) >= 0.55 ? '#10b981' : '#f59e0b') : '#6b7280',
      },
    ].filter(Boolean)} />
    </>
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

// Single combined card — averages stats across all selected years, shows coach, and
// puts a compact year-by-year history at the bottom when multiple years are active.
function SchemeCombinedCard({ school, years }) {
  const color = SCHOOL_COLORS[school]

  // Per-year data (memoised once)
  const yearData = useMemo(() => years.map(y => {
    const season = teamSeasons.find(s => s.school === school && s.year === y)
    const squad  = players.filter(p => p.school === school && p.year === y)
    const scheme = classifySchemeFromRoster(season, squad)
    const arch   = computeTeamArchetype(squad, season)
    const coach  = getCoach(school, y)
    return { year: y, season, squad, scheme, arch, coach }
  }), [school, years])

  // Average all numeric season stats → "typical season" used for scheme prediction
  const avgSeason = useMemo(() => {
    const valid = yearData.map(d => d.season).filter(Boolean)
    if (!valid.length) return null
    const avg = key => valid.reduce((s, ts) => s + (ts[key] ?? 0), 0) / valid.length
    return {
      tempo: avg('tempo'), three_rate_o: avg('three_rate_o'), tov_o: avg('tov_o'),
      two_pct_o: avg('two_pct_o'), blk_d: avg('blk_d'), efg_d: avg('efg_d'),
      tov_d: avg('tov_d'), efg_o: avg('efg_o'), stl_d: avg('stl_d'),
      adjoe: avg('adjoe'), adjde: avg('adjde'), win_pct: avg('win_pct'),
      ppp: avg('ppp') || null,
    }
  }, [yearData])

  // Use the most recent year's squad for scheme/archetype classification
  const latestData  = yearData[yearData.length - 1]
  const baseSquad   = latestData?.squad ?? []
  const combined    = useMemo(() => classifySchemeFromRoster(avgSeason, baseSquad), [avgSeason, baseSquad])
  const combinedArch= useMemo(() => computeTeamArchetype(baseSquad, avgSeason), [baseSquad, avgSeason])

  // Coach — detect if it changed across the selected years
  const latestCoach  = latestData?.coach
  const coachChanged = years.length > 1 && yearData.some(d => d.coach?.name !== latestCoach?.name)
  const yearLabel    = years.length === 1 ? `${years[0]}` : `${years[0]}–${years[years.length - 1]}`

  return (
    <div style={{ background: T.surf2, borderRadius: 10, padding: '16px 18px', border: `1px solid ${T.border}` }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1.1 }}>{yearLabel}</div>
          {years.length > 1 && (
            <div style={{ fontSize: 10, color: T.textLow, marginTop: 2 }}>averaged · {years.length} seasons</div>
          )}
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 4,
          background: `${color}22`, color }}>
          {combinedArch.archetype}
        </span>
      </div>

      {/* Coach */}
      {latestCoach && (
        <div style={{ marginBottom: 12, padding: '9px 11px', background: T.surf, borderRadius: 7,
          borderLeft: `3px solid ${color}` }}>
          <div style={{ fontSize: 9, color: T.textMin, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
            Head Coach{coachChanged ? ` (${latestData.year})` : ''}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{latestCoach.name}</div>
          <div style={{ fontSize: 11, color: T.textMd, marginTop: 3, lineHeight: 1.5 }}>{latestCoach.style}</div>
        </div>
      )}

      {/* Offense */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9, color: T.textMin, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Offense</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.amber, marginBottom: 4 }}>{combined.offScheme}</div>
        {combined.offSignals.map((s, i) => (
          <div key={i} style={{ fontSize: 11, color: T.textMd }}>▸ {s}</div>
        ))}
      </div>

      {/* Defense */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: T.textMin, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Defense</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.accentSoft, marginBottom: 4 }}>{combined.defScheme}</div>
        {combined.defSignals.map((s, i) => (
          <div key={i} style={{ fontSize: 11, color: T.textMd }}>▸ {s}</div>
        ))}
      </div>

      {/* Averaged efficacy */}
      {avgSeason && (
        <div style={{ paddingTop: 10, borderTop: `1px solid ${T.border}`,
          marginBottom: years.length > 1 ? 12 : 0, display: 'flex', gap: 16 }}>
          {[
            ['Ivy Win%', (() => { const r = archetypeLeagueWinRates[combinedArch.archetype]; return r ? `${r.avg}% (n=${r.n})` : '—' })()],
            ['AdjOE', avgSeason.adjoe?.toFixed(1)],
            ['AdjDE', avgSeason.adjde?.toFixed(1)],
            ['PPP',   avgSeason.ppp?.toFixed(1)],
          ].map(([lbl, val]) => (
            <div key={lbl} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{val ?? '—'}</div>
              <div style={{ fontSize: 9, color: T.textLow }}>{lbl}</div>
            </div>
          ))}
        </div>
      )}

      {/* Year-by-year history — only shown when multiple years selected */}
      {years.length > 1 && (
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
          <div style={{ fontSize: 9, color: T.textMin, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Year History
          </div>
          {yearData.map(d => (
            <div key={d.year} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color, width: 38, flexShrink: 0 }}>{d.year}</span>
              <span style={{ fontSize: 11, color: T.amber, flex: 1, minWidth: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.scheme.offScheme}
              </span>
              <span style={{ fontSize: 11, color: T.accentSoft, flex: 1, minWidth: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.scheme.defScheme}
              </span>
              <span style={{ fontSize: 11, color: T.textLow, flexShrink: 0 }}>
                {d.season?.record ?? '—'}
              </span>
              {coachChanged && (
                <span style={{ fontSize: 10, color: T.textMin, flexShrink: 0 }}>
                  {d.coach?.name?.split(' ').slice(-1)[0]}
                </span>
              )}
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
  const [activeYears,  setActiveYears]  = useState(new Set([2022, 2023, 2024, 2025]))

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

      <SchemeCombinedCard school={school} years={sortedYears} />

      <button
        onClick={() => {
          const cards = sortedYears.map(y => {
            const s  = teamSeasons.find(ts => ts.school === school && ts.year === y)
            const sq = players.filter(p => p.school === school && p.year === y)
            const sc = classifySchemeFromRoster(s, sq)
            const ar = computeTeamArchetype(sq, s)
            const co = getCoach(school, y)
            return { year: y, offScheme: sc.offScheme, defScheme: sc.defScheme,
                     archetype: ar.archetype, winPct: s?.win_pct, adjoe: s?.adjoe,
                     adjde: s?.adjde, ppp: s?.ppp, record: s?.record, coach: co?.name }
          })
          saveScheme({
            id:      `scheme_${school}_${sortedYears.join('_')}`,
            school,
            years:   sortedYears,
            label:   `${SCHOOL_META[school].abbr} · ${sortedYears.length > 1 ? `${sortedYears[0]}–${sortedYears[sortedYears.length-1]}` : sortedYears[0]}`,
            cards,
            savedAt: new Date().toLocaleDateString(),
          })
        }}
        style={{ ...BTN(true, T.accent), padding: '7px 18px', fontSize: 13, marginTop: 12 }}
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* ── Section 1: Team Roster Analysis ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMin, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Team Roster Analysis
          </div>
          <div style={{ flex: 1, height: 1, background: T.border }} />
        </div>
        <SchemeClassifierPanel />
        <SavedSchemes />
      </div>

      {/* ── Divider ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <div style={{ flex: 1, height: 1, background: T.border }} />
        <div style={{ fontSize: 11, fontWeight: 700, color: T.textMin, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
          League-Wide Analysis
        </div>
        <div style={{ flex: 1, height: 1, background: T.border }} />
      </div>

      {/* ── Section 2: League Scheme Overview ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
        <SchemeHalf title="Offensive Schemes" schemeType="off" metrics={OFF_METRICS} defaultMetric="win_pct" colors={OFF_COLORS} descriptions={OFF_DESCRIPTIONS} />
        <SchemeHalf title="Defensive Schemes" schemeType="def" metrics={DEF_METRICS} defaultMetric="adjde"   colors={DEF_COLORS} descriptions={DEF_DESCRIPTIONS} />
      </div>

      <PageConclusions title="Scheme Takeaways" conclusions={(() => {
        const offData = schemeBreakdown(teamSeasons, 'off', 'win_pct').sort((a, b) => (b.avgWinPct ?? 0) - (a.avgWinPct ?? 0))
        const defData = schemeBreakdown(teamSeasons, 'def', 'win_pct').sort((a, b) => (b.avgWinPct ?? 0) - (a.avgWinPct ?? 0))
        return [
          offData[0] ? {
            label: 'Best Off. Style',
            text: `${offData[0].scheme} teams post the highest Ivy win rate (${(offData[0].avgWinPct * 100).toFixed(0)}%, n=${offData[0].n}), ${offData[offData.length-1].scheme} teams the lowest (${(offData[offData.length-1].avgWinPct * 100).toFixed(0)}%). Scheme alone explains meaningful win-rate variance.`,
            color: '#f59e0b',
          } : null,
          defData[0] ? {
            label: 'Best Def. Style',
            text: `${defData[0].scheme} defenses average the best win rate (${(defData[0].avgWinPct * 100).toFixed(0)}%, n=${defData[0].n}). ${defData[defData.length-1].scheme} teams struggle most (${(defData[defData.length-1].avgWinPct * 100).toFixed(0)}%) — likely a talent correlate, not solely a scheme effect.`,
            color: '#a5b4fc',
          } : null,
          (() => {
            const offWinRates = offData.map(s => s.avgWinPct ?? 0)
            const spread = offWinRates.length >= 2 ? ((Math.max(...offWinRates) - Math.min(...offWinRates)) * 100).toFixed(0) : null
            const bestOff = offData[0], bestDef = defData[0]
            if (!spread || !bestOff || !bestDef) return null
            return {
              label: 'Combined Edge',
              text: `Teams running ${bestOff.scheme} offense AND ${bestDef.scheme} defense represent the optimal scheme combination in recent Ivy data. The offensive win-rate spread across schemes is ${spread} percentage points — scheme identity matters, but talent within the scheme matters more.`,
              color: '#10b981',
            }
          })(),
          {
            label: 'Context',
            text: 'Scheme classification uses season-level tempo, 3-pt rate, TOV%, block%, and eFG% allowed. Individual team snapshots use the Roster Classifier above for a roster-composition view.',
            color: '#6b7280',
          },
        ].filter(Boolean)
      })()} />

    </div>
  )
}

// ── Roster & Bio Tab ─────────────────────────────────────────────────────────

const ROSTER_METRIC_GROUPS = [
  { group: 'Overall Roster', metrics: [
    { key: 'avg_height_in',  label: 'Avg Height (in)' },
    { key: 'avg_weight_lbs', label: 'Avg Weight (lbs)' },
    { key: 'avg_experience', label: 'Avg Experience' },
    { key: 'pct_guards',     label: '% Guard Minutes' },
    { key: 'pct_forwards',   label: '% Forward Minutes' },
    { key: 'pct_bigs',       label: '% Big Minutes' },
  ]},
  { group: 'Guards', metrics: [
    { key: 'guard_avg_height', label: 'Guard Avg Height (in)' },
    { key: 'guard_avg_weight', label: 'Guard Avg Weight (lbs)' },
    { key: 'guard_avg_exp',    label: 'Guard Avg Experience' },
    { key: 'guard_avg_ortg',   label: 'Guard Avg ORTG' },
    { key: 'guard_avg_bpm',    label: 'Guard Avg BPM' },
    { key: 'guard_min_share',  label: 'Guard Min Share (%)' },
  ]},
  { group: 'Forwards', metrics: [
    { key: 'fwd_avg_height', label: 'Forward Avg Height (in)' },
    { key: 'fwd_avg_weight', label: 'Forward Avg Weight (lbs)' },
    { key: 'fwd_avg_exp',    label: 'Forward Avg Experience' },
    { key: 'fwd_avg_ortg',   label: 'Forward Avg ORTG' },
    { key: 'fwd_avg_bpm',    label: 'Forward Avg BPM' },
    { key: 'fwd_min_share',  label: 'Forward Min Share (%)' },
  ]},
  { group: 'Bigs / Centers', metrics: [
    { key: 'big_avg_height', label: 'Big Avg Height (in)' },
    { key: 'big_avg_weight', label: 'Big Avg Weight (lbs)' },
    { key: 'big_avg_exp',    label: 'Big Avg Experience' },
    { key: 'big_avg_ortg',   label: 'Big Avg ORTG' },
    { key: 'big_avg_bpm',    label: 'Big Avg BPM' },
    { key: 'big_min_share',  label: 'Big Min Share (%)' },
  ]},
]

const MATCHUP_X_GROUPS = [
  { group: 'Overall Differential', metrics: [
    { key: 'overall_ht_diff',  label: 'Overall Height Diff (in)' },
    { key: 'overall_wt_diff',  label: 'Overall Weight Diff (lbs)' },
    { key: 'overall_exp_diff', label: 'Overall Experience Diff' },
  ]},
  { group: 'Guard Differential', metrics: [
    { key: 'guard_ht_diff',   label: 'Guard Height Diff (in)' },
    { key: 'guard_wt_diff',   label: 'Guard Weight Diff (lbs)' },
    { key: 'guard_exp_diff',  label: 'Guard Experience Diff' },
    { key: 'guard_ortg_diff', label: 'Guard ORTG Diff' },
    { key: 'guard_bpm_diff',  label: 'Guard BPM Diff' },
  ]},
  { group: 'Forward Differential', metrics: [
    { key: 'fwd_ht_diff',   label: 'Forward Height Diff (in)' },
    { key: 'fwd_wt_diff',   label: 'Forward Weight Diff (lbs)' },
    { key: 'fwd_exp_diff',  label: 'Forward Experience Diff' },
    { key: 'fwd_ortg_diff', label: 'Forward ORTG Diff' },
    { key: 'fwd_bpm_diff',  label: 'Forward BPM Diff' },
  ]},
  { group: 'Big/Center Differential', metrics: [
    { key: 'big_ht_diff',   label: 'Big Height Diff (in)' },
    { key: 'big_wt_diff',   label: 'Big Weight Diff (lbs)' },
    { key: 'big_exp_diff',  label: 'Big Experience Diff' },
    { key: 'big_ortg_diff', label: 'Big ORTG Diff' },
    { key: 'big_bpm_diff',  label: 'Big BPM Diff' },
  ]},
]

const MATCHUP_Y_METRICS = [
  { key: 'pts_diff', label: 'Point Differential' },
  { key: 'win',      label: 'Win (1 = win, 0 = loss)' },
]

const rosterAggsWeighted     = buildRosterAggregatesWeighted(players)

// League-wide average win% by archetype across all 32 team-seasons
const archetypeLeagueWinRates = (() => {
  const result = {}
  for (const ts of teamSeasons) {
    const squad = players.filter(p => p.school === ts.school && p.year === ts.year)
    const arch  = computeTeamArchetype(squad, ts).archetype
    if (!result[arch]) result[arch] = { total: 0, n: 0 }
    result[arch].total += ts.win_pct ?? 0
    result[arch].n++
  }
  return Object.fromEntries(
    Object.entries(result).map(([k, { total, n }]) => [k, { avg: +(total / n * 100).toFixed(0), n }])
  )
})()
const archetypeMatchupData   = computeArchetypeMatchupMatrix(teamSeasons, players, games)
const positionPhysicalImpact = computePositionPhysicalImpact(games, players)
const gameMatchupDataset     = buildGameMatchupDataset(games, players)

// teamSeasons enriched with position-level roster agg fields so the Correlation
// tab can scatter guard/forward/big averages against any team outcome.
const enrichedSeasons = (() => {
  const aggMap = {}
  for (const a of rosterAggsWeighted) aggMap[`${a.school}||${a.year}`] = a
  return teamSeasons.map(s => ({ ...(aggMap[`${s.school}||${s.year}`] ?? {}), ...s }))
})()

// Flat list of all metrics available in the Correlation tab (team + roster).
const ALL_METRICS_FLAT = [
  ...TEAM_METRICS,
  ...ROSTER_METRIC_GROUPS.flatMap(g => g.metrics),
]

// All optgroups for the X/Y dropdowns in the Correlation tab.
const EXTENDED_METRIC_GROUPS = [
  ...METRIC_BY_GROUP,
  ...ROSTER_METRIC_GROUPS,
]

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

// ── Roster & Bio Panel (unified scatter) ──────────────────────────────────────

function makeRegLine(points) {
  if (points.length < 3) return []
  const { slope, intercept } = linearRegression(points)
  const xs = points.map(p => p.x)
  const xMin = Math.min(...xs), xMax = Math.max(...xs)
  const pad = (xMax - xMin) * 0.05
  return [
    { x: xMin - pad, y: slope * (xMin - pad) + intercept },
    { x: xMax + pad, y: slope * (xMax + pad) + intercept },
  ]
}

function RosterBioPanel() {
  const { saveRosterFinding, removeRosterFinding, savedRosterFindings } = useInsightStore()
  const [matchupXVar, setMatchupXVar] = useState('guard_ht_diff')
  const [matchupYVar, setMatchupYVar] = useState('pts_diff')

  const matchupRel = useMemo(() =>
    computeGameMatchupRelationship(gameMatchupDataset, matchupXVar, matchupYVar)
  , [matchupXVar, matchupYVar])
  const { confidence } = useMemo(() => scoreInsight(matchupRel.correlation, matchupRel.n), [matchupRel])
  const regLine = useMemo(() => makeRegLine(matchupRel.points), [matchupRel])

  const xLabel = MATCHUP_X_GROUPS.flatMap(g => g.metrics).find(m => m.key === matchupXVar)?.label ?? matchupXVar
  const yLabel = MATCHUP_Y_METRICS.find(m => m.key === matchupYVar)?.label ?? matchupYVar

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Game Matchup scatter ── */}
      <div style={CARD}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.accentSoft }}>Physical Differentials → Game Outcomes</div>
          <div style={{ fontSize: 11, color: T.textLow, marginTop: 2 }}>
            Game-level position physical differentials · {matchupRel.n} Ivy matchups · 2022–2025
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: T.textLow }}>X →</span>
            <select style={{ ...SEL, minWidth: 220 }} value={matchupXVar} onChange={e => setMatchupXVar(e.target.value)}>
              {MATCHUP_X_GROUPS.map(({ group, metrics }) => (
                <optgroup key={group} label={group}>
                  {metrics.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: T.textLow }}>Y ↑</span>
            <select style={SEL} value={matchupYVar} onChange={e => setMatchupYVar(e.target.value)}>
              {MATCHUP_Y_METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </div>
          <button
            onClick={() => {
              const { valid } = scoreInsight(matchupRel.correlation, matchupRel.n)
              if (!valid) return
              saveRosterFinding({
                id: `matchup_${matchupXVar}_${matchupYVar}`,
                type: 'matchup',
                title: `${xLabel} → ${yLabel}`,
                body: `r = ${matchupRel.correlation.toFixed(3)} · n = ${matchupRel.n} games`,
                savedAt: new Date().toLocaleDateString(),
              })
            }}
            style={{ ...BTN(true, T.accent), padding: '5px 14px', fontSize: 12 }}
          >Save</button>
          <span style={{ fontSize: 11, color: T.textLow }}>
            {(() => { const { valid, reason } = scoreInsight(matchupRel.correlation, matchupRel.n); return valid ? `r = ${matchupRel.correlation.toFixed(3)}` : reason })()}
          </span>
        </div>

        <ScatterBlock
          points={matchupRel.points}
          regressionLine={regLine}
          correlation={matchupRel.correlation}
          n={matchupRel.n}
          confidence={confidence}
          xLabel={xLabel}
          yLabel={yLabel}
          tooltipExtra={(d) => d.opp_school
            ? <div style={{ color: T.textMd, fontSize: 11 }}>vs {SCHOOL_META[d.opp_school]?.abbr}</div>
            : null}
        />

        {positionPhysicalImpact && (
          <div style={{ marginTop: 16, background: T.surf3, border: `1px solid ${T.amberBg}`, borderRadius: 8, padding: '12px 14px', fontSize: 12, color: T.textMd, lineHeight: 1.7 }}>
            <span style={{ color: T.amber, fontWeight: 600 }}>OLS context — </span>
            All physical diffs combined explain <strong style={{ color: T.text }}>{(positionPhysicalImpact.r2 * 100).toFixed(0)}%</strong> of score-diff variance
            across {positionPhysicalImpact.n} matchups.
            Strongest signal: guard weight (r = {positionPhysicalImpact.pearson.guardWeight > 0 ? '+' : ''}{positionPhysicalImpact.pearson.guardWeight}).
          </div>
        )}
      </div>

      {/* ── Archetype Matchup Matrix ── */}
      <div style={CARD}>
        <Accordion title="Archetype Matchup Matrix" badge={`${ARCHETYPES.length}×${ARCHETYPES.length} pairings · click cell to save`}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 500 }}>
              <thead>
                <tr>
                  <th style={{ padding: '6px 12px', fontSize: 10, color: T.textLow, textAlign: 'left', borderBottom: `1px solid ${T.border}`, background: T.bgDeep }}>
                    Offense ↓ vs Defense →
                  </th>
                  {archetypeMatchupData.archetypes.map(b => (
                    <th key={b} style={{ padding: '6px 10px', fontSize: 10, color: T.textMd, fontWeight: 600, textAlign: 'center', borderBottom: `1px solid ${T.border}`, background: T.bgDeep, whiteSpace: 'nowrap' }}>
                      {b}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {archetypeMatchupData.archetypes.map(a => (
                  <tr key={a} style={{ borderBottom: `1px solid ${T.surf}` }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600, color: T.accentSoft, whiteSpace: 'nowrap', background: T.surf3 }}>{a}</td>
                    {archetypeMatchupData.archetypes.map(b => {
                      const cell = archetypeMatchupData.matrix[a][b]
                      if (!cell) return <td key={b} style={{ padding: '8px 10px', textAlign: 'center', color: T.textMin }}>—</td>
                      const wr = cell.winRate
                      const bg = wr >= 60 ? T.greenBg : wr >= 50 ? `${T.accent}22` : wr >= 40 ? T.amberBg : T.redBg
                      const fg = wr >= 60 ? T.green : wr >= 50 ? T.accentSoft : wr >= 40 ? T.amber : T.red
                      const isSaved = savedRosterFindings.some(f => f.id === `arch_${a}_${b}`)
                      return (
                        <td key={b} title="Click to save" onClick={() => saveRosterFinding({
                            id: `arch_${a}_${b}`, type: 'archetype',
                            title: `${a} vs ${b}`,
                            body: `${wr}% win rate · ${cell.wins}W–${cell.games - cell.wins}L · ${cell.games} games`,
                            savedAt: new Date().toLocaleDateString(),
                          })}
                          style={{ padding: '8px 10px', textAlign: 'center', background: bg,
                            cursor: 'pointer', outline: isSaved ? `2px solid ${fg}` : 'none' }}>
                          <div style={{ fontWeight: 700, color: fg }}>{wr}%</div>
                          <div style={{ fontSize: 9, color: T.textMin }}>{cell.games}g</div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11, color: T.textMin, marginTop: 8 }}>
            Green ≥ 60% · Purple 50–60% · Amber 40–50% · Red &lt; 40%
          </div>
        </Accordion>
      </div>

      {/* ── Saved Findings ── */}
      {savedRosterFindings.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.accentSoft, marginBottom: 10 }}>Saved Findings</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {savedRosterFindings.map(item => (
              <div key={item.id} style={{ background: T.surf, border: `1px solid ${T.border}`, borderRadius: 8, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4,
                      background: item.type === 'archetype' ? `${T.accent}22` : item.type === 'matchup' ? `${T.cyan}22` : T.greenBg,
                      color:      item.type === 'archetype' ? T.accentSoft   : item.type === 'matchup' ? T.cyan       : T.green,
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

      <PageConclusions title="Physical Matchup Takeaways" conclusions={[
        {
          label: 'OLS Summary',
          text: positionPhysicalImpact
            ? `Position-level physical diffs explain ${(positionPhysicalImpact.r2 * 100).toFixed(0)}% of game score variance across ${positionPhysicalImpact.n} Ivy matchups. Guard weight (r = ${positionPhysicalImpact.pearson.guardWeight > 0 ? '+' : ''}${positionPhysicalImpact.pearson.guardWeight}) is the strongest trainable signal — more so than center height (r = ${positionPhysicalImpact.pearson.bigHeight}).`
            : 'Not enough game data to compute OLS.',
          color: T.amber,
        },
        {
          label: 'Implication',
          text: 'Physical attributes alone are a weak predictor — roughly 85%+ of outcome variance comes from skill, scheme, and efficiency. Roster physical edge is a tie-breaker, not a driver. Focus scatter analysis on matchups where r > 0.30.',
          color: T.textMd,
        },
        {
          label: 'How to Use',
          text: 'Select a position differential on the X-axis and point differential on Y. Look for r > 0.25 as evidence of physical leverage in Ivy-specific matchups.',
          color: T.accentSoft,
        },
      ]} />

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
        subtitle={`32 team-seasons · 458 player-seasons · 236 Ivy games · ${ALL_METRICS_FLAT.length} metrics · 2022–2025`}
        stats={[]}
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

      <MethodologyPanel
        howItWorks="Insights Lab computes Pearson correlations between team-season metrics and win%, surfaces statistically significant relationships, and scores each insight by sample size and effect size. Scheme classification uses four-factor and tempo thresholds calibrated to Ivy League distributions. Biodata analysis tests whether physical roster attributes (height, experience, position mix) correlate with performance outcomes."
        sections={[
          { title: 'Efficiency',        keys: ['adjoe', 'adjde', 'net_efficiency', 'barthag'] },
          { title: 'Four Factors',      keys: ['efg_o', 'efg_d', 'tov_o', 'tov_d', 'orb', 'drb', 'ftr_o', 'ftr_d'] },
          { title: 'Shooting',          keys: ['three_pct_o', 'three_pct_d', 'three_rate_o', 'two_pct_o', 'two_pct_d', 'ft_pct'] },
          { title: 'Roster Attributes', keys: ['avg_height_in', 'avg_experience', 'pct_guards', 'pct_forwards', 'pct_bigs'] },
          { title: 'Record',            keys: ['win_pct', 'conf_win_pct'] },
        ]}
      />
      </div>{/* end inner padding wrapper */}
    </div>
  )
}
