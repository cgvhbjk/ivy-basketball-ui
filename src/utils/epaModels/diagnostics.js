import { olsSolve, computeFit } from './matrixOps.js'
import { DEFAULT_CONFIG } from './config.js'

const { vifWarnThreshold, vifErrorThreshold } = DEFAULT_CONFIG.diagnostics

// ── VIF (Variance Inflation Factor) ──────────────────────────────────────────
// VIF_j = 1 / (1 - R²_j) where R²_j = R² from regressing feature j on all others.
// VIF > 5 → moderate collinearity, > 10 → severe

export function computeVIF(X, featureNames) {
  const k = featureNames.length
  const results = {}

  for (let j = 0; j < k; j++) {
    // Target: column j+1 of X (skip intercept at col 0)
    const y_j = X.map(row => row[j + 1])

    // Predictors: all other feature columns + intercept
    const X_j = X.map(row => [
      1,
      ...featureNames
        .map((_, l) => row[l + 1])
        .filter((_, l) => l !== j),
    ])

    let r2 = 0
    try {
      const beta = olsSolve(X_j, y_j)
      const fit  = computeFit(X_j, y_j, beta)
      r2 = fit.r2
    } catch {
      r2 = 0
    }

    const vif = r2 >= 1 ? Infinity : 1 / (1 - r2)
    results[featureNames[j]] = +vif.toFixed(2)
  }

  return results
}

// ── VIF warnings ─────────────────────────────────────────────────────────────

export function vifWarnings(vifMap) {
  const warnings = []
  for (const [name, vif] of Object.entries(vifMap)) {
    if (!isFinite(vif)) {
      warnings.push({ name, vif, level: 'error', msg: `${name}: VIF=∞ — perfect collinearity` })
    } else if (vif >= vifErrorThreshold) {
      warnings.push({ name, vif, level: 'error', msg: `${name}: VIF=${vif} — severe collinearity (≥${vifErrorThreshold})` })
    } else if (vif >= vifWarnThreshold) {
      warnings.push({ name, vif, level: 'warn', msg: `${name}: VIF=${vif} — moderate collinearity (≥${vifWarnThreshold})` })
    }
  }
  return warnings
}

// ── Pearson correlation matrix ────────────────────────────────────────────────

export function correlationMatrix(X, featureNames) {
  const k = featureNames.length
  const cols = featureNames.map((_, j) => X.map(row => row[j + 1]))
  const means = cols.map(c => c.reduce((s, v) => s + v, 0) / c.length)
  const stds  = cols.map((c, j) => {
    const m = means[j]
    return Math.sqrt(c.reduce((s, v) => s + (v - m) ** 2, 0) / c.length) || 1
  })

  const matrix = Array.from({ length: k }, (_, i) =>
    Array.from({ length: k }, (_, j) => {
      if (i === j) return 1
      const cov = X.reduce((s, row) =>
        s + (row[i + 1] - means[i]) * (row[j + 1] - means[j]), 0
      ) / X.length
      return +(cov / (stds[i] * stds[j])).toFixed(3)
    })
  )
  return { featureNames, matrix }
}

// ── Coefficient stability across CV folds ────────────────────────────────────
// Input: array of beta arrays (one per fold), featureNames
// Output: per-feature { mean, std, cv (coeff of variation), signConsistent }

export function coefficientStability(foldBetas, featureNames) {
  const stability = {}

  featureNames.forEach((name, j) => {
    const vals = foldBetas.map(b => b[j + 1])  // skip intercept
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length
    const std  = Math.sqrt(
      vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length
    )
    const cv   = Math.abs(mean) > 1e-8 ? std / Math.abs(mean) : Infinity
    const nPos = vals.filter(v => v > 0).length
    const nNeg = vals.filter(v => v < 0).length
    const signConsistent = nPos === vals.length || nNeg === vals.length

    stability[name] = {
      mean: +mean.toFixed(4),
      std:  +std.toFixed(4),
      cv:   isFinite(cv) ? +cv.toFixed(3) : null,
      signConsistent,
      signFlips: Math.min(nPos, nNeg),
    }
  })

  return stability
}

// ── Residual diagnostics ─────────────────────────────────────────────────────

export function residualDiagnostics(yHat, y) {
  const n         = y.length
  const residuals = y.map((v, i) => v - yHat[i])
  const mean      = residuals.reduce((s, v) => s + v, 0) / n
  const std       = Math.sqrt(
    residuals.reduce((s, v) => s + (v - mean) ** 2, 0) / n
  )

  // Simple normality check: |skewness| > 1 is a flag
  const skewness = residuals.reduce((s, v) => s + ((v - mean) / (std || 1)) ** 3, 0) / n

  return {
    mean:      +mean.toFixed(4),
    std:       +std.toFixed(4),
    skewness:  +skewness.toFixed(3),
    normalityFlag: Math.abs(skewness) > 1,
    points: y.map((v, i) => ({ actual: +v.toFixed(2), predicted: +yHat[i].toFixed(2), residual: +residuals[i].toFixed(2) })),
  }
}

// ── Full diagnostics bundle ───────────────────────────────────────────────────

export function runDiagnostics(X, y, featureNames, foldBetas = null) {
  const vif      = computeVIF(X, featureNames)
  const vifWarn  = vifWarnings(vif)
  const corrMat  = correlationMatrix(X, featureNames)
  const stability = foldBetas ? coefficientStability(foldBetas, featureNames) : null

  return { vif, vifWarnings: vifWarn, correlationMatrix: corrMat, stability }
}
