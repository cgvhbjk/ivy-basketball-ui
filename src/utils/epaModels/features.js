import { FIELD_MAP } from './config.js'

// Feature names in model order
export const OFF_FEATURES = ['off_eFG', 'off_TOV', 'off_ORB', 'off_FTR']
export const DEF_FEATURES = ['def_eFG', 'def_TOV', 'def_ORB', 'def_FTR']
export const ALL_FEATURES  = [...OFF_FEATURES, ...DEF_FEATURES]

// Map a team-season row to named feature values using FIELD_MAP
export function extractRow(ts) {
  return {
    off_eFG: ts[FIELD_MAP.off_eFG],
    off_TOV: ts[FIELD_MAP.off_TOV],
    off_ORB: ts[FIELD_MAP.off_ORB],
    off_FTR: ts[FIELD_MAP.off_FTR],
    def_eFG: ts[FIELD_MAP.def_eFG],
    def_TOV: ts[FIELD_MAP.def_TOV],
    def_ORB: ts[FIELD_MAP.def_ORB],
    def_FTR: ts[FIELD_MAP.def_FTR],
  }
}

// Build design matrix X (with intercept column) and target vector y
// featureKeys: which subset of features to include
export function buildMatrix(rows, featureKeys, targetKey) {
  const X = rows.map(ts => [1, ...featureKeys.map(k => ts[k])])
  const y = rows.map(ts => ts[targetKey])
  return { X, y }
}

// Compute column-wise mean and std from X (excluding the intercept column 0)
export function computeScaler(X) {
  const nCols = X[0].length
  const means = new Array(nCols).fill(0)
  const stds  = new Array(nCols).fill(1)

  for (let j = 1; j < nCols; j++) {
    const vals = X.map(row => row[j])
    const m    = vals.reduce((s, v) => s + v, 0) / vals.length
    const variance = vals.reduce((s, v) => s + (v - m) ** 2, 0) / vals.length
    means[j] = m
    stds[j]  = Math.sqrt(variance) || 1  // guard against zero-variance features
  }
  return { means, stds }
}

// Apply z-score standardization to X (intercept column 0 is left as 1)
export function standardizeX(X, scaler) {
  return X.map(row =>
    row.map((v, j) => j === 0 ? 1 : (v - scaler.means[j]) / scaler.stds[j])
  )
}

// Convert ridge coefficients fit on standardized X back to original scale
// beta[0] = intercept on standardized scale
// beta[j] = standardized coefficient for feature j (j≥1)
export function unstandardizeCoefficients(betaStd, scaler, yMean) {
  const { means, stds } = scaler
  const k = betaStd.length - 1
  // Original-scale slope: β_j = β_std_j / std_j
  const beta = [0, ...betaStd.slice(1).map((b, i) => b / stds[i + 1])]
  // Original-scale intercept: β_0 = ȳ - Σ β_j * mean_j
  // Note: when ridge is fit with standardized X, the intercept from the solver
  // is on the standardized scale; we recompute it from scratch.
  beta[0] = yMean - beta.slice(1).reduce((s, b, i) => s + b * means[i + 1], 0)
  return beta
}

// Attach extracted feature values back onto each row (mutates a copy)
export function attachFeatures(teamSeasons) {
  return teamSeasons.map(ts => ({ ...ts, ...extractRow(ts) }))
}
