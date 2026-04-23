// Pure statistical utilities — no React imports

export function pearsonCorrelation(xs, ys) {
  const n = xs.length
  if (n < 4) return 0
  const meanX = xs.reduce((s, v) => s + v, 0) / n
  const meanY = ys.reduce((s, v) => s + v, 0) / n
  let num = 0, sdX = 0, sdY = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX
    const dy = ys[i] - meanY
    num += dx * dy
    sdX += dx * dx
    sdY += dy * dy
  }
  const denom = Math.sqrt(sdX * sdY)
  return denom === 0 ? 0 : num / denom
}

export function computeRelationship(teamSeasons, xKey, yKey, filters = {}) {
  const { yearRange = [2022, 2025] } = filters
  const rows = teamSeasons.filter(s => {
    if (s.year < yearRange[0] || s.year > yearRange[1]) return false
    if (s[xKey] == null || s[yKey] == null) return false
    return true
  })
  const xs = rows.map(s => s[xKey])
  const ys = rows.map(s => s[yKey])
  return {
    points: rows.map(s => ({ x: s[xKey], y: s[yKey], school: s.school, year: s.year })),
    correlation: parseFloat(pearsonCorrelation(xs, ys).toFixed(3)),
    n: rows.length,
  }
}

export function scoreInsight(correlation, n) {
  const absR = Math.abs(correlation)
  if (n < 6) return { valid: false, strength: absR, confidence: 'LOW', reason: 'Fewer than 6 data points' }
  if (absR < 0.20) return { valid: false, strength: absR, confidence: 'LOW', reason: 'Effect too small (|r| < 0.20)' }
  const confidence = absR >= 0.55 ? 'HIGH' : absR >= 0.35 ? 'MEDIUM' : 'LOW'
  return { valid: true, strength: absR, confidence, reason: null }
}

export function timeWindowComparison(teamSeasons, xKey, yKey) {
  const windows = [
    { label: '2022–23', years: [2022, 2023] },
    { label: '2024–25', years: [2024, 2025] },
  ]
  return windows.map(w => {
    const rows = teamSeasons.filter(s =>
      w.years.includes(s.year) && s[xKey] != null && s[yKey] != null
    )
    if (rows.length < 4) return { ...w, r: null, n: rows.length }
    const r = pearsonCorrelation(rows.map(s => s[xKey]), rows.map(s => s[yKey]))
    return { ...w, r: parseFloat(r.toFixed(3)), n: rows.length }
  })
}

export function detectThreshold(teamSeasons, xKey, yKey, yearRange = [2022, 2025]) {
  const rows = teamSeasons
    .filter(s =>
      s.year >= yearRange[0] && s.year <= yearRange[1] &&
      s[xKey] != null && s[yKey] != null
    )
    .map(s => ({ x: s[xKey], y: s[yKey] }))
    .sort((a, b) => a.x - b.x)

  if (rows.length < 6) return null

  const avg = arr => arr.reduce((s, v) => s + v, 0) / arr.length
  let best = null, bestEffect = 0

  for (let i = 2; i < rows.length - 2; i++) {
    const threshold = (rows[i].x + rows[i + 1].x) / 2
    const below = rows.slice(0, i + 1).map(r => r.y)
    const above = rows.slice(i + 1).map(r => r.y)
    const mBelow = avg(below)
    const mAbove = avg(above)
    const effect = Math.abs(mAbove - mBelow)
    if (effect > bestEffect) {
      bestEffect = effect
      best = {
        threshold: parseFloat(threshold.toFixed(1)),
        belowMean: parseFloat(mBelow.toFixed(3)),
        aboveMean: parseFloat(mAbove.toFixed(3)),
        effect: parseFloat(effect.toFixed(3)),
        belowN: i + 1,
        aboveN: rows.length - i - 1,
      }
    }
  }
  return best
}

// Linear regression — returns {slope, intercept} for {x, y} point array.
export function linearRegression(points) {
  const n = points.length
  if (n < 2) return { slope: 0, intercept: 0 }
  const meanX = points.reduce((s, p) => s + p.x, 0) / n
  const meanY = points.reduce((s, p) => s + p.y, 0) / n
  let num = 0, denom = 0
  for (const p of points) {
    num += (p.x - meanX) * (p.y - meanY)
    denom += (p.x - meanX) ** 2
  }
  const slope = denom === 0 ? 0 : num / denom
  return { slope, intercept: meanY - slope * meanX }
}

// Style-bucket interactions — groups by play style (3-point rate or tempo)
// and computes correlation per bucket; basketball analogue of scheme interactions.
export function detectStyleInteractions(teamSeasons, xKey, yKey, styleKey = 'three_rate_o') {
  const buckets =
    styleKey === 'tempo'
      ? [
          { label: 'Up-Tempo (≥70)',  test: s => s.tempo >= 70 },
          { label: 'Moderate (64–70)', test: s => s.tempo >= 64 && s.tempo < 70 },
          { label: 'Slow (<64)',        test: s => s.tempo < 64 },
        ]
      : [
          { label: '3-Heavy (≥40%)',   test: s => s.three_rate_o >= 40 },
          { label: 'Balanced (30–40)', test: s => s.three_rate_o >= 30 && s.three_rate_o < 40 },
          { label: 'Inside Out (<30)', test: s => s.three_rate_o < 30 },
        ]

  return buckets.map(b => {
    const rows = teamSeasons.filter(s => b.test(s) && s[xKey] != null && s[yKey] != null)
    if (rows.length < 3) return { label: b.label, r: null, n: rows.length }
    const r = pearsonCorrelation(rows.map(s => s[xKey]), rows.map(s => s[yKey]))
    return { label: b.label, r: parseFloat(r.toFixed(3)), n: rows.length }
  })
}

// ── Scheme classification ─────────────────────────────────────────────────────

export function classifyOffScheme(season) {
  const fast   = season.tempo >= 68
  const heavy3 = season.three_rate_o >= 40
  if (fast  && heavy3)  return 'Run & Gun'
  if (fast  && !heavy3) return 'Transition Attack'
  if (!fast && heavy3)  return 'Spread Offense'
  return 'Grind It Out'
}

export function classifyDefScheme(season) {
  if (season.tov_d  >= 31) return 'High Pressure'
  if (season.blk_d  >= 11) return 'Rim Protection'
  if (season.efg_d  <= 50) return 'Coverage'
  return 'Standard'
}

export const OFF_SCHEME_ORDER = ['Run & Gun', 'Transition Attack', 'Spread Offense', 'Grind It Out']
export const DEF_SCHEME_ORDER = ['High Pressure', 'Rim Protection', 'Coverage', 'Standard']

export function schemeBreakdown(teamSeasons, schemeType, metricKey) {
  const classify = schemeType === 'off' ? classifyOffScheme : classifyDefScheme
  const order    = schemeType === 'off' ? OFF_SCHEME_ORDER  : DEF_SCHEME_ORDER
  const groups   = Object.fromEntries(order.map(n => [n, []]))
  for (const s of teamSeasons) groups[classify(s)].push(s)
  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
  return order.map(name => {
    const rows = groups[name]
    const pick = key => rows.map(r => r[key]).filter(v => v != null)
    return {
      scheme: name,
      n: rows.length,
      value: avg(pick(metricKey)) != null ? parseFloat(avg(pick(metricKey)).toFixed(3)) : null,
      avgWinPct: avg(pick('win_pct')),
      avgAdjoe:  avg(pick('adjoe')),
      avgAdjde:  avg(pick('adjde')),
    }
  })
}

// ── Biodata helpers ───────────────────────────────────────────────────────────

export function parseHeightIn(str) {
  if (!str) return null
  const m = str.match(/^(\d+)-(\d+)$/)
  return m ? parseInt(m[1]) * 12 + parseInt(m[2]) : null
}

export function classYearNum(yr) {
  return { Fr: 1, So: 2, Jr: 3, Sr: 4, Grad: 5, GR: 5 }[yr] ?? null
}

function isGuard(p)   { return /(PG|Combo G|Wing G|Scoring PG)/i.test(p.pos_type ?? '') }
function isForward(p) { return /(Wing F|Stretch|SF)/i.test(p.pos_type ?? '') }
function isBig(p)     { return /(PF\/C|^C$|Post|Center)/i.test(p.pos_type ?? '') }

export function buildRosterAggregates(players) {
  const byKey = {}
  for (const p of players) {
    if (!p.min_pg || p.min_pg < 6) continue
    const k = `${p.school}||${p.year}`
    if (!byKey[k]) byKey[k] = { school: p.school, year: p.year, ps: [] }
    byKey[k].ps.push(p)
  }
  const avg = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null
  return Object.values(byKey).map(({ school, year, ps }) => {
    const n = ps.length
    const heights = ps.map(p => parseHeightIn(p.height)).filter(v => v != null)
    const exps    = ps.map(p => classYearNum(p.class_yr)).filter(v => v != null)
    return {
      school, year, n,
      avg_height_in:  heights.length ? parseFloat(avg(heights).toFixed(1)) : null,
      avg_experience: exps.length    ? parseFloat(avg(exps).toFixed(2))    : null,
      pct_guards:     parseFloat((ps.filter(isGuard).length   / n * 100).toFixed(1)),
      pct_forwards:   parseFloat((ps.filter(isForward).length / n * 100).toFixed(1)),
      pct_bigs:       parseFloat((ps.filter(isBig).length     / n * 100).toFixed(1)),
    }
  })
}

export function computeBiodataRelationship(rosterAggs, teamSeasons, biodataKey, outcomeKey) {
  const seasonMap = new Map(teamSeasons.map(s => [`${s.school}||${s.year}`, s]))
  const joined = rosterAggs
    .map(agg => {
      const season = seasonMap.get(`${agg.school}||${agg.year}`)
      if (!season) return null
      const x = agg[biodataKey], y = season[outcomeKey]
      if (x == null || y == null) return null
      return { x, y, school: agg.school, year: agg.year }
    })
    .filter(Boolean)
  const xs = joined.map(r => r.x), ys = joined.map(r => r.y)
  return {
    points: joined,
    correlation: joined.length >= 4 ? parseFloat(pearsonCorrelation(xs, ys).toFixed(3)) : 0,
    n: joined.length,
  }
}

export function computePlayerRelationship(players, xKey, yKey) {
  const rows = players.filter(p => p[xKey] != null && p[yKey] != null && p.min_pg >= 10)
  const xs = rows.map(p => p[xKey]), ys = rows.map(p => p[yKey])
  return {
    points: rows.map(p => ({ x: p[xKey], y: p[yKey], school: p.school, name: p.name, year: p.year, pos_type: p.pos_type })),
    correlation: rows.length >= 4 ? parseFloat(pearsonCorrelation(xs, ys).toFixed(3)) : 0,
    n: rows.length,
  }
}

export function generateInsightText(xLabel, yLabel, correlation, n, threshold) {
  const dir = correlation > 0 ? 'positively' : 'negatively'
  const strength =
    Math.abs(correlation) >= 0.55 ? 'strongly' :
    Math.abs(correlation) >= 0.35 ? 'moderately' : 'weakly'
  let text = `${xLabel} is ${strength} ${dir} correlated with ${yLabel} (r = ${correlation.toFixed(2)}, n = ${n} team-seasons).`
  if (threshold) {
    text += ` Teams with ${xLabel} above ${threshold.threshold} average ${threshold.aboveMean.toFixed(3)} ${yLabel} vs ${threshold.belowMean.toFixed(3)} below (Δ ${threshold.effect.toFixed(3)}).`
  }
  return text
}
