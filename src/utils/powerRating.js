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

// OLS solver re-exported from the shared linear-algebra layer (epaModels/matrixOps.js).
// Previously this file shipped its own Gauss–Jordan implementation, duplicating
// the one in matrixOps and the _mlr helper in insightEngine. Three copies → three
// places where a single bug-fix had to land. Now there is one implementation.
import { olsSolve } from './epaModels/matrixOps.js'
const ols = olsSolve

// Deterministic 32-bit PRNG so bootstrap rank intervals are reproducible.
function _mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6D2B79F5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------- main export ----------

/**
 * Compute power ratings + per-player rank distribution from team-season bootstrap.
 *
 * `bootstrap.B` controls how many times we resample team observations with
 * replacement, refit OLS, and re-rank players within each year. Each player
 * gets `rankP05` and `rankP95` (5th/95th percentiles of their bootstrap rank
 * distribution within their year) on top of the point estimate `rank`.
 *
 * @param {Array<Object>} teamSeasons
 * @param {Array<Object>} players
 * @param {{ bootstrap?: { B?: number, seed?: number } }} [opts]
 */
export function computePowerRatings(teamSeasons, players, opts = {}) {
  const { bootstrap = { B: 200, seed: 17 } } = opts
  const qualified = players.filter(
    p => p.min_pg >= 5 && p.ortg != null && p.drtg != null && p.efg != null
  )
  if (qualified.length < 10) return { ratings: [], coefficients: null }

  // Year-specific league averages from meaningful-minute players. Centering each
  // player against their own season removes year-to-year drift in league-wide
  // ORTG/DRTG (avoids comparing a 2022 ortg-above-avg to a 2025 one as if league
  // baseline were the same).
  const pool = qualified.filter(p => p.min_pg >= 12)
  const yearAvgOrtg = {}
  const yearAvgDrtg = {}
  for (const y of new Set(pool.map(p => p.year))) {
    const yp = pool.filter(p => p.year === y)
    if (!yp.length) continue
    yearAvgOrtg[y] = yp.reduce((s, p) => s + p.ortg, 0) / yp.length
    yearAvgDrtg[y] = yp.reduce((s, p) => s + p.drtg, 0) / yp.length
  }
  const cOrtg = p => p.ortg - (yearAvgOrtg[p.year] ?? 0)
  const cDrtg = p => p.drtg - (yearAvgDrtg[p.year] ?? 0)

  // Team-level design matrix: within-team minute-share weights summing to 1.
  // X row = [1, Σ(cOrtg × minShare), Σ(cDrtg × minShare)]
  // y = team net_efficiency
  // Per-team totalMin is cached for the player-rating step so the same weighting
  // (sums to 1 within a squad) is used at fit time and at attribution time.
  const obs = []
  const teamMinTotals = {}
  for (const ts of teamSeasons) {
    const squad = qualified.filter(p => p.school === ts.school && p.year === ts.year)
    if (squad.length < 3) continue
    const totalMin = squad.reduce((s, p) => s + p.min_pct, 0)
    if (totalMin === 0) continue
    teamMinTotals[`${ts.school}|${ts.year}`] = totalMin
    const sumOrtgAdj = squad.reduce((s, p) => s + cOrtg(p) * (p.min_pct / totalMin), 0)
    const sumDrtgAdj = squad.reduce((s, p) => s + cDrtg(p) * (p.min_pct / totalMin), 0)
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

  // Player power rating = β_ortg × cOrtg × (min_pct / totalMin_team)
  //                     + β_drtg × cDrtg × (min_pct / totalMin_team)
  // The within-team minute share matches the weight used during model fit, so
  // Σ_squad rating_i reproduces the team-level prediction (minus intercept).
  const ratings = qualified
    .map(p => {
      const totalMin = teamMinTotals[`${p.school}|${p.year}`]
      if (!totalMin) return null
      const minShare = p.min_pct / totalMin
      const offComp = bOrtg * cOrtg(p) * minShare
      const defComp = bDrtg * cDrtg(p) * minShare
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
    .filter(Boolean)

  // Rank within each year (point estimate)
  const byYear = {}
  for (const r of ratings) {
    if (!byYear[r.year]) byYear[r.year] = []
    byYear[r.year].push(r)
  }
  for (const year in byYear) {
    byYear[year].sort((a, b) => b.power_rating - a.power_rating)
    byYear[year].forEach((r, i) => { r.rank = i + 1 })
  }

  // ── Bootstrap rank intervals ────────────────────────────────────────────────
  // Resample team-season observations with replacement, refit OLS, re-rate &
  // re-rank players. Track each player's rank distribution within their year.
  // Reports 5th/95th percentile rank → "between 4th and 9th" rather than
  // a precise rank that overstates how confident the model is.
  const playerKey = p => `${p.name}|${p.school}|${p.year}`
  const rankSamples = new Map(ratings.map(r => [playerKey(r), []]))

  const B = bootstrap.B ?? 200
  const rand = _mulberry32(bootstrap.seed ?? 17)
  for (let b = 0; b < B; b++) {
    // Resample team observations (rows of obs[]) with replacement.
    const idx = []
    for (let i = 0; i < obs.length; i++) idx.push(Math.floor(rand() * obs.length))
    const Xb = idx.map(i => obs[i].x)
    const Yb = idx.map(i => obs[i].y)

    let coefs
    try { coefs = ols(Xb, Yb) } catch { continue }
    const [, bOrtgB, bDrtgB] = coefs
    if (!Number.isFinite(bOrtgB) || !Number.isFinite(bDrtgB)) continue

    const sample = ratings.map(r => {
      const p = qualified.find(q => q.name === r.name && q.school === r.school && q.year === r.year)
      const totalMin = teamMinTotals[`${r.school}|${r.year}`]
      const minShare = p.min_pct / totalMin
      return {
        ...r,
        pr: bOrtgB * cOrtg(p) * minShare + bDrtgB * cDrtg(p) * minShare,
      }
    })
    const byYearB = {}
    for (const s of sample) {
      if (!byYearB[s.year]) byYearB[s.year] = []
      byYearB[s.year].push(s)
    }
    for (const year in byYearB) {
      byYearB[year].sort((a, b) => b.pr - a.pr)
      byYearB[year].forEach((s, i) => {
        rankSamples.get(playerKey(s)).push(i + 1)
      })
    }
  }

  const percentile = (sorted, p) => {
    if (!sorted.length) return null
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))
    return sorted[idx]
  }
  for (const r of ratings) {
    const samples = (rankSamples.get(playerKey(r)) ?? []).slice().sort((a, b) => a - b)
    r.rankP05 = percentile(samples, 0.05)
    r.rankP95 = percentile(samples, 0.95)
    r.rankN   = samples.length
  }

  const fix1 = obj => Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, +v.toFixed(1)])
  )

  return {
    ratings,
    coefficients: { bOrtg: +bOrtg.toFixed(4), bDrtg: +bDrtg.toFixed(4) },
    yearAvgOrtg: fix1(yearAvgOrtg),
    yearAvgDrtg: fix1(yearAvgDrtg),
    r2: +r2.toFixed(3),
    bootstrap: { B, seed: bootstrap.seed ?? 17 },
  }
}
