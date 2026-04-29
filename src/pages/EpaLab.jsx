import { useMemo } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import teamSeasons from '../data/teamSeasons.json'
import gameLogs from '../data/gameLogs.json'
import { runTier1Regression, runTier2Regression } from '../utils/epaEngine.js'
import useEpaStore from '../store/useEpaStore.js'
import PageHeader from '../components/shared/PageHeader.jsx'
import { T, CARD, BTN } from '../styles/theme.js'

// ── Sub-components ─────────────────────────────────────────────────────────────

const EVENT_ROWS = [
  { key: 'made2FG',            label: 'Made 2-pt FG'          },
  { key: 'made3FG',            label: 'Made 3-pt FG'          },
  { key: 'offTurnover',        label: 'Offensive Turnover'    },
  { key: 'offRebound',         label: 'Offensive Rebound'     },
  { key: 'foulDrawn',          label: 'Foul Drawn (FT)'       },
  { key: 'defForcedTurnover',  label: 'Forced Turnover (def)' },
  { key: 'defShotSuppression', label: 'Shot Suppression (def)'},
]

const COEFF_ROWS = [
  { key: 'off_eFG', label: 'Off eFG%',   interp: 'Higher shooting quality → more net pts' },
  { key: 'off_TOV', label: 'Off TOV%',   interp: 'Each extra turnover → net efficiency loss' },
  { key: 'off_ORB', label: 'Off ORB%',   interp: 'Extra offensive board → extra possession' },
  { key: 'off_FTR', label: 'Off FTR',    interp: 'Drawing fouls → marginal scoring edge' },
  { key: 'def_eFG', label: 'Def eFG%',   interp: 'Allowing better shooting → efficiency loss' },
  { key: 'def_TOV', label: 'Def TOV%',   interp: 'Forcing opponent TOs → net efficiency gain' },
  { key: 'def_ORB', label: 'Def ORB%',   interp: 'Opponent offensive boards → efficiency loss' },
  { key: 'def_FTR', label: 'Def FTR',    interp: 'Opponent free throws → efficiency loss' },
]

function EpaPill({ value }) {
  const pos = value >= 0
  return (
    <span style={{
      background: pos ? '#E1F5EE' : '#FCEBEB',
      color:      pos ? '#085041' : '#791F1F',
      borderRadius: 4, padding: '2px 8px',
      fontSize: 12, fontWeight: 700, display: 'inline-block', minWidth: 52, textAlign: 'center',
    }}>
      {pos ? '+' : ''}{value.toFixed(3)}
    </span>
  )
}

function EventEPATable({ result }) {
  if (result.error) return <ErrorBox msg={result.error} />
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: `1px solid ${T.border}` }}>
          <th style={{ textAlign: 'left', padding: '6px 0', color: T.textLow, fontWeight: 500 }}>Event</th>
          <th style={{ textAlign: 'right', padding: '6px 0', color: T.textLow, fontWeight: 500 }}>EPA</th>
        </tr>
      </thead>
      <tbody>
        {EVENT_ROWS.map(({ key, label }) => (
          <tr key={key} style={{ borderBottom: `1px solid ${T.border}20` }}>
            <td style={{ padding: '7px 0', color: T.textMd }}>{label}</td>
            <td style={{ padding: '7px 0', textAlign: 'right' }}>
              <EpaPill value={result.eventEPA[key]} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function CoeffTable({ result }) {
  if (result.error) return <ErrorBox msg={result.error} />
  return (
    <div>
      <p style={{ fontSize: 11, color: T.textLow, marginBottom: 10 }}>
        β_TOV of −1.2 means one extra turnover per 100 possessions costs 1.2 pts of net efficiency.
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${T.border}` }}>
            <th style={{ textAlign: 'left', padding: '5px 0', color: T.textLow, fontWeight: 500 }}>Factor</th>
            <th style={{ textAlign: 'right', padding: '5px 0', color: T.textLow, fontWeight: 500 }}>β</th>
            <th style={{ textAlign: 'left', padding: '5px 8px', color: T.textLow, fontWeight: 500 }}>Interpretation</th>
          </tr>
        </thead>
        <tbody>
          {COEFF_ROWS.map(({ key, label, interp }) => (
            <tr key={key} style={{ borderBottom: `1px solid ${T.border}20` }}>
              <td style={{ padding: '6px 0', color: T.textMd }}>{label}</td>
              <td style={{ padding: '6px 0', textAlign: 'right', fontFamily: 'monospace', color: T.text }}>
                {result.coefficients[key]?.toFixed(4) ?? '—'}
              </td>
              <td style={{ padding: '6px 8px', color: T.textLow, fontSize: 11 }}>{interp}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ScatterPlot({ result }) {
  if (result.error) return <ErrorBox msg={result.error} />
  const min = Math.min(...result.observations.map(o => Math.min(o.actual, o.predicted))) - 2
  const max = Math.max(...result.observations.map(o => Math.max(o.actual, o.predicted))) + 2
  return (
    <div>
      <div style={{ fontSize: 11, color: T.textLow, marginBottom: 8 }}>
        R² = {result.r2.toFixed(3)} — {result.n} observations · dots near the diagonal = good fit
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <ScatterChart margin={{ top: 4, right: 12, bottom: 12, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
          <XAxis dataKey="actual"    type="number" domain={[min, max]} name="Actual"    tick={{ fontSize: 10, fill: T.textLow }} label={{ value: 'Actual net eff.', position: 'insideBottom', offset: -4, fontSize: 10, fill: T.textLow }} />
          <YAxis dataKey="predicted" type="number" domain={[min, max]} name="Predicted" tick={{ fontSize: 10, fill: T.textLow }} width={36} />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => {
            if (!payload?.length) return null
            const { label, actual, predicted } = payload[0].payload
            return (
              <div style={{ background: T.surf, border: `1px solid ${T.border}`, borderRadius: 6, padding: '6px 10px', fontSize: 11 }}>
                <div style={{ color: T.text, fontWeight: 600, marginBottom: 2 }}>{label}</div>
                <div style={{ color: T.textMd }}>Actual: {actual.toFixed(1)}</div>
                <div style={{ color: T.textMd }}>Predicted: {predicted.toFixed(1)}</div>
              </div>
            )
          }} />
          <ReferenceLine segment={[{ x: min, y: min }, { x: max, y: max }]} stroke={T.accent} strokeDasharray="4 4" strokeOpacity={0.6} />
          <Scatter data={result.observations} fill={T.accentSoft} fillOpacity={0.75} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}

function ErrorBox({ msg }) {
  return (
    <div style={{ background: '#FCEBEB', color: '#791F1F', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      {msg}
    </div>
  )
}

function TierSection({ title, badge, result, activeComparison }) {
  if (!result) return (
    <div style={{ ...CARD, marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: T.textLow, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, color: T.textMin, fontFamily: 'monospace' }}>
        Game log data not loaded. Run: node scripts/generate-mock-gamelogs.mjs
      </div>
    </div>
  )
  return (
    <div style={{ ...CARD, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ background: T.accent + '22', color: T.accentSoft, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
          {badge}
        </span>
        <span style={{ fontSize: 12, color: T.textMd }}>{result.label}</span>
        {!result.error && (
          <>
            <span style={{ fontSize: 11, color: T.textLow }}>R² = {result.r2?.toFixed(3)}</span>
            <span style={{ fontSize: 11, color: T.textLow }}>RMSE = {result.rmse}</span>
          </>
        )}
      </div>
      {activeComparison === 'events'       && <EventEPATable result={result} />}
      {activeComparison === 'coefficients' && <CoeffTable    result={result} />}
      {activeComparison === 'scatter'      && <ScatterPlot   result={result} />}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

const TABS = ['events', 'coefficients', 'scatter']

export default function EpaLab() {
  const { ivyOnly, activeComparison, setIvyOnly, setActiveComparison } = useEpaStore()

  const tier1 = useMemo(() => {
    try { return runTier1Regression(teamSeasons) }
    catch (e) { return { error: e.message } }
  }, [])

  const tier2 = useMemo(() => {
    if (!gameLogs?.length) return null
    try { return runTier2Regression(gameLogs, { ivyOnly }) }
    catch (e) { return { error: e.message } }
  }, [ivyOnly])

  return (
    <div style={{ background: T.bg, minHeight: '100vh' }}>
      <PageHeader
        title="EPA Lab"
        subtitle="Derives event Estimated Points Added from OLS regression on four-factor data — no assumed weights."
        stats={!tier1.error ? [
          { label: 'Tier 1 R²',   value: tier1.r2?.toFixed(3),  color: tier1.r2 > 0.7 ? T.green : T.amber },
          { label: 'Tier 1 n',    value: tier1.n },
          { label: 'Tier 1 RMSE', value: tier1.rmse },
        ] : []}
        controls={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.textMd, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={ivyOnly}
                onChange={e => setIvyOnly(e.target.checked)}
                style={{ accentColor: T.accent }}
              />
              Ivy-vs-Ivy only (Tier 2)
            </label>
            <div style={{ display: 'flex', gap: 4 }}>
              {TABS.map(tab => (
                <button key={tab} style={BTN(activeComparison === tab)} onClick={() => setActiveComparison(tab)}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>
        }
      />

      <div style={{ padding: '0 28px 40px' }}>
        <div style={{ fontSize: 11, color: T.amber, background: T.amberBg, borderRadius: 6, padding: '6px 12px', marginBottom: 20, display: 'inline-block' }}>
          Using synthetic data — replace gameLogs.json with output from fetch-game-logs.mjs for real Barttorvik game-log data.
        </div>

        <TierSection title="Tier 1" badge="TIER 1" result={tier1} activeComparison={activeComparison} />
        <TierSection title="Tier 2" badge="TIER 2" result={tier2} activeComparison={activeComparison} />
      </div>
    </div>
  )
}
