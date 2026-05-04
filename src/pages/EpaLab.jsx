import { useMemo, useEffect, useState } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import teamSeasons  from '../data/teamSeasons.json'
import gameLogs     from '../data/gameLogs.json'
import baselineEP   from '../data/baseline_epa.json'
import { runEPAPipeline } from '../utils/epaModels/pipeline.js'
import { runTier2Pipeline } from '../utils/epaModels/tier2.js'
import { getD1EPAModels } from '../utils/calibrationCache.js'
import useEpaStore from '../store/useEpaStore.js'
import PageHeader from '../components/shared/PageHeader.jsx'
import DiagnosticsPanel from '../components/epa/DiagnosticsPanel.jsx'
import PageConclusions from '../components/shared/PageConclusions.jsx'
import MethodologyPanel from '../components/shared/MethodologyPanel.jsx'
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

const EVENT_ROWS_FULL = [
  { key: 'made2FG',            label: 'Made 2-pt FG'           },
  { key: 'made3FG',            label: 'Made 3-pt FG'           },
  { key: 'offTurnover',        label: 'Offensive Turnover'     },
  { key: 'offRebound',         label: 'Offensive Rebound'      },
  { key: 'foulDrawn',          label: 'Foul Drawn (FT)'        },
  { key: 'defForcedTurnover',  label: 'Forced Turnover (def)'  },
  { key: 'defShotSuppression', label: 'Shot Suppression (def)' },
]

const EVENT_ROWS_T1 = EVENT_ROWS_FULL.filter(r => r.key !== 'offTurnover' && r.key !== 'offRebound')

// Sign-direction column reliability after the Phase-0 encoding audit.
// `uncertain` here flags MAGNITUDE noise at n=32, not sign ambiguity — the
// audit pinned every sign empirically (see EPA_MODELS.md). def_TOV is the
// only column with a near-zero partial coefficient and is still flagged.
const COEFF_META = [
  { key: 'off_eFG', label: 'Off eFG%',  note: 'shooting quality',                                    uncertain: false },
  { key: 'off_TOV', label: 'Off TOV',   note: 'tov_o — magnitude unstable at n=32; sign empirically + (verified)',  uncertain: true  },
  { key: 'off_ORB', label: 'Off ORB',   note: 'orb — magnitude unstable at n=32; sign empirically − (verified)',    uncertain: true  },
  { key: 'off_FTR', label: 'Off FTR',   note: 'free throw rate',                                     uncertain: false },
  { key: 'def_eFG', label: 'Def eFG%',  note: 'opponent shooting quality',                           uncertain: false },
  { key: 'def_TOV', label: 'Def TOV',   note: 'tov_d — partial β ≈ 0 at n=32; weakest of the four',  uncertain: true  },
  { key: 'def_ORB', label: 'Def ORB',   note: 'drb — own DRB%; sign verified, magnitude noisy',      uncertain: true  },
  { key: 'def_FTR', label: 'Def FTR',   note: 'opponent free throw rate',                            uncertain: false },
]

function EventEPATable({ epa, full = false }) {
  if (!epa) return <div style={{ color: T.textMin, fontSize: 12 }}>No EPA values</div>
  const rows = full ? EVENT_ROWS_FULL : EVENT_ROWS_T1
  return (
    <div>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: `1px solid ${T.border}` }}>
          <th style={{ textAlign: 'left', padding: '5px 0', color: T.textLow, fontWeight: 500 }}>Event</th>
          <th style={{ textAlign: 'right', padding: '5px 0', color: T.textLow, fontWeight: 500 }}>EPA</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ key, label }) => (
          <tr key={key} style={{ borderBottom: `1px solid ${T.border}20` }}>
            <td style={{ padding: '7px 0', color: T.textMd }}>{label}</td>
            <td style={{ padding: '7px 0', textAlign: 'right' }}>
              <EpaPill value={epa[key] ?? 0} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    <div style={{ fontSize: 10, color: T.textMin, marginTop: 8 }}>
      EPA from sign-constrained model (NNLS). TOV and ORB effects omitted — unreliable at n=32 due to collinearity with eFG%. Tier 2 would refine these once real per-game box scores replace the synthetic placeholder data.
    </div>
    </div>
  )
}

function CoeffTable({ coefficients }) {
  if (!coefficients) return <div style={{ color: T.textMin, fontSize: 12 }}>No coefficients</div>
  return (
    <div>
      <p style={{ fontSize: 11, color: T.textLow, marginBottom: 10 }}>
        β_eFG of 1.2 means a 1% increase in eFG% adds 1.2 pts of net efficiency per 100 possessions.
        Signs for all eight factors are empirically verified (see <code>encodingAudit.js</code> + EPA_MODELS.md).
        Rows shaded amber have <strong style={{ color: T.amber }}>unstable magnitudes at n=32</strong> due to multicollinearity with eFG% — not unreliable signs.
        A real per-game box-score dataset would tighten these; today's Tier 2 panel uses synthetic data and is hidden by default.
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${T.border}` }}>
            <th style={{ textAlign: 'left',  padding: '5px 0', color: T.textLow, fontWeight: 500 }}>Factor</th>
            <th style={{ textAlign: 'right', padding: '5px 6px', color: T.textLow, fontWeight: 500 }}>β</th>
            <th style={{ textAlign: 'left',  padding: '5px 8px', color: T.textLow, fontWeight: 500 }}>Note</th>
          </tr>
        </thead>
        <tbody>
          {COEFF_META.map(({ key, label, note, uncertain }) => {
            const val = coefficients[key]
            // Visual treatment for unreliable coefficients: amber row tint,
            // dotted underline on the value, italic note. Same visual weight
            // is no longer used for reliable and unreliable estimates.
            const rowBg = uncertain ? `${T.amber}14` : 'transparent'
            return (
              <tr key={key} style={{
                borderBottom: `1px solid ${T.border}20`,
                background: rowBg,
              }}>
                <td style={{ padding: '6px 0', color: uncertain ? T.amber : T.textMd, fontWeight: uncertain ? 600 : 400 }}>
                  {uncertain && <span title="Sign unreliable on n=32 — see note" style={{ fontSize: 10, marginRight: 5, padding: '1px 5px', background: T.amber, color: '#1a1a1a', borderRadius: 3, fontWeight: 700 }}>?</span>}
                  {label}
                </td>
                <td style={{
                  padding: '6px 6px', textAlign: 'right', fontFamily: 'monospace',
                  color: uncertain ? T.amber : T.text,
                  textDecoration: uncertain ? 'underline dotted' : 'none',
                  textDecorationColor: uncertain ? T.amber : undefined,
                  opacity: uncertain ? 0.85 : 1,
                  fontStyle: uncertain ? 'italic' : 'normal',
                }}>
                  {val != null ? val.toFixed(4) : '—'}
                </td>
                <td style={{
                  padding: '6px 8px', color: uncertain ? T.amber : T.textMin, fontSize: 11,
                  fontStyle: uncertain ? 'italic' : 'normal',
                  opacity: uncertain ? 0.9 : 1,
                }}>
                  {note}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div style={{ fontSize: 10, color: T.textMin, marginTop: 8, fontStyle: 'italic' }}>
        Reliable rows (eFG, FTR) are shown solid; unreliable rows (TOV, ORB) are amber-tinted with dotted underlines so they're not visually equivalent to the trustworthy estimates.
      </div>
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

function StatRow({ label, base, delta, combined, note, children }) {
  return (
    <div style={{ borderBottom: `1px solid ${T.border}20`, paddingBottom: 12, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{label}</span>
        {combined != null && (
          <EpaPill value={combined} />
        )}
      </div>
      <div style={{ display: 'flex', gap: 16, fontSize: 11, color: T.textLow, flexWrap: 'wrap' }}>
        {base != null    && <span>Base <span style={{ color: T.textMd, fontFamily: 'monospace' }}>{base > 0 ? '+' : ''}{base.toFixed(3)}</span></span>}
        {delta != null   && <span>Δ <span style={{ color: delta === 0 ? T.textMin : T.accentSoft, fontFamily: 'monospace' }}>{delta > 0 ? '+' : ''}{delta.toFixed(3)}</span></span>}
        {note && <span style={{ color: T.textMin, fontStyle: 'italic' }}>{note}</span>}
      </div>
      {children}
    </div>
  )
}

function StateBreakdown({ pct1, label1, ep1, pct2, label2, ep2 }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginTop: 5 }}>
      {[{ pct: pct1, label: label1, ep: ep1 }, { pct: pct2, label: label2, ep: ep2 }].map(({ pct, label, ep }) => (
        <div key={label} style={{
          flex: 1, background: T.surf2, borderRadius: 5, padding: '5px 8px', fontSize: 11,
        }}>
          <div style={{ color: T.textLow, marginBottom: 2 }}>{label}</div>
          <div style={{ color: T.text, fontFamily: 'monospace', fontWeight: 600 }}>EP {ep?.toFixed(2)}</div>
          <div style={{ color: T.textMin }}>{(pct * 100).toFixed(0)}% of cases</div>
        </div>
      ))}
    </div>
  )
}

function StateEPAPanel({ states, deltaNote }) {
  if (!states) {
    return (
      <div style={{ fontSize: 12, color: T.textMin, padding: '10px 0' }}>
        State context not available — baseline_epa.json not loaded or states not computed.
      </div>
    )
  }
  const { offTurnover, offRebound, foulDrawn, defForcedTurnover } = states
  return (
    <div>
      {deltaNote && (
        <div style={{ fontSize: 11, color: T.amber, background: T.amberBg, borderRadius: 5, padding: '6px 10px', marginBottom: 14 }}>
          {deltaNote}
        </div>
      )}

      <StatRow
        label="Offensive Turnover"
        base={offTurnover?.weightedOpponentEP}
        delta={offTurnover?.regressionDelta}
        combined={offTurnover?.combined != null ? -offTurnover.combined : null}
        note={offTurnover?.note}
      >
        {offTurnover && (
          <StateBreakdown
            pct1={offTurnover.liveSteal.pct}    label1={offTurnover.liveSteal.label}  ep1={offTurnover.liveSteal.ep}
            pct2={offTurnover.deadBall.pct}     label2={offTurnover.deadBall.label}   ep2={offTurnover.deadBall.ep}
          />
        )}
        {offTurnover?.ivyPremium != null && (
          <div style={{ fontSize: 11, color: T.textLow, marginTop: 5 }}>
            Ivy live-steal premium: <span style={{ color: T.red, fontFamily: 'monospace' }}>+{offTurnover.ivyPremium.toFixed(3)}</span> vs dead ball
          </div>
        )}
      </StatRow>

      <StatRow
        label="Offensive Rebound"
        base={offRebound?.weightedYourEP}
        delta={offRebound?.regressionDelta}
        combined={offRebound?.combined}
        note={offRebound?.note}
      >
        {offRebound && (
          <StateBreakdown
            pct1={offRebound.putback.pct}  label1={offRebound.putback.label}  ep1={offRebound.putback.ep}
            pct2={offRebound.reset.pct}    label2={offRebound.reset.label}    ep2={offRebound.reset.ep}
          />
        )}
      </StatRow>

      <StatRow
        label="Foul Drawn (FT)"
        base={foulDrawn?.weightedYourEP}
        note={foulDrawn?.note}
      >
        {foulDrawn && (
          <StateBreakdown
            pct1={foulDrawn.twoShots.pct}    label1={foulDrawn.twoShots.label}    ep1={foulDrawn.twoShots.ep}
            pct2={foulDrawn.oneAndOne.pct}   label2={foulDrawn.oneAndOne.label}   ep2={foulDrawn.oneAndOne.ep}
          />
        )}
      </StatRow>

      <StatRow
        label="Forced Turnover (def)"
        base={defForcedTurnover?.weightedYourEP}
        delta={defForcedTurnover?.regressionDelta}
        combined={defForcedTurnover?.combined}
        note={defForcedTurnover?.note}
      >
        {defForcedTurnover && (
          <StateBreakdown
            pct1={defForcedTurnover.liveSteal.pct}  label1="Live steal transition"  ep1={defForcedTurnover.liveSteal.ep}
            pct2={defForcedTurnover.deadBall.pct}   label2="Dead ball inbound"       ep2={defForcedTurnover.deadBall.ep}
          />
        )}
      </StatRow>

      <div style={{ fontSize: 11, color: T.textMin, marginTop: 4 }}>
        Combined = Base (state EP from baseline_epa.json) + Δ (regression coefficient normalized to per-possession scale).
        Positive = gain to your team. Negative = cost to your team.
      </div>
    </div>
  )
}

// LocalStorage gate so developers can opt into seeing synthetic numbers
// without exposing them to ordinary users. Default: hidden.
function useSyntheticOverride() {
  const [show, setShow] = useState(() => {
    try { return localStorage.getItem('epaLab.showSynthetic') === '1' }
    catch { return false }
  })
  const toggle = () => setShow(s => {
    const next = !s
    try { localStorage.setItem('epaLab.showSynthetic', next ? '1' : '0') } catch {}
    return next
  })
  return [show, toggle]
}

function TierCard({ badge, description, tier, result, activeComparison, observations, synthetic, epaOverride, statesOverride, fullEvents = false }) {
  const [showSynthetic, toggleSynthetic] = useSyntheticOverride()

  if (!result) return (
    <div style={{ ...CARD, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ background: T.accent + '22', color: T.accentSoft, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{badge}</span>
        <span style={{ fontSize: 12, color: T.textMin }}>No game log data loaded.</span>
      </div>
      <div style={{ fontSize: 11, color: T.textMin }}>
        Fetch real ESPN box scores: <code style={{ color: T.accentSoft }}>node scripts/fetch-gamelogs.mjs</code>
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

  // Suppress numerical content for synthetic tiers unless the developer
  // toggle is active. Keeps the panel structure visible (so users see what
  // would appear with real data) without leaking misleading numbers.
  const hideNumbers = synthetic && !showSynthetic

  return (
    <div style={{ ...CARD, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
        <span style={{ background: T.accent + '22', color: T.accentSoft, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{badge}</span>
        <span style={{ fontSize: 12, color: T.text, fontWeight: 600 }}>{r.label ?? tier}</span>
        {!hideNumbers && r.r2 != null && <span style={{ fontSize: 11, color: T.textLow }}>R²={r.r2}</span>}
        {!hideNumbers && r.cvR2 != null && <span style={{ fontSize: 11, color: T.blue }}>CVR²={r.cvR2}</span>}
        {!hideNumbers && r.rmse != null && <span style={{ fontSize: 11, color: T.textLow }}>RMSE={r.rmse}</span>}
        {!hideNumbers && r.alpha != null && <span style={{ fontSize: 11, color: T.blue }}>λ={r.alpha}</span>}
        {synthetic && (
          <span style={{ background: T.amberBg, color: T.amber, borderRadius: 4, padding: '2px 7px', fontSize: 10, fontWeight: 600 }}>SYNTHETIC</span>
        )}
      </div>
      {description && (
        <div style={{ fontSize: 11, color: T.textLow, marginBottom: 12 }}>{description}</div>
      )}
      {synthetic && (
        <div style={{ fontSize: 11, color: T.amber, marginBottom: 12, lineHeight: 1.5 }}>
          Synthetic game data — coefficients, EPA, and scatter would not reflect real Ivy play.
          {' '}Numbers are hidden by default. Replace gameLogs.json with real ESPN box scores
          (<code>node scripts/fetch-gamelogs.mjs</code>) to populate this card.
          <button onClick={toggleSynthetic}
            style={{ marginLeft: 10, fontSize: 10, color: T.textLow, background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>
            {showSynthetic ? 'Hide synthetic numbers' : 'Show synthetic numbers (developer)'}
          </button>
        </div>
      )}
      {hideNumbers ? (
        <div style={{ fontSize: 12, color: T.textMin, padding: '24px 0', textAlign: 'center', border: `1px dashed ${T.border}`, borderRadius: 8 }}>
          Numbers hidden — Tier 2 panel awaiting real data.
        </div>
      ) : (
        <>
          {activeComparison === 'events'       && <EventEPATable  epa={epaOverride ?? r.eventEPA} full={fullEvents} />}
          {activeComparison === 'coefficients' && <CoeffTable     coefficients={r.coefficients} />}
          {activeComparison === 'scatter'      && <ScatterViz     observations={r.observations ?? observations} r2={r.r2} n={r.n} label={r.label} />}
          {activeComparison === 'state'        && <StateEPAPanel  states={statesOverride ?? r.states} deltaNote={(statesOverride ?? r.states)?._deltaNote} />}
        </>
      )}
    </div>
  )
}

// ── D1 comparison panel ──────────────────────────────────────────────────────
// Shows the four-factor coefficients fitted on the full Barttorvik D1 corpus
// (~1400 obs) alongside a note that the n=32 collinearity which forces the
// Ivy-only constrained model to zero TOV/ORB is dissolved at this scale.

function D1ComparisonPanel() {
  const d1 = getD1EPAModels()
  if (!d1?.ridge_split) return null
  const c = d1.ridge_split
  const rows = [
    ['off_eFG', c.off_eFG], ['off_TOV', c.off_TOV], ['off_ORB', c.off_ORB], ['off_FTR', c.off_FTR],
    ['def_eFG', c.def_eFG], ['def_TOV', c.def_TOV], ['def_ORB', c.def_ORB], ['def_FTR', c.def_FTR],
  ]
  return (
    <div style={{ ...CARD, marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.green, letterSpacing: '0.06em' }}>D1-TRAINED</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: T.textHi }}>Four-factor coefficients fit on full D1 corpus</span>
      </div>
      <div style={{ fontSize: 12, color: T.textMd, lineHeight: 1.6, marginBottom: 14, maxWidth: 720 }}>
        Coefficients fitted on <strong>{d1.nTrain}</strong> D1 team-seasons (Barttorvik, 2022-25), applied to the Ivy 32 above.
        At this scale TOV% and ORB% have stable, non-zero estimates — the n=32 collinearity that forces the constrained
        Ivy-only model to zero them out dissolves here. The selected D1 model is{' '}
        <code style={{ fontSize: 11, color: T.accentSoft }}>{d1.selectedModel.replace(/_/g, ' ')}</code>.
        Note: target is opponent-adjusted (adjoe-adjde) since the Barttorvik slice endpoint doesn't expose raw ppp;
        coefficients are slightly biased but residual interpretation is fine.
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left',  padding: '6px 8px', color: T.textLow, fontSize: 10, textTransform: 'uppercase', borderBottom: `1px solid ${T.border}` }}>Factor</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: T.textLow, fontSize: 10, textTransform: 'uppercase', borderBottom: `1px solid ${T.border}` }}>Coefficient</th>
            <th style={{ textAlign: 'left',  padding: '6px 8px', color: T.textLow, fontSize: 10, textTransform: 'uppercase', borderBottom: `1px solid ${T.border}` }}>Direction</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, val]) => (
            <tr key={name}>
              <td style={{ padding: '6px 8px', color: T.textMd }}>{name}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right', color: T.textHi, fontWeight: 600 }}>{val >= 0 ? '+' : ''}{val.toFixed(3)}</td>
              <td style={{ padding: '6px 8px', color: T.textLow, fontSize: 11 }}>
                {Math.abs(val) < 0.05 ? 'near-zero' : val > 0 ? 'increases target' : 'decreases target'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const TABS = ['events', 'coefficients', 'scatter', 'state']

export default function EpaLab() {
  const { ivyOnly, activeComparison, setIvyOnly, setActiveComparison,
          tier1Result, tier2Result, setTier1Result, setTier2Result } = useEpaStore()

  // User-chosen model to view (null = auto-selected by pipeline)
  const [viewModelKey, setViewModelKey] = useState(null)

  // Compute Tier 1 once and cache in store — survives navigation
  const pipeline = useMemo(() => {
    if (tier1Result.raw) return tier1Result.raw
    try {
      const result = runEPAPipeline(teamSeasons, { targetMode: 'raw', baselineEP })
      setTier1Result(result, 'raw')
      return result
    } catch (e) { return { status: 'error', messages: [e.message], models: null } }
  }, [tier1Result.raw])

  // Compute Tier 2 when ivyOnly changes; cache result keyed by ivyOnly flag
  const tier2CacheKey = `ivyOnly=${ivyOnly}`
  const tier2 = useMemo(() => {
    if (tier2Result?.cacheKey === tier2CacheKey) return tier2Result.data
    if (!gameLogs?.length) return null
    try {
      const data = runTier2Pipeline(gameLogs, pipeline.leagueRates ?? {}, { ivyOnly, baselineEP })
      setTier2Result({ cacheKey: tier2CacheKey, data })
      return data
    } catch (e) { return { status: 'error', messages: [e.message] } }
  }, [ivyOnly, pipeline.leagueRates, tier2Result])

  const sel              = pipeline.selectedModel
  const effectiveKey     = viewModelKey ?? sel
  const effectiveModel   = pipeline.models?.[effectiveKey]

  // Tier 2 description
  const t2Result   = tier2?.result ?? tier2
  const t2n        = t2Result?.n
  const t2IvyLabel = ivyOnly ? ' · Ivy-vs-Ivy only' : ' · all opponents'
  const tier2Desc  = `Per-game box scores${t2IvyLabel} · n=${t2n ?? '—'} · ESPN · 2022–25. Ridge regression on Dean Oliver four factors.`

  return (
    <div style={{ background: T.bg, minHeight: '100vh' }}>
      <PageHeader
        title="EPA Lab"
        subtitle="Derives event EPA from regression on Dean Oliver four factors (eFG%, TOV%, ORB%, FTR). Two data tiers: season aggregates and per-game box scores."
        stats={pipeline.status !== 'error' ? [
          { label: 'Model',     value: sel?.replace(/_/g, ' ') ?? '—', color: T.accentSoft },
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
                models={pipeline.models}
                selectedModelKey={sel}
                viewModelKey={viewModelKey}
                onSelectModel={setViewModelKey}
              />

              <TierCard
                badge="TIER 1"
                description={`Season aggregates · n=${pipeline.n ?? '—'} · Barttorvik · 2022–25. Coefficients and scatter show the ${effectiveKey?.replace(/_/g, ' ') ?? '—'} model. Event EPA always from sign-constrained model.`}
                tier="Team-season"
                result={effectiveModel}
                activeComparison={activeComparison}
                observations={pipeline.observations}
                synthetic={false}
                epaOverride={pipeline.selectedEventEPA}
                statesOverride={pipeline.selectedStates}
              />

              <D1ComparisonPanel />
            </>
        }

        <TierCard
          badge="TIER 2"
          description={tier2Desc}
          tier="Game logs"
          result={tier2}
          activeComparison={activeComparison}
          synthetic={tier2?.synthetic}
          fullEvents
        />

        <PageConclusions prominent conclusions={[
          { label: 'What EPA measures', color: T.accentSoft, text: 'EPA (Expected Points Added) converts regression coefficients from the Dean Oliver four-factor model into intuitive per-event values. A made 2-pt FG adds ~2.36 pts of net efficiency per 100 possessions. These are not assumed weights — they are estimated from Ivy League game data.' },
          { label: 'Why TOV/ORB are omitted in Ivy-only Tier 1', color: T.amber, text: 'With only n=32 Ivy team-seasons, TOV% and ORB% are sufficiently correlated with eFG% that all models — including unconstrained ridge — produce wrong-signed coefficients for those two factors. The constrained model correctly zeroes them. The D1-trained panel above fits on n≈1400 and recovers stable, non-zero TOV/ORB estimates, demonstrating the constraint is a small-sample artifact rather than a structural fact.' },
          { label: 'Model selection logic', color: T.blue, text: 'Four models are fit: OLS, Ridge joint, Ridge split (offense/defense separate), and Constrained OLS (NNLS with theory-correct sign constraints). The pipeline auto-selects by LOO-CV R² and sign validity. EPA event values always come from the constrained model to ensure correct sign direction.' },
          { label: 'Tier 1 vs Tier 2 (when populated)', color: T.green, text: 'Tier 1 uses season-aggregate four-factor data (Barttorvik, 2022–25). Tier 2 is intended for per-game box scores from the ESPN API for the same 8 schools and seasons. Real Tier 2 data would have ~28× more observations, better isolate game-level variance, and stabilise TOV/ORB estimates. Today\'s Tier 2 panel is fed by synthetic data and its numbers are suppressed by default.' },
        ]} />

        <MethodologyPanel
          howItWorks="The EPA pipeline fits ridge regression (with cross-validated regularization) to predict net efficiency from the four Dean Oliver factors. Coefficients are then scaled to per-event units using a league-average FGA/100 denominator derived from the scoring identity: PPP = FGA_p100 × (2·eFG + FT%·FTR)."
          sections={[
            { title: 'Four Factors',  keys: ['efg_o', 'efg_d', 'tov_o', 'tov_d', 'orb', 'drb', 'ftr_o', 'ftr_d'] },
            { title: 'Efficiency',    keys: ['adjoe', 'adjde', 'net_efficiency', 'barthag'] },
            { title: 'EPA Events',    keys: ['epa_made2fg', 'epa_made3fg', 'epa_foul_drawn', 'epa_forced_tov', 'epa_shot_supp'] },
            { title: 'Model Quality', keys: ['ridge_cv_r2'] },
          ]}
        />
      </div>
    </div>
  )
}
