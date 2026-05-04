// Pure data-driven calibration for the win-probability and Pythagorean-luck
// formulas. Both used to ship hard-coded constants (`* 0.12`, exponent 10)
// that were never anchored on this dataset.
//
// This file holds the *fitting* functions (calibrateWinPctModel,
// calibratePythagoreanExp) — pure, no JSON dependency, importable from Node
// scripts. The runtime cache lookup (`getWinModel`, `getPythagoreanModel`)
// lives in calibrationCache.js so the JSON import doesn't leak into Node.

/**
 * @typedef {Object} WinModel
 * @property {number} intercept     Logistic intercept (always 0 by symmetric fit).
 * @property {number} slope         Coefficient on (adjoeA-adjdeA) - (adjoeB-adjdeB).
 * @property {number} homeBonus     Coefficient on home indicator (+1/0/-1).
 * @property {number} n             Number of unique games used to fit.
 * @property {boolean} fallback     True if the legacy 0.12 slope was used.
 */

/**
 * @typedef {Object} PythagoreanModel
 * @property {number} exponent      Best-fit α for the Pythagorean formula.
 * @property {'raw'|'adjusted'} mode Which rating pair the α applies to.
 * @property {number} n             Team-seasons used to fit.
 * @property {?number} sse          Sum of squared errors at the optimum.
 * @property {boolean} fallback     True if too little data and α=10 was used.
 */

// ── Logistic regression for predictWinPct(net_eff_diff) ──────────────────────
//
// Given Ivy-vs-Ivy games and team-season net efficiency, fit:
//   logit(P(win)) = α₀ + β · diff + β_h · home_indicator
// where diff = (adjoeA − adjdeA) − (adjoeB − adjdeB).
//
// Returns { intercept, slope, homeBonus, n }.
// One row per *unique* game (school < opp_school) avoids the duplicated
// mirror-perspective rows in games.json.

function _logisticFit(X, y, { iters = 50, ridge = 1e-4 } = {}) {
  // Newton–Raphson on a small design matrix. ridge term stabilises the
  // Hessian when a column is near-collinear with intercept on small samples.
  const n = X.length
  const k = X[0].length
  const beta = new Array(k).fill(0)

  for (let it = 0; it < iters; it++) {
    const p = X.map(row => {
      const z = row.reduce((s, v, j) => s + v * beta[j], 0)
      return 1 / (1 + Math.exp(-z))
    })

    // Gradient: Xᵀ (y − p)
    const grad = new Array(k).fill(0)
    for (let j = 0; j < k; j++) {
      for (let i = 0; i < n; i++) grad[j] += X[i][j] * (y[i] - p[i])
    }

    // Hessian: −Xᵀ W X with W = diag(p(1−p))
    const H = Array.from({ length: k }, () => new Array(k).fill(0))
    for (let i = 0; i < n; i++) {
      const w = p[i] * (1 - p[i])
      for (let a = 0; a < k; a++)
        for (let b = 0; b < k; b++)
          H[a][b] -= X[i][a] * w * X[i][b]
    }
    for (let j = 0; j < k; j++) H[j][j] -= ridge

    // Solve H · Δ = −grad → Δ = −H⁻¹ grad
    const aug = H.map((row, i) => [...row, -grad[i]])
    for (let col = 0; col < k; col++) {
      let pivot = col
      for (let r = col + 1; r < k; r++)
        if (Math.abs(aug[r][col]) > Math.abs(aug[pivot][col])) pivot = r
      ;[aug[col], aug[pivot]] = [aug[pivot], aug[col]]
      const piv = aug[col][col]
      if (Math.abs(piv) < 1e-12) return null
      for (let j = col; j <= k; j++) aug[col][j] /= piv
      for (let r = 0; r < k; r++) {
        if (r === col) continue
        const f = aug[r][col]
        for (let j = col; j <= k; j++) aug[r][j] -= f * aug[col][j]
      }
    }
    const delta = aug.map(row => row[k])
    let maxStep = 0
    for (let j = 0; j < k; j++) {
      beta[j] += delta[j]
      maxStep = Math.max(maxStep, Math.abs(delta[j]))
    }
    if (maxStep < 1e-7) break
  }
  return beta
}

// Fit logistic regression `win ~ slope·diff + homeBonus·home`, no intercept.
// `home` is +1 (home), 0 (neutral), -1 (away of focal team).
//
// We feed in both perspectives of every Ivy-vs-Ivy game: (diff, home, y) and
// (−diff, −home, 1−y). The data is anti-symmetric, which forces the intercept
// to 0 by construction — the previous version restricted to school <
// opp_school, which was asymmetric and let the intercept absorb a spurious
// school-ordering effect (≈ -0.34 in this dataset).
//
// Falls back to the legacy `0.12` slope (no home bonus) when the fit is
// degenerate or there isn't enough data.
const FALLBACK = { intercept: 0, slope: 0.12, homeBonus: 0, n: 0, fallback: true }

/**
 * Fit a logistic model `P(win) = σ(slope·diff + homeBonus·home)` on Ivy-vs-Ivy games.
 * @param {Array<Object>} games — rows from games.json
 * @param {Array<Object>} teamSeasons — rows from teamSeasons.json
 * @returns {WinModel}
 */
export function calibrateWinPctModel(games, teamSeasons) {
  const seasonIdx = new Map(
    teamSeasons.map(s => [`${s.school}|${s.year}`, s])
  )

  const X = []   // [diff, home] — no intercept column
  const y = []
  for (const g of games) {
    if (!g.ivy_game || g.win == null || !g.opp_school) continue
    // Use only one row per game (alphabetically earlier school) and add
    // both perspectives manually to keep the data exactly anti-symmetric.
    if (g.school >= g.opp_school) continue
    const sA = seasonIdx.get(`${g.school}|${g.year}`)
    const sB = seasonIdx.get(`${g.opp_school}|${g.year}`)
    if (!sA || !sB) continue
    if (sA.adjoe == null || sA.adjde == null || sB.adjoe == null || sB.adjde == null) continue
    const diff = (sA.adjoe - sA.adjde) - (sB.adjoe - sB.adjde)
    const homeIndicator = g.neutral ? 0 : (g.home ? 1 : -1)
    const winA = g.win ? 1 : 0
    X.push([diff, homeIndicator])
    y.push(winA)
    X.push([-diff, -homeIndicator])
    y.push(1 - winA)
  }

  if (X.length < 60) return { ...FALLBACK, n: X.length }

  const beta = _logisticFit(X, y)
  if (!beta || !beta.every(Number.isFinite)) return { ...FALLBACK, n: X.length }

  return {
    intercept: 0,
    slope:     +beta[0].toFixed(4),
    homeBonus: +beta[1].toFixed(4),
    n: X.length / 2,  // unique games
    fallback: false,
  }
}

/**
 * Apply the fitted win-prob model.
 * @param {WinModel} model
 * @param {number}   netEffDiff   (adjoeA - adjdeA) - (adjoeB - adjdeB)
 * @param {-1|0|1}   [home=0]     Team A's location: 1 home, 0 neutral, -1 away.
 * @returns {number} P(team A wins) ∈ (0, 1)
 */
export function predictWinPctCalibrated(model, netEffDiff, home = 0) {
  const z = model.intercept + model.slope * netEffDiff + model.homeBonus * home
  return 1 / (1 + Math.exp(-z))
}

// ── Pythagorean exponent calibration ─────────────────────────────────────────
//
// Pythagorean win% takes the form `pf^α / (pf^α + pa^α)`. The "right" α for
// college basketball is empirical — Pomeroy uses ≈11.5 on raw points; for
// per-100-possession ratings it's also in that neighbourhood. We grid-search
// α over [6, 18] in 0.1 increments to minimise sum of squared errors against
// observed win%.
//
// `mode` switches what we feed it:
//   'raw'      — uses ts.ppp / ts.opp_ppp (the legacy choice)
//   'adjusted' — uses ts.adjoe / ts.adjde, which already strip out schedule
//                strength. Strongly recommended for cross-team luck analysis.

function _pyth(pf, pa, alpha) {
  if (pf <= 0 || pa <= 0) return 0.5
  const p = Math.pow(pf, alpha)
  const o = Math.pow(pa, alpha)
  return p / (p + o)
}

/**
 * Grid-search the Pythagorean exponent α minimising sum-of-squared-errors
 * against actual win%. Range searched: α ∈ [6.0, 18.0] in 0.1 steps.
 * @param {Array<Object>} teamSeasons
 * @param {{mode?: 'raw'|'adjusted'}} [opts]
 * @returns {PythagoreanModel}
 */
export function calibratePythagoreanExp(teamSeasons, { mode = 'adjusted' } = {}) {
  const fKey = mode === 'raw' ? 'ppp'     : 'adjoe'
  const aKey = mode === 'raw' ? 'opp_ppp' : 'adjde'
  const rows = teamSeasons.filter(ts =>
    ts[fKey] != null && ts[aKey] != null && ts.win_pct != null
  )
  if (rows.length < 8) return { exponent: 10, mode, n: rows.length, sse: null, fallback: true }

  let bestAlpha = 10, bestSSE = Infinity
  for (let a = 60; a <= 180; a++) {  // α ∈ [6.0, 18.0], 0.1 step
    const alpha = a / 10
    let sse = 0
    for (const ts of rows) {
      const py = _pyth(ts[fKey], ts[aKey], alpha)
      sse += (ts.win_pct - py) ** 2
    }
    if (sse < bestSSE) { bestSSE = sse; bestAlpha = alpha }
  }
  return {
    exponent: +bestAlpha.toFixed(1),
    mode,
    n: rows.length,
    sse: +bestSSE.toFixed(4),
    fallback: false,
  }
}

/**
 * Compute Pythagorean win% with the calibrated exponent and a chosen rating
 * pair. Defaults to adjusted ratings — the version that controls for SOS.
 * @param {Object} ts — a team-season row
 * @param {PythagoreanModel} model
 * @returns {?number} win-probability ∈ [0, 1], or null if ratings missing.
 */
export function pythagoreanWinPctCalibrated(ts, model) {
  const { mode, exponent } = model
  const fKey = mode === 'raw' ? 'ppp'     : 'adjoe'
  const aKey = mode === 'raw' ? 'opp_ppp' : 'adjde'
  if (ts[fKey] == null || ts[aKey] == null) return null
  return _pyth(ts[fKey], ts[aKey], exponent)
}

// Note: the runtime cache layer (`getWinModel`, `getPythagoreanModel`,
// `isCalibrationCached`) lives in calibrationCache.js so this file stays
// importable from Node scripts (which can't transparently import JSON).
