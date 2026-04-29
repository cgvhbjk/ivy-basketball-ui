import { useState } from 'react'
import { T, CARD } from '../../styles/theme.js'

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

export default function DiagnosticsPanel({ diagnostics, messages, selectionReason }) {
  const [open, setOpen] = useState(false)

  if (!diagnostics) return null

  const { n, kJoint, kSplit, obsPerPredictorJoint, obsPerPredictorSplit, targetMode } = diagnostics
  const hasWarnings = messages?.length > 0
  const vif = diagnostics.joint?.vif

  return (
    <div style={{ ...CARD, marginBottom: 20, borderColor: hasWarnings ? T.amber : T.border }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}
      >
        <Badge level={hasWarnings ? 'warn' : 'ok'}>
          {hasWarnings ? `${messages.length} diagnostic warning${messages.length > 1 ? 's' : ''}` : 'Diagnostics OK'}
        </Badge>
        <span style={{ fontSize: 12, color: T.textMd, flex: 1, textAlign: 'left' }}>{selectionReason}</span>
        <span style={{ fontSize: 11, color: T.textMin }}>{open ? '▲ collapse' : '▼ expand'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 16 }}>
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

          {messages?.length > 0 && (
            <div>
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
