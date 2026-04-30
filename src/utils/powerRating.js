/**
 * Least-squares player power rating.
 *
 * Method:
 *   1. For each Ivy team-season, compute minute-weighted average of players'
 *      centered ORTG and DRTG (centered = individual minus league average).
 *   2. OLS-regress team net efficiency (adjoe − adjde) on those two team features.
 *      This tells us how much a unit of ortg_advantage and a unit of drtg_advantage
 *      actually translate into winning at the team level.
 *   3. Apply the coefficients back to individual players, scaling by their
 *      minutes share so high-usage performances weigh more.
 *
 * Why this captures "off the box score" stuff: ORTG and DRTG are already
 * lineup-adjusted by Barttorvik (they account for which teammates a player shares
 * the floor with), so they implicitly capture spacing, screening, rotations, and
 * other non-counted contributions that show up in margin when a player is on court.
 */

// ---------- matrix helpers ----------

function transpose(A) {
  return A[0].map((_, j) => A.map(row => row[j]))
}

function matMul(A, B) {
  const m = A.length, k = A[0].length, n = B[0].length
  return Array.from({ length: m }, (_, i) =>
    Array.from({ length: n }, (_, j) =>
      A[i].reduce((s, _, l) => s + A[i][l] * B[l][j], 0)
    )
  )
}

// Gauss–Jordan elimination with partial pivoting — solves Ax = b.
function solveLinear(A, b) {
  const n = A.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let maxRow = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row
    }
    ;[M[col], M[maxRow]] = [M[maxRow], M[col]]
    if (Math.abs(M[col][col]) < 1e-12) continue
    for (let row = 0; row < n; row++) {
      if (row === col) continue
      const f = M[row][col] / M[col][col]
      for (let j = col; j <= n; j++) M[row][j] -= f * M[col][j]
    }
  }
  return M.map((row, i) => (M[i][i] === 0 ? 0 : row[n] / row[i]))
}

// OLS via normal equations β = (XᵀX)⁻¹ Xᵀy
function ols(X, y) {
  const Xt = transpose(X)
  const XtX = matMul(Xt, X)
  const Xty = Xt.map(row => row.reduce((s, v, i) => s + v * y[i], 0))
  return solveLinear(XtX, Xty)
}

// ---------- main export ----------

export function computePowerRatings(teamSeasons, players) {
  const qualified = players.filter(
    p => p.min_pg >= 5 && p.ortg != null && p.drtg != null && p.efg != null
  )
  if (qualified.length < 10) return { ratings: [], coefficients: null }

  // League-average ORTG and DRTG from meaningful-minute players
  const pool = qualified.filter(p => p.min_pg >= 12)
  const avgOrtg = pool.reduce((s, p) => s + p.ortg, 0) / pool.length
  const avgDrtg = pool.reduce((s, p) => s + p.drtg, 0) / pool.length

  // Team-level design matrix: minute-weighted sums of centered stats
  // X row = [1, Σ(ortg_adj × minShare), Σ(drtg_adj × minShare)]
  // y = team net_efficiency
  const obs = []
  for (const ts of teamSeasons) {
    const squad = qualified.filter(p => p.school === ts.school && p.year === ts.year)
    if (squad.length < 3) continue
    const totalMin = squad.reduce((s, p) => s + p.min_pct, 0)
    if (totalMin === 0) continue
    const sumOrtgAdj = squad.reduce((s, p) => s + (p.ortg - avgOrtg) * (p.min_pct / totalMin), 0)
    const sumDrtgAdj = squad.reduce((s, p) => s + (p.drtg - avgDrtg) * (p.min_pct / totalMin), 0)
    obs.push({ x: [1, sumOrtgAdj, sumDrtgAdj], y: ts.net_efficiency })
  }

  if (obs.length < 6) return { ratings: [], coefficients: null }

  const X = obs.map(o => o.x)
  const Y = obs.map(o => o.y)
  const [bIntercept, bOrtg, bDrtg] = ols(X, Y)

  // R² for diagnostics
  const yMean = Y.reduce((s, v) => s + v, 0) / Y.length
  const yHat = obs.map(o => bIntercept + bOrtg * o.x[1] + bDrtg * o.x[2])
  const ssTot = Y.reduce((s, v) => s + (v - yMean) ** 2, 0)
  const ssRes = Y.reduce((s, v, i) => s + (v - yHat[i]) ** 2, 0)
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0

  // Player power rating = β_ortg × (ORTG − avg) × minShare
  //                     + β_drtg × (DRTG − avg) × minShare
  // The minShare scaling means a player who plays 40% of minutes contributes
  // more than one who plays 10% at the same per-possession efficiency.
  const ratings = qualified.map(p => {
    const minShare = Math.min(p.min_pct / 100, 1)
    const offComp = bOrtg * (p.ortg - avgOrtg) * minShare
    const defComp = bDrtg * (p.drtg - avgDrtg) * minShare
    const pr = offComp + defComp
    return {
      name: p.name,
      school: p.school,
      year: p.year,
      power_rating: +pr.toFixed(2),
      off_component: +offComp.toFixed(2),
      def_component: +defComp.toFixed(2),
    }
  })

  // Rank within each year
  const byYear = {}
  for (const r of ratings) {
    if (!byYear[r.year]) byYear[r.year] = []
    byYear[r.year].push(r)
  }
  for (const year in byYear) {
    byYear[year].sort((a, b) => b.power_rating - a.power_rating)
    byYear[year].forEach((r, i) => { r.rank = i + 1 })
  }

  return {
    ratings,
    coefficients: { bOrtg: +bOrtg.toFixed(4), bDrtg: +bDrtg.toFixed(4) },
    avgOrtg: +avgOrtg.toFixed(1),
    avgDrtg: +avgDrtg.toFixed(1),
    r2: +r2.toFixed(3),
  }
}
