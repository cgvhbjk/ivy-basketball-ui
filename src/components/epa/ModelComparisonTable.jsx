import { T } from '../../styles/theme.js'
import { MODEL_LABELS, MODEL_DESCRIPTIONS } from '../../utils/epaModels/config.js'

function Cell({ children, highlight }) {
  return (
    <td style={{
      padding: '7px 10px', fontSize: 12, textAlign: 'center', color: T.textMd,
      background: highlight ? `${T.accent}18` : 'transparent',
    }}>
      {children}
    </td>
  )
}

function SignBadge({ count }) {
  if (count === 0) return <span title="No sign violations — every coefficient points in the direction the empirical Phase-0 audit verified" style={{ color: T.green, fontWeight: 600 }}>✓ 0</span>
  return <span title={`${count} coefficient${count > 1 ? 's' : ''} pointing opposite to the empirical sign — at small n these are usually near-zero coefficients flipped by sample noise`} style={{ color: T.amber, fontWeight: 600 }}>⚠ {count}</span>
}

function AlphaBadge({ alpha }) {
  if (alpha == null) return <span style={{ color: T.textMin }}>—</span>
  return <span title="Ridge regularization strength. Larger λ pulls coefficients toward zero." style={{ color: T.blue }}>λ={alpha}</span>
}

// One-line hover explanation per column header — addresses the "I don't know
// what this metric means" friction without taking layout space.
const COL_TOOLTIPS = {
  cv:    'Out-of-sample fit quality (leave-one-out cross-validation). Higher is better. This is the right metric to compare models — in-sample R² is biased upward.',
  r2:    'Fit quality on the training data itself. Always higher than CV R². Don\'t use this to choose between models.',
  rmse:  'Root-mean-square prediction error, in points per 100 possessions. Lower is better.',
  signs: 'Number of coefficients with the opposite sign from the empirical Phase-0 audit. ✓ 0 = all signs match expectations; ⚠ N = N small-sample noise flips.',
  reg:   'How much shrinkage is applied (λ for ridge, none for OLS, sign clamps for constrained).',
}

export default function ModelComparisonTable({ models, selectedModel, viewModelKey, onSelectModel }) {
  if (!models) return null

  const rows = [
    { key: 'ols_joint',       cvR2: null,                         alpha: null },
    { key: 'ridge_joint',     cvR2: models.ridge_joint?.cvR2,     alpha: models.ridge_joint?.bestAlpha },
    { key: 'ridge_split',     cvR2: models.ridge_split?.cvR2,     alpha: null,
      alphaParts: models.ridge_split
        ? `Off:λ=${models.ridge_split.offModel?.bestAlpha} Def:λ=${models.ridge_split.defModel?.bestAlpha}`
        : null },
    { key: 'constrained_ols', cvR2: null,                         alpha: null },
  ]

  const viewing = viewModelKey ?? selectedModel

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${T.border}` }}>
            <th style={{ textAlign: 'left', padding: '6px 10px', color: T.textLow, fontWeight: 500 }}>Model</th>
            <th title={COL_TOOLTIPS.cv}    style={{ textAlign: 'center', padding: '6px 10px', color: T.textLow, fontWeight: 500, cursor: 'help' }}>LOO-CV R² ⓘ</th>
            <th title={COL_TOOLTIPS.r2}    style={{ textAlign: 'center', padding: '6px 10px', color: T.textLow, fontWeight: 500, cursor: 'help' }}>In-sample R² ⓘ</th>
            <th title={COL_TOOLTIPS.rmse}  style={{ textAlign: 'center', padding: '6px 10px', color: T.textLow, fontWeight: 500, cursor: 'help' }}>RMSE ⓘ</th>
            <th title={COL_TOOLTIPS.signs} style={{ textAlign: 'center', padding: '6px 10px', color: T.textLow, fontWeight: 500, cursor: 'help' }}>Sign issues ⓘ</th>
            <th title={COL_TOOLTIPS.reg}   style={{ textAlign: 'center', padding: '6px 10px', color: T.textLow, fontWeight: 500, cursor: 'help' }}>Regularizer ⓘ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, cvR2, alpha, alphaParts }) => {
            const m = models[key]
            if (!m || m.error) return (
              <tr key={key} style={{ borderBottom: `1px solid ${T.border}20` }}>
                <td style={{ padding: '7px 10px', fontSize: 12, color: T.textMin }}>{MODEL_LABELS[key]}</td>
                <td colSpan={5} style={{ padding: '7px 10px', fontSize: 11, color: T.red, textAlign: 'center' }}>
                  {m?.error ?? 'not available'}
                </td>
              </tr>
            )
            const isAutoSelected = key === selectedModel
            const isViewing      = key === viewing
            const r2    = key === 'ridge_split' ? `Off:${m.offModel?.r2} Def:${m.defModel?.r2}` : m.r2
            const rmse  = key === 'ridge_split' ? `Off:${m.offModel?.rmse} Def:${m.defModel?.rmse}` : m.rmse
            const signs = m.signIssues?.length ?? '—'
            const cvVal = (key === 'ridge_split')
              ? `Off:${m.offCvR2} Def:${m.defCvR2}`
              : (m.cvR2 != null ? m.cvR2 : '—')

            return (
              <tr
                key={key}
                onClick={() => onSelectModel?.(key)}
                style={{
                  borderBottom: `1px solid ${T.border}20`,
                  background: isViewing ? `${T.accent}14` : 'transparent',
                  cursor: onSelectModel ? 'pointer' : 'default',
                }}
              >
                <td title={MODEL_DESCRIPTIONS[key]} style={{ padding: '7px 10px', fontSize: 12, color: isViewing ? T.accentSoft : T.text, fontWeight: isViewing ? 600 : 400, cursor: 'help' }}>
                  {MODEL_LABELS[key]}
                  {isAutoSelected && (
                    <span title="Auto-picked by the pipeline as the best fit for the displayed coefficients" style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 3, background: T.greenBg, color: T.green, fontWeight: 700 }}>✓ in use</span>
                  )}
                  {isViewing && !isAutoSelected && (
                    <span style={{ marginLeft: 6, fontSize: 10, color: T.accentSoft }}>← viewing</span>
                  )}
                </td>
                <Cell highlight={isViewing}>{cvVal}</Cell>
                <Cell highlight={isViewing}>{r2}</Cell>
                <Cell highlight={isViewing}>{rmse}</Cell>
                <Cell highlight={isViewing}><SignBadge count={typeof signs === 'number' ? signs : 0} /></Cell>
                <Cell highlight={isViewing}>
                  {alphaParts
                    ? <span style={{ color: T.blue, fontSize: 11 }}>{alphaParts}</span>
                    : <AlphaBadge alpha={m.bestAlpha ?? alpha} />}
                </Cell>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p style={{ fontSize: 10, color: T.textMin, marginTop: 6 }}>
        Hover over a column header or model name for a plain-English explanation.
        {onSelectModel && ' Click a row to view that model\'s coefficients and scatter plot in the card above.'}
      </p>
    </div>
  )
}
