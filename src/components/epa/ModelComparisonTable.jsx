import { T } from '../../styles/theme.js'
import { MODEL_LABELS } from '../../utils/epaModels/config.js'

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
  if (count === 0) return <span style={{ color: T.green, fontWeight: 600 }}>✓ 0</span>
  return <span style={{ color: T.amber, fontWeight: 600 }}>⚠ {count}</span>
}

function AlphaBadge({ alpha }) {
  if (alpha == null) return <span style={{ color: T.textMin }}>—</span>
  return <span style={{ color: T.blue }}>λ={alpha}</span>
}

export default function ModelComparisonTable({ models, selectedModel }) {
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

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${T.border}` }}>
            <th style={{ textAlign: 'left', padding: '6px 10px', color: T.textLow, fontWeight: 500 }}>Model</th>
            <th style={{ textAlign: 'center', padding: '6px 10px', color: T.textLow, fontWeight: 500 }}>LOO-CV R²</th>
            <th style={{ textAlign: 'center', padding: '6px 10px', color: T.textLow, fontWeight: 500 }}>In-sample R²</th>
            <th style={{ textAlign: 'center', padding: '6px 10px', color: T.textLow, fontWeight: 500 }}>RMSE</th>
            <th style={{ textAlign: 'center', padding: '6px 10px', color: T.textLow, fontWeight: 500 }}>Sign issues</th>
            <th style={{ textAlign: 'center', padding: '6px 10px', color: T.textLow, fontWeight: 500 }}>Regularizer</th>
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
            const isSelected = key === selectedModel
            const r2    = key === 'ridge_split' ? `Off:${m.offModel?.r2} Def:${m.defModel?.r2}` : m.r2
            const rmse  = key === 'ridge_split' ? `Off:${m.offModel?.rmse} Def:${m.defModel?.rmse}` : m.rmse
            const signs = m.signIssues?.length ?? '—'
            const cvVal = (key === 'ridge_split')
              ? `Off:${m.offCvR2} Def:${m.defCvR2}`
              : (m.cvR2 != null ? m.cvR2 : '—')

            return (
              <tr key={key} style={{ borderBottom: `1px solid ${T.border}20`, background: isSelected ? `${T.accent}0e` : 'transparent' }}>
                <td style={{ padding: '7px 10px', fontSize: 12, color: isSelected ? T.accentSoft : T.text, fontWeight: isSelected ? 600 : 400 }}>
                  {MODEL_LABELS[key]}
                  {isSelected && <span style={{ marginLeft: 6, fontSize: 10, color: T.accentSoft }}>← selected</span>}
                </td>
                <Cell highlight={isSelected}>{cvVal}</Cell>
                <Cell highlight={isSelected}>{r2}</Cell>
                <Cell highlight={isSelected}>{rmse}</Cell>
                <Cell highlight={isSelected}><SignBadge count={typeof signs === 'number' ? signs : 0} /></Cell>
                <Cell highlight={isSelected}>
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
        LOO-CV R²: leave-one-out cross-validated (out-of-sample). In-sample R² will always be higher — do not use it to compare models.
      </p>
    </div>
  )
}
