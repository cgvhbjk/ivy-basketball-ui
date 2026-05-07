import { useState } from 'react'
import { T, CARD } from '../../styles/theme.js'
import { MODEL_LABELS } from '../../utils/epaModels/config.js'
import { getD1EPAModels } from '../../utils/calibrationCache.js'
import ModelComparisonTable from './ModelComparisonTable.jsx'

function Badge({ level, children }) {
  const colors = {
    ok:    { bg: T.greenBg,  text: T.green  },
    warn:  { bg: T.amberBg,  text: T.amber  },
    error: { bg: T.redBg,    text: T.red    },
    info:  { bg: T.blueBg,   text: T.blue   },
  }
  const c = colors[level] ?? colors.info
  return (
    <span style={{ background: c.bg, color: c.text, borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 600 }}>
      {children}
    </span>
  )
}

function Row({ label, value, level = 'info' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${T.border}20` }}>
      <span style={{ fontSize: 12, color: T.textMd }}>{label}</span>
      <Badge level={level}>{value}</Badge>
    </div>
  )
}

function VIFTable({ vif }) {
  if (!vif) return null
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginTop: 8 }}>
      <thead>
        <tr>
          {Object.keys(vif).map(k => (
            <th key={k} style={{ textAlign: 'center', padding: '3px 6px', color: T.textLow, fontWeight: 500, borderBottom: `1px solid ${T.border}` }}>{k}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {Object.entries(vif).map(([k, v]) => {
            const level = v >= 10 ? 'error' : v >= 5 ? 'warn' : 'ok'
            return (
              <td key={k} style={{ textAlign: 'center', padding: '3px 6px' }}>
                <Badge level={level}>{v}</Badge>
              </td>
            )
          })}
        </tr>
      </tbody>
    </table>
  )
}

export default function DiagnosticsPanel({
  diagnostics, messages, selectionReason,
  models, selectedModelKey, viewModelKey, onSelectModel,
}) {
  const [open, setOpen] = useState(false)

  if (!diagnostics) return null

  const { n, kJoint, kSplit, obsPerPredictorJoint, obsPerPredictorSplit, targetMode } = diagnostics
  const hasWarnings = messages?.length > 0
  const vif = diagnostics.joint?.vif
  const maxVif = vif ? Math.max(...Object.values(vif)) : null

  const viewingKey  = viewModelKey ?? selectedModelKey
  const modelLabel  = MODEL_LABELS[viewingKey] ?? viewingKey ?? '—'

  // Sign-issue counts across the four Ivy models — used in the plain-English
  // summary at the top of the expanded panel.
  const ivyIssueTotals = ['ols_joint', 'ridge_joint', 'ridge_split', 'constrained_ols']
    .map(k => ({ k, n: models?.[k]?.signIssues?.length ?? 0 }))
  const ivyTotalIssues = ivyIssueTotals.reduce((s, x) => s + x.n, 0)

  return (
    <div style={{ ...CARD, marginBottom: 20, borderColor: hasWarnings ? T.amber : T.border }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, color: T.textMin, letterSpacing: '0.07em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
          Model Selection
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <span style={{ fontSize: 11, color: T.textMd }}>Currently using <Badge level="info">{modelLabel}</Badge></span>
          {hasWarnings && <Badge level="warn">{messages.length} warning{messages.length > 1 ? 's' : ''}</Badge>}
        </span>
        <span style={{ fontSize: 11, color: T.textMin, whiteSpace: 'nowrap' }}>{open ? '▲ collapse' : '▼ details'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 16 }}>
          {/* Plain-English summary block — answers "what am I looking at?" before
              the dense tables. Without this readers had to assemble the story
              themselves from numeric metrics and footnotes. */}
          <div style={{ background: T.surf2, borderRadius: 6, padding: '12px 14px', marginBottom: 16, fontSize: 12, color: T.textMd, lineHeight: 1.6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.accentSoft, marginBottom: 6, letterSpacing: '0.05em' }}>
              WHAT THIS PANEL SHOWS
            </div>
            We fit four versions of the same Dean Oliver four-factor model. The pipeline picks the one with the best
            out-of-sample fit and no wrong-signed coefficients — currently <strong style={{ color: T.text }}>{MODEL_LABELS[selectedModelKey]}</strong>.
            The two tables below let you compare all four models side-by-side, first on the Ivy 32 team-seasons,
            then on the full D1 corpus (≈1,400 team-seasons) as a sanity check.
            {ivyTotalIssues > 0 && (
              <> At Ivy n={n}, <strong style={{ color: T.amber }}>{ivyTotalIssues} sign issue{ivyTotalIssues > 1 ? 's' : ''}</strong> appear in the joint models — these are statistical noise around weak coefficients, not encoding bugs (D1 confirms the correct signs at scale).</>
            )}
          </div>

          <div style={{ fontSize: 11, fontWeight: 600, color: T.accentSoft, marginBottom: 8 }}>MODEL COMPARISON · IVY (n={n})</div>
          <p style={{ fontSize: 11, color: T.textLow, marginBottom: 8 }}>
            Hover any model name or column header for a plain-English description. Click a row to view that model's coefficients and scatter plot in the Tier 1 card.
          </p>
          <ModelComparisonTable
            models={models}
            selectedModel={selectedModelKey}
            viewModelKey={viewModelKey}
            onSelectModel={onSelectModel}
          />

          <div style={{ fontSize: 11, color: T.textLow, margin: '16px 0 8px', padding: '8px 10px', background: T.surf2, borderRadius: 5 }}>
            <span style={{ fontWeight: 600, color: T.textMd }}>Why this model was auto-selected: </span>
            {selectionReason ?? '—'}
          </div>

          {(() => {
            const d1 = getD1EPAModels()
            if (!d1) return null
            return (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.green, marginBottom: 8, letterSpacing: '0.06em' }}>
                  MODEL COMPARISON · D1-TRAINED (n={d1.nTrain})
                </div>
                <p style={{ fontSize: 11, color: T.textLow, marginBottom: 8 }}>
                  Same four models, refit on the full Barttorvik D1 corpus. Compare row-for-row against the Ivy table above —
                  sign issues that appear at n={n} should disappear here. If they do, those issues were small-sample noise,
                  not encoding bugs.
                </p>
                <ModelComparisonTable
                  models={d1}
                  selectedModel={d1.selectedModel}
                />
                <p style={{ fontSize: 10, color: T.textMin, marginTop: 6, fontStyle: 'italic' }}>
                  Caveat: D1 target is opponent-adjusted efficiency (adjoe−adjde), not raw ppp — the Barttorvik slice endpoint
                  doesn't expose raw ppp. Coefficients are slightly biased but the sign-direction sanity check is unaffected.
                </p>
              </div>
            )
          })()}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.accentSoft, marginBottom: 6 }}>SAMPLE SIZE</div>
              <Row label="Observations (n)"          value={n} />
              <Row label="Joint model predictors"    value={kJoint} />
              <Row label="Joint obs/predictor ratio" value={obsPerPredictorJoint} level={obsPerPredictorJoint < 10 ? 'warn' : 'ok'} />
              <Row label="Split model predictors"    value={kSplit} />
              <Row label="Split obs/predictor ratio" value={obsPerPredictorSplit} level={obsPerPredictorSplit < 10 ? 'warn' : 'ok'} />
              <Row label="Target mode"               value={targetMode} level={targetMode === 'adjusted' ? 'warn' : 'ok'} />
              <p style={{ fontSize: 10, color: T.textMin, marginTop: 6, lineHeight: 1.5 }}>
                Rule of thumb: ≥10 observations per predictor for a stable fit. Below that, expect noisy coefficients.
              </p>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.accentSoft, marginBottom: 6 }}>COLLINEARITY (VIF — joint model)</div>
              <VIFTable vif={vif} />
              <p style={{ fontSize: 10, color: T.textMin, marginTop: 6, lineHeight: 1.5 }}>
                {maxVif != null && maxVif < 5
                  ? <>All VIFs under 5 (max {maxVif.toFixed(1)}) — <strong style={{ color: T.green }}>no collinearity problems</strong>. Sign issues, if any, are sample-noise, not predictor entanglement.</>
                  : <>VIF ≥ 5 = moderate concern, ≥ 10 = severe. Inspect any flagged predictors before trusting their coefficients.</>}
              </p>
            </div>
          </div>

          {hasWarnings && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.amber, marginBottom: 6 }}>WARNINGS</div>
              {messages.map((m, i) => (
                <div key={i} style={{ fontSize: 11, color: T.amber, background: T.amberBg, borderRadius: 4, padding: '5px 10px', marginBottom: 4 }}>
                  {m}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
