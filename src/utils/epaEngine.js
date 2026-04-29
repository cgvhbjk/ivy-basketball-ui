// EPA Engine — OLS regression to derive event EPA values from four factors
// Field names from teamSeasons.json:
//   adjoe, adjde             — adjusted offensive / defensive efficiency
//   efg_o, tov_o, orb, ftr_o — offensive four factors
//   efg_d, tov_d, drb, ftr_d — defensive four factors

// ---------- matrix helpers (internal) ----------

function zeros(r, c) {
  return Array.from({ length: r }, () => new Array(c).fill(0))
}

function transpose(A) {
  return A[0].map((_, j) => A.map(row => row[j]))
}

function matMul(A, B) {
  const m = A.length, k = A[0].length, n = B[0].length
  const C = zeros(m, n)
  for (let i = 0; i < m; i++)
    for (let l = 0; l < k; l++)
      for (let j = 0; j < n; j++)
        C[i][j] += A[i][l] * B[l][j]
  return C
}

// Gauss-Jordan elimination — returns M⁻¹ or throws if singular
function inverse(M) {
  const n = M.length
  const A = M.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ])
  for (let col = 0; col < n; col++) {
    let maxRow = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(A[row][col]) > Math.abs(A[maxRow][col])) maxRow = row
    }
    ;[A[col], A[maxRow]] = [A[maxRow], A[col]]
    const pivot = A[col][col]
    if (Math.abs(pivot) < 1e-12)
      throw new Error('Matrix is singular — regression failed (check for collinear features)')
    for (let j = 0; j < 2 * n; j++) A[col][j] /= pivot
    for (let row = 0; row < n; row++) {
      if (row === col) continue
      const f = A[row][col]
      for (let j = 0; j < 2 * n; j++) A[row][j] -= f * A[col][j]
    }
  }
  return A.map(row => row.slice(n))
}

// β = (X'X)⁻¹ X'y
function ols(X, y) {
  const Xt  = transpose(X)
  const XtX = matMul(Xt, X)
  const Xty = Xt.map(row => row.reduce((s, v, i) => s + v * y[i], 0))
  const inv = inverse(XtX)
  return inv.map(row => row.reduce((s, v, i) => s + v * Xty[i], 0))
}

function computeDiagnostics(X, y, beta) {
  const n    = y.length
  const p    = beta.length - 1
  const yHat = X.map(row => row.reduce((s, v, i) => s + v * beta[i], 0))
  const yMean = y.reduce((s, v) => s + v, 0) / n
  const ssTot = y.reduce((s, v) => s + (v - yMean) ** 2, 0)
  const ssRes = y.reduce((s, v, i) => s + (v - yHat[i]) ** 2, 0)
  const r2    = ssTot > 0 ? 1 - ssRes / ssTot : 0
  const adjR2 = ssTot > 0 ? 1 - (ssRes / (n - p - 1)) / (ssTot / (n - 1)) : 0
  const rmse  = Math.sqrt(ssRes / n)
  return { n, r2: +r2.toFixed(4), adjR2: +adjR2.toFixed(4), rmse: +rmse.toFixed(3), yHat }
}

// ---------- EPA unit conversion (internal) ----------

function convertToEventEPA(coefficients, { avgFGA = 48 } = {}) {
  const { off_eFG, off_TOV, off_ORB, off_FTR, def_eFG, def_TOV } = coefficients
  const eFGperFGA = 100 / avgFGA
  return {
    made2FG:            +(off_eFG  * eFGperFGA).toFixed(3),
    made3FG:            +(off_eFG  * eFGperFGA * 1.5).toFixed(3),
    offTurnover:        +(off_TOV).toFixed(3),
    offRebound:         +(off_ORB  * 0.85).toFixed(3),
    foulDrawn:          +(off_FTR  * eFGperFGA).toFixed(3),
    defForcedTurnover:  +(-def_TOV).toFixed(3),
    defShotSuppression: +(-def_eFG * eFGperFGA).toFixed(3),
  }
}

// ---------- exported helper ----------

export function estimatePossessions(fga, orb, tov, fta) {
  return Math.max(fga - orb + tov + 0.44 * fta, 1)
}

// ---------- Tier 1: team-season aggregates ----------

export function runTier1Regression(teamSeasons) {
  const valid = teamSeasons.filter(ts => {
    const vals = [ts.adjoe, ts.adjde, ts.efg_o, ts.tov_o, ts.orb, ts.ftr_o,
                  ts.efg_d, ts.tov_d, ts.drb, ts.ftr_d]
    return vals.every(v => v != null && !Number.isNaN(Number(v)))
  })
  if (valid.length < 10)
    throw new Error(`Only ${valid.length} valid team-seasons — need at least 10`)

  const X = valid.map(ts => [1, ts.efg_o, ts.tov_o, ts.orb, ts.ftr_o,
                               ts.efg_d, ts.tov_d, ts.drb, ts.ftr_d])
  const y = valid.map(ts => ts.adjoe - ts.adjde)

  const beta = ols(X, y)
  const diag = computeDiagnostics(X, y, beta)

  const [intercept, off_eFG, off_TOV, off_ORB, off_FTR,
         def_eFG, def_TOV, def_ORB, def_FTR] = beta
  const coefficients = { intercept, off_eFG, off_TOV, off_ORB, off_FTR,
                         def_eFG, def_TOV, def_ORB, def_FTR }

  return {
    tier: 1,
    label: `Team-season aggregates (n=${diag.n})`,
    n: diag.n, r2: diag.r2, adjR2: diag.adjR2, rmse: diag.rmse,
    coefficients,
    eventEPA: convertToEventEPA(coefficients),
    observations: valid.map((ts, i) => ({
      label: `${ts.school.charAt(0).toUpperCase() + ts.school.slice(1)} ${ts.year}`,
      actual:    +y[i].toFixed(2),
      predicted: +diag.yHat[i].toFixed(2),
    })),
  }
}

// ---------- Tier 2: game-log regressions ----------

export function runTier2Regression(gameLogs, { ivyOnly = false } = {}) {
  const rows = ivyOnly ? gameLogs.filter(g => g.is_ivy_opponent) : gameLogs

  const valid = rows.filter(g =>
    g.fga > 0 && g.opp_fga > 0 &&
    [g.fgm, g.fga, g.fg3m, g.ftm, g.fta, g.orb, g.tov, g.pts,
     g.opp_fgm, g.opp_fga, g.opp_fg3m, g.opp_ftm, g.opp_fta,
     g.opp_orb, g.opp_tov, g.opp_pts, g.drb, g.opp_drb]
      .every(v => v != null && !Number.isNaN(Number(v)))
  )
  if (valid.length < 20)
    throw new Error(
      `Only ${valid.length} valid game rows — need ≥20.${ivyOnly ? ' Try unchecking Ivy-only.' : ''}`
    )

  const processed = valid.map(g => {
    const poss  = estimatePossessions(g.fga,     g.orb,     g.tov,     g.fta)
    const oPoss = estimatePossessions(g.opp_fga, g.opp_orb, g.opp_tov, g.opp_fta)
    return {
      eFG_o: ((g.fgm + 0.5 * g.fg3m) / g.fga) * 100,
      tov_o: (g.tov / poss) * 100,
      orb_o: g.orb / (g.orb + (g.opp_drb || 1)) * 100,
      ftr_o: (g.ftm / g.fga) * 100,
      eFG_d: ((g.opp_fgm + 0.5 * g.opp_fg3m) / g.opp_fga) * 100,
      tov_d: (g.opp_tov / oPoss) * 100,
      orb_d: g.opp_orb / (g.opp_orb + (g.drb || 1)) * 100,
      ftr_d: (g.opp_ftm / g.opp_fga) * 100,
      netEff: ((g.pts / poss) - (g.opp_pts / oPoss)) * 100,
      g,
    }
  }).filter(r =>
    [r.eFG_o, r.tov_o, r.orb_o, r.ftr_o, r.eFG_d, r.tov_d, r.orb_d, r.ftr_d, r.netEff]
      .every(v => isFinite(v))
  )

  const X = processed.map(r => [1, r.eFG_o, r.tov_o, r.orb_o, r.ftr_o,
                                   r.eFG_d, r.tov_d, r.orb_d, r.ftr_d])
  const y = processed.map(r => r.netEff)

  const beta = ols(X, y)
  const diag = computeDiagnostics(X, y, beta)

  const [intercept, off_eFG, off_TOV, off_ORB, off_FTR,
         def_eFG, def_TOV, def_ORB, def_FTR] = beta
  const coefficients = { intercept, off_eFG, off_TOV, off_ORB, off_FTR,
                         def_eFG, def_TOV, def_ORB, def_FTR }

  return {
    tier: 2,
    label: `Game logs${ivyOnly ? ' · Ivy-only' : ''} (n=${diag.n})`,
    ivyOnly,
    n: diag.n, r2: diag.r2, adjR2: diag.adjR2, rmse: diag.rmse,
    coefficients,
    eventEPA: convertToEventEPA(coefficients),
    observations: processed.map((r, i) => ({
      label:     `${r.g.school} vs ${r.g.opponent}`,
      actual:    +y[i].toFixed(2),
      predicted: +diag.yHat[i].toFixed(2),
    })),
  }
}
