import { ridgeSolve, olsSolve, computeFit, nnls } from './matrixOps.js'
import { computeScaler, standardizeX, unstandardizeCoefficients } from './features.js'
import { SIGN_CONSTRAINTS } from './config.js'

// ── OLS baseline ──────────────────────────────────────────────────────────────

export function fitOLS(X, y, featureNames) {
  const beta = olsSolve(X, y)
  const fit  = computeFit(X, y, beta)
  return { method: 'ols', beta, featureNames, ...fit }
}

// ── Ridge with explicit alpha ─────────────────────────────────────────────────
// Standardizes X internally, returns coefficients on original scale.

export function fitRidge(X, y, alpha, featureNames) {
  const yMean  = y.reduce((s, v) => s + v, 0) / y.length
  const scaler = computeScaler(X)
  const Xs     = standardizeX(X, scaler)
  // Fit ridge on standardized X (intercept at col 0 — penalize all other cols)
  // We exclude intercept from penalty by adding λ only to cols 1..k
  const XsNoint = Xs.map(row => row.slice(1))  // drop intercept column
  const yc = y.map(v => v - yMean)             // center y to absorb intercept
  const betaStdNoint = ridgeSolve(XsNoint, yc, alpha)
  const betaStd = [0, ...betaStdNoint]          // placeholder intercept
  const beta = unstandardizeCoefficients(betaStd, scaler, yMean)
  const fit  = computeFit(X, y, beta)
  return { method: 'ridge', alpha, beta, featureNames, scaler, ...fit }
}

// ── Ridge with LOO-CV alpha selection ────────────────────────────────────────

// Deterministic 32-bit PRNG (mulberry32) — used to shuffle CV folds reproducibly.
// LOO doesn't need shuffling (every fold has exactly one observation), but with
// k-fold and rows pre-sorted by school/year, sequential `i % k` assignment puts
// non-random groupings into each fold and inflates CV-R².
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffledIndices(n, seed) {
  const idx = Array.from({ length: n }, (_, i) => i)
  const rand = mulberry32(seed)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[idx[i], idx[j]] = [idx[j], idx[i]]
  }
  return idx
}

export function fitRidgeCV(X, y, featureNames, { alphas, cvFolds = 'loo', seed = 1 } = {}) {
  const n = y.length
  const folds = cvFolds === 'loo' ? n : Math.min(cvFolds, n)

  // For LOO each fold is a single row, so shuffling has no effect; for k-fold
  // we permute once and assign by position so each fold sees a mix of rows.
  const order = folds === n ? Array.from({ length: n }, (_, i) => i) : shuffledIndices(n, seed)
  const foldAssign = new Array(n)
  order.forEach((origIdx, pos) => { foldAssign[origIdx] = pos % folds })

  const indices = Array.from({ length: n }, (_, i) => i)

  let bestAlpha = alphas[0]
  let bestMSE   = Infinity
  const cvResults = []

  for (const alpha of alphas) {
    const preds = new Array(n).fill(null)

    for (let fold = 0; fold < folds; fold++) {
      const trainIdx = indices.filter(i => foldAssign[i] !== fold)
      const testIdx  = indices.filter(i => foldAssign[i] === fold)
      const Xtr = trainIdx.map(i => X[i])
      const ytr = trainIdx.map(i => y[i])
      const model = fitRidge(Xtr, ytr, alpha, featureNames)
      testIdx.forEach(i => {
        preds[i] = X[i].reduce((s, v, j) => s + v * model.beta[j], 0)
      })
    }

    const mse = y.reduce((s, v, i) => s + (v - preds[i]) ** 2, 0) / n
    const yMean = y.reduce((s, v) => s + v, 0) / n
    const ssTot = y.reduce((s, v) => s + (v - yMean) ** 2, 0)
    const looR2 = ssTot > 0 ? +(1 - mse * n / ssTot).toFixed(4) : 0

    cvResults.push({ alpha, mse: +mse.toFixed(4), looR2 })
    if (mse < bestMSE) { bestMSE = mse; bestAlpha = alpha }
  }

  // Refit on all data with best alpha
  const finalModel = fitRidge(X, y, bestAlpha, featureNames)

  // Also compute per-fold beta for stability reporting (using the same fold split)
  const foldBetas = []
  for (let fold = 0; fold < folds; fold++) {
    const trainIdx = indices.filter(i => foldAssign[i] !== fold)
    const Xtr = trainIdx.map(i => X[i])
    const ytr = trainIdx.map(i => y[i])
    foldBetas.push(fitRidge(Xtr, ytr, bestAlpha, featureNames).beta)
  }

  const cvR2 = cvResults.find(r => r.alpha === bestAlpha)?.looR2 ?? null

  return {
    ...finalModel,
    method:    'ridge_cv',
    bestAlpha,
    cvResults,
    cvR2,
    foldBetas,
  }
}

// ── Split offense + defense models ───────────────────────────────────────────
// Fits two independent ridge models.
// offModel: [1, off_eFG, off_TOV, off_ORB, off_FTR] → offTarget
// defModel: [1, def_eFG, def_TOV, def_ORB, def_FTR] → defTarget

export function fitSplitRidgeCV(
  XOff, yOff, offNames,
  XDef, yDef, defNames,
  { alphas, cvFolds = 'loo' } = {}
) {
  const offModel = fitRidgeCV(XOff, yOff, offNames, { alphas, cvFolds })
  const defModel = fitRidgeCV(XDef, yDef, defNames, { alphas, cvFolds })

  // Combine coefficients into a single named map
  const combined = {}
  offNames.forEach((name, i) => {
    combined[name] = offModel.beta[i + 1]  // skip intercept
  })
  defNames.forEach((name, i) => {
    combined[name] = defModel.beta[i + 1]
  })

  return {
    method:    'ridge_split',
    offModel,
    defModel,
    combined,            // named coefficient map (no intercepts)
    offCvR2:  offModel.cvR2,
    defCvR2:  defModel.cvR2,
    // Combined LOO-R² is the average of the two side models
    cvR2:     +((offModel.cvR2 + defModel.cvR2) / 2).toFixed(4),
  }
}

// ── Constrained OLS (sign constraints via NNLS sign flip) ────────────────────
// For each feature with a -1 constraint, negate the column, solve NNLS,
// then negate the coefficient back. Intercept is always unconstrained.

export function fitConstrained(X, y, featureNames, signConstraints = SIGN_CONSTRAINTS) {
  const nFeat = X[0].length - 1  // exclude intercept

  // Center y and X to handle intercept separately
  const yMean = y.reduce((s, v) => s + v, 0) / y.length
  const colMeans = featureNames.map((_, j) => {
    const col = X.map(row => row[j + 1])
    return col.reduce((s, v) => s + v, 0) / col.length
  })

  const yc = y.map(v => v - yMean)
  const Xc = X.map(row => featureNames.map((_, j) => row[j + 1] - colMeans[j]))

  // Apply sign flips to make all constraints into ≥ 0.
  // Note: NNLS can only enforce non-negativity, so a constraint of 0
  // ("unconstrained") still runs through the same flow — we treat it as +1
  // (no flip, NNLS will zero it if its true sign is negative). A previous
  // version used `?? 1`, which left signs[j] at 0 and silently dropped the
  // feature column entirely.
  const signs = featureNames.map(name => {
    const s = signConstraints[name]
    return s === 1 || s === -1 ? s : 1
  })
  const Xflip = Xc.map(row => row.map((v, j) => v * signs[j]))

  let betaPos
  try {
    betaPos = nnls(Xflip, yc)
  } catch {
    return { method: 'constrained_ols', error: 'NNLS solver failed', beta: null }
  }

  // Flip signs back
  const betaNoInt = betaPos.map((b, j) => b * signs[j])

  // Recover intercept: β₀ = ȳ - Σ βⱼ * mean(Xⱼ)
  const intercept = yMean - betaNoInt.reduce((s, b, j) => s + b * colMeans[j], 0)
  const beta = [intercept, ...betaNoInt]

  const fit = computeFit(X, y, beta)
  return { method: 'constrained_ols', beta, featureNames, ...fit }
}

// ── Coefficient sign check ────────────────────────────────────────────────────

export function checkSigns(beta, featureNames, signConstraints = SIGN_CONSTRAINTS) {
  const issues = []
  featureNames.forEach((name, i) => {
    const expected = signConstraints[name]
    const actual   = beta[i + 1]  // skip intercept
    if (expected === undefined) return
    if (expected > 0 && actual < 0) issues.push({ name, expected: '+', actual: actual.toFixed(3) })
    if (expected < 0 && actual > 0) issues.push({ name, expected: '-', actual: actual.toFixed(3) })
  })
  return issues
}
