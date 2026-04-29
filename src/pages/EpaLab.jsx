import { useMemo } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import teamSeasons from '../data/teamSeasons.json'
import gameLogs    from '../data/gameLogs.json'
import { runEPAPipeline } from '../utils/epaModels/pipeline.js'
import { runTier2Pipeline } from '../utils/epaModels/tier2.js'
import useEpaStore from '../store/useEpaStore.js'
import PageHeader from '../components/shared/PageHeader.jsx'
import DiagnosticsPanel from '../components/epa/DiagnosticsPanel.jsx'
import ModelComparisonTable from '../components/epa/ModelComparisonTable.jsx'
import { T, CARD, BTN } from '../styles/theme.js'

// ── Shared sub-components ─────────────────────────────────────────────────────

function EpaPill({ value }) {
  const pos = value > 0
  const zero = value === 0
  return (
    <span style={{
      background: zero ? T.surf2 : pos ? '#E1F5EE' : '#FCEBEB',
      color:      zero ? T.textLow : pos ? '#085041' : '#791F1F',
      borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 700,
      display: 'inline-block', minWidth: 58, textAlign: 'center',
    }}>
      {zero ? '0 (constrained)' : `${pos ? '+' : ''}${value.toFixed(3)}`}
    </span>
  )
}

const EVENT_ROWS = [
  { key: 'made2FG',            label: 'Made 2-pt FG'           },
  { key: 'made3FG',            label: 'Made 3-pt FG'           },
  { key: 'offTurnover',        label: 'Offensive Turnover'     },
  { key: 'offRebound',         label: 'Offensive Rebound'      },
  { key: 'foulDrawn',          label: 'Foul Drawn (FT)'        },
  { key: 'defForcedTurnover',  label: 'Forced Turnover (def)'  },
  { key: 'defShotSuppression', label: 'Shot Suppression (def)' },
]

const COEFF_META = [
  { key: 'off_eFG', label: 'Off eFG%',  note: 'shooting quality' },
  { key: 'off_TOV', label: 'Off TOV',   note: 'tov_o (directional encoding unclear in Barttorvik)' },
  { key: 'off_ORB', label: 'Off ORB',   note: 'orb (directional encoding unclear in Barttorvik)' },
  { key: 'off_FTR', label: 'Off FTR',   note: 'free throw rate' },
  { key: 'def_eFG', label: 'Def eFG%',  note: 'opponent shooting quality' },
  { key: 'def_TOV', label: 'Def TOV',   note: 'tov_d (directional encoding unclear in Barttorvik)' },
  { key: 'def_ORB', label: 'Def ORB',   note: 'drb (directional encoding unclear in Barttorvik)' },
  { key: 'def_FTR', label: 'Def FTR',   note: 'opponent free throw rate' },
]

function EventEPATable({ epa }) {
  if (!epa) return <div style={{ color: T.textMin, fontSize: 12 }}>No EPA values</div>
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: `1px solid ${T.border}` }}>
          <th style={{ textAlign: 'left', padding: '5px 0', color: T.textLow, fontWeight: 500 }}>Event</th>
          <th style={{ textAlign: 'right', padding: '5px 0', color: T.textLow, fontWeight: 500 }}>EPA</th>
        </tr>
      </thead>
      <tbody>
        {EVENT_ROWS.map(({ key, label }) => (
          <tr key={key} style={{ borderBottom: `1px solid ${T.border}20` }}>
            <td style={{ padding: '7px 0', color: T.textMd }}>{label}</td>
            <td style={{ padding: '7px 0', textAlign: 'right' }}>
              <EpaPill value={epa[key] ?? 0} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function CoeffTable({ coefficients }) {
  if (!coefficients) return <div style={{ color: T.textMin, fontSize: 12 }}>No coefficients</div>
  return (
    <div>
      <p style={{ fontSize: 11, color: T.textLow, marginBottom: 10 }}>
        β_eFG of 1.2 means a 1% increase in eFG% adds 1.2 pts of net efficiency per 100 possessions.
        Fields marked "encoding unclear" have ambiguous direction in Barttorvik data; constrained model zeros these out.
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${T.border}` }}>
            <th style={{ textAlign: 'left', padding: '5px 0', color: T.textLow, fontWeight: 500 }}>Factor</th>
            <th style={{ textAlign: 'right', padding: '5px 6px', color: T.textLow, fontWeight: 500 }}>β</th>
            <th style={{ textAlign: 'left', padding: '5px 8px', color: T.textLow, fontWeight: 500 }}>Note</th>
          </tr>
        </thead>
        <tbody>
          {COEFF_META.map(({ key, label, note }) => {
            const val = coefficients[key]
            return (
              <tr key={key} style={{ borderBottom: `1px solid ${T.border}20` }}>
                <td style={{ padding: '6px 0', color: T.textMd }}>{label}</td>
                <td style={{ padding: '6px 6px', textAlign: 'right', fontFamily: 'monospace', color: T.text }}>
                  {val != null ? val.toFixed(4) : '—'}
                </td>
                <td style={{ padding: '6px 8px', color: T.textMin, fontSize: 11 }}>{note}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ScatterViz({ observations, r2, n, label }) {
  if (!observations?.length) return <div style={{ color: T.textMin, fontSize: 12 }}>No observations</div>
  const vals = observations.flatMap(o => [o.actual, o.predicted])
  const min  = Math.min(...vals) - 2
  const max  = Math.max(...vals) + 2
  return (
    <div>
      <div style={{ fontSize: 11, color: T.textLow, marginBottom: 8 }}>
        {label} · R² = {r2?.toFixed(3) ?? '—'} · {n} obs · dots near diagonal = good fit
      </div>
      <ResponsiveContainer width="100%" height={210}>
        <ScatterChart margin={{ top: 4, right: 12, bottom: 14, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
          <XAxis dataKey="actual"    type="number" domain={[min, max]} tick={{ fontSize: 10, fill: T.textLow }} label={{ value: 'Actual', position: 'insideBottom', offset: -4, fontSize: 10, fill: T.textLow }} />
          <YAxis dataKey="predicted" type="number" domain={[min, max]} tick={{ fontSize: 10, fill: T.textLow }} width={36} />
          <Tooltip content={({ payload }) => {
            if (!payload?.length) return null
            const { label: lbl, actual, predicted } = payload[0].payload
            return (
              <div style={{ background: T.surf, border: `1px solid ${T.border}`, borderRadius: 6, padding: '6px 10px', fontSize: 11 }}>
                <div style={{ color: T.text, fontWeight: 600 }}>{lbl}</div>
                <div style={{ color: T.textMd }}>Actual: {actual?.toFixed(1)}</div>
                <div style={{ color: T.textMd }}>Predicted: {predicted?.toFixed(1)}</div>
              </div>
            )
          }} />
          <ReferenceLine segment={[{ x: min, y: min }, { x: max, y: max }]} stroke={T.accent} strokeDasharray="4 4" strokeOpacity={0.5} />
          <Scatter data={observations} fill={T.accentSoft} fillOpacity={0.75} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}

function TierCard({ badge, tier, result, activeComparison, observations, synthetic }) {
  if (!result) return (
    <div style={{ ...CARD, marginBottom: 20 }}>
      <div style={{ fontSize: 12, color: T.textMin }}>
        {badge}: Game log data not loaded. Run: <code style={{ color: T.amber }}>node scripts/generate-mock-gamelogs.mjs</code>
      </div>
    </div>
  )
  if (result.error || result.status === 'error') return (
    <div style={{ ...CARD, marginBottom: 20, borderColor: T.red }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: T.red }}>{badge}</span>
      <div style={{ fontSize: 12, color: T.red, marginTop: 6 }}>{result.error ?? result.messages?.[0]}</div>
    </div>
  )
  const r = result.result ?? result
  return (
    <div style={{ ...CARD, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ background: T.accent + '22', color: T.accentSoft, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{badge}</span>
        <span style={{ fontSize: 12, color: T.textMd }}>{r.label ?? tier}</span>
        {r.r2 != null && <span style={{ fontSize: 11, color: T.textLow }}>R²={r.r2}</span>}
        {r.cvR2 != null && <span style={{ fontSize: 11, color: T.blue }}>CVR²={r.cvR2}</span>}
        {r.rmse != null && <span style={{ fontSize: 11, color: T.textLow }}>RMSE={r.rmse}</span>}
        {r.alpha != null && <span style={{ fontSize: 11, color: T.blue }}>λ={r.alpha}</span>}
        {synthetic && (
          <span style={{ background: T.amberBg, color: T.amber, borderRadius: 4, padding: '2px 7px', fontSize: 10, fontWeight: 600 }}>SYNTHETIC</span>
        )}
      </div>
      {synthetic && (
        <div style={{ fontSize: 11, color: T.amber, marginBottom: 12 }}>
          Synthetic game data — not validated. Replace gameLogs.json with real Barttorvik per-game box scores.
        </div>
      )}
      {activeComparison === 'events'       && <EventEPATable  epa={r.eventEPA} />}
      {activeComparison === 'coefficients' && <CoeffTable     coefficients={r.coefficients} />}
      {activeComparison === 'scatter'      && <ScatterViz     observations={observations ?? r.observations} r2={r.r2} n={r.n} label={r.label} />}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const TABS = ['events', 'coefficients', 'scatter']

export default function EpaLab() {
  const { ivyOnly, activeComparison, setIvyOnly, setActiveComparison } = useEpaStore()

  const pipeline = useMemo(() => {
    try { return runEPAPipeline(teamSeasons, { targetMode: 'raw' }) }
    catch (e) { return { status: 'error', messages: [e.message], models: null } }
  }, [])

  const tier2 = useMemo(() => {
    if (!gameLogs?.length) return null
    try { return runTier2Pipeline(gameLogs, pipeline.leagueRates ?? {}, { ivyOnly }) }
    catch (e) { return { status: 'error', messages: [e.message] } }
  }, [ivyOnly, pipeline.leagueRates])

  const sel  = pipeline.selectedModel
  const best = pipeline.models?.[sel]

  return (
    <div style={{ background: T.bg, minHeight: '100vh' }}>
      <PageHeader
        title="EPA Lab"
        subtitle="Derives event EPA from OLS/Ridge regression on four-factor data. Model selected by LOO-CV — no assumed weights."
        stats={pipeline.status !== 'error' ? [
          { label: 'Model',     value: sel?.replace('_', ' ') ?? '—', color: T.accentSoft },
          { label: 'Off CVR²',  value: pipeline.models?.ridge_split?.offCvR2 ?? '—', color: T.green },
          { label: 'Def CVR²',  value: pipeline.models?.ridge_split?.defCvR2 ?? '—', color: T.green },
          { label: 'FGA/100',   value: pipeline.leagueRates?.avgFGAp100 ?? '—', color: T.textMd },
        ] : []}
        controls={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.textMd, cursor: 'pointer' }}>
              <input type="checkbox" checked={ivyOnly} onChange={e => setIvyOnly(e.target.checked)} style={{ accentColor: T.accent }} />
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
        {pipeline.status === 'error'
          ? <div style={{ background: T.redBg, color: T.red, borderRadius: 8, padding: '12px 16px', marginBottom: 20 }}>
              {pipeline.messages?.join(' · ')}
            </div>
          : <>
              <DiagnosticsPanel
                diagnostics={pipeline.diagnostics}
                messages={pipeline.messages}
                selectionReason={pipeline.selectionReason}
              />

              <div style={{ ...CARD, marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.accentSoft, marginBottom: 12 }}>MODEL COMPARISON</div>
                <ModelComparisonTable models={pipeline.models} selectedModel={sel} />
              </div>

              <TierCard
                badge="TIER 1"
                tier="Team-season (real data)"
                result={best}
                activeComparison={activeComparison}
                observations={pipeline.observations}
                synthetic={false}
              />
            </>
        }

        <TierCard
          badge="TIER 2"
          tier="Game logs"
          result={tier2}
          activeComparison={activeComparison}
          synthetic={tier2?.synthetic}
        />
      </div>
    </div>
  )
}
