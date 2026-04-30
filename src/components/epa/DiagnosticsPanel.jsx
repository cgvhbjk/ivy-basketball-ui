import { useState } from 'react'
import { T, CARD } from '../../styles/theme.js'
import { MODEL_LABELS } from '../../utils/epaModels/config.js'
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

  const viewingKey  = viewModelKey ?? selectedModelKey
  const modelLabel  = MODEL_LABELS[viewingKey] ?? viewingKey ?? '—'
  const isAutoView  = !viewModelKey || viewModelKey === selectedModelKey
  const rs          = models?.ridge_split
  const cvSummary   = rs ? `Off CVR²=${rs.offCvR2} · Def CVR²=${rs.defCvR2}` : null

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
          <Badge level="info">{modelLabel}</Badge>
          {isAutoView && <span style={{ fontSize: 10, color: T.textMin }}>auto-selected</span>}
          {cvSummary && <span style={{ fontSize: 11, color: T.blue }}>{cvSummary}</span>}
          {hasWarnings && <Badge level="warn">{messages.length} warning{messages.length > 1 ? 's' : ''}</Badge>}
        </span>
        <span style={{ fontSize: 11, color: T.textMin, whiteSpace: 'nowrap' }}>{open ? '▲ collapse' : '▼ details'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.accentSoft, marginBottom: 8 }}>MODEL COMPARISON</div>
          <p style={{ fontSize: 11, color: T.textLow, marginBottom: 8 }}>
            Four models are fit to the same data. The pipeline auto-selects the best one based on CV R² and sign validity.
            Click a row to view that model's coefficients and scatter plot in the card below.
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.accentSoft, marginBottom: 6 }}>SAMPLE SIZE</div>
              <Row label="Observations (n)"          value={n} />
              <Row label="Joint model predictors"    value={kJoint} />
              <Row label="Joint obs/predictor ratio" value={obsPerPredictorJoint} level={obsPerPredictorJoint < 10 ? 'warn' : 'ok'} />
              <Row label="Split model predictors"    value={kSplit} />
              <Row label="Split obs/predictor ratio" value={obsPerPredictorSplit} level={obsPerPredictorSplit < 10 ? 'warn' : 'ok'} />
              <Row label="Target mode"               value={targetMode} level={targetMode === 'adjusted' ? 'warn' : 'ok'} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.accentSoft, marginBottom: 6 }}>COLLINEARITY (VIF — joint model)</div>
              <VIFTable vif={vif} />
              <p style={{ fontSize: 10, color: T.textMin, marginTop: 6 }}>
                VIF ≥ 5 = moderate, ≥ 10 = severe. All VIFs near 1 here — sign issues stem from Barttorvik field encoding, not collinearity.
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
