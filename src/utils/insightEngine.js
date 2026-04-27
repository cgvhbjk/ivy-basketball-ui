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

// ── Weighted average helpers ──────────────────────────────────────────────────

export function weightedAvg(items, valueKey, weightKey = 'min_pg') {
  const valid = items.filter(p => p[valueKey] != null && p[weightKey] != null && p[weightKey] > 0)
  if (!valid.length) return null
  const totalWeight = valid.reduce((s, p) => s + p[weightKey], 0)
  if (totalWeight === 0) return null
  return valid.reduce((s, p) => s + p[valueKey] * p[weightKey], 0) / totalWeight
}

// Maps Barttorvik pos_type to broad group: 'Guard' | 'Forward' | 'Big' | null
export function broadPositionGroup(posType) {
  if (!posType) return null
  const t = posType.toLowerCase()
  if (/\bpg\b|combo g|wing g|scoring pg/.test(t)) return 'Guard'
  if (/wing f|stretch|^sf$/.test(t)) return 'Forward'
  if (/pf\/c|\bc\b|post|center/.test(t)) return 'Big'
  if (/guard/.test(t)) return 'Guard'
  if (/forward/.test(t)) return 'Forward'
  if (/big/.test(t)) return 'Big'
  return null
}

// Build playing-time-weighted aggregates per position group for a squad
// Returns { Guard: {...}, Forward: {...}, Big: {...} } or subsets present
export function buildPositionWeightedAggregates(squadPlayers, { minMin = 5 } = {}) {
  const eligible = squadPlayers.filter(p => p.min_pg != null && p.min_pg >= minMin)
  const groups = { Guard: [], Forward: [], Big: [] }
  for (const p of eligible) {
    const g = broadPositionGroup(p.pos_type)
    if (g && groups[g]) groups[g].push(p)
  }

  const result = {}
  for (const [group, ps] of Object.entries(groups)) {
    if (!ps.length) continue
    const enriched = ps.map(p => ({
      ...p,
      _height_in:  parseHeightIn(p.height),
      _exp:        classYearNum(p.class_yr),
    }))
    result[group] = {
      n:              ps.length,
      totalMinPg:     +ps.reduce((s, p) => s + (p.min_pg ?? 0), 0).toFixed(1),
      avgHeightIn:    weightedAvg(enriched, '_height_in') != null ? +weightedAvg(enriched, '_height_in').toFixed(1) : null,
      avgWeightLbs:   weightedAvg(ps, 'weight_lbs')       != null ? +weightedAvg(ps, 'weight_lbs').toFixed(1)       : null,
      avgExperience:  weightedAvg(enriched, '_exp')       != null ? +weightedAvg(enriched, '_exp').toFixed(2)       : null,
      avgPts:         weightedAvg(ps, 'pts')   != null ? +weightedAvg(ps, 'pts').toFixed(1)   : null,
      avgOrtg:        weightedAvg(ps, 'ortg')  != null ? +weightedAvg(ps, 'ortg').toFixed(1)  : null,
      avgDrtg:        weightedAvg(ps, 'drtg')  != null ? +weightedAvg(ps, 'drtg').toFixed(1)  : null,
      avgEfg:         weightedAvg(ps, 'efg')   != null ? +weightedAvg(ps, 'efg').toFixed(1)   : null,
      avgBpm:         weightedAvg(ps, 'bpm')   != null ? +weightedAvg(ps, 'bpm').toFixed(2)   : null,
      avgUsg:         weightedAvg(ps, 'usg')   != null ? +weightedAvg(ps, 'usg').toFixed(1)   : null,
      missingHeight:  enriched.filter(p => p._height_in == null).length,
      players:        ps,
    }
  }
  return result
}

// Compare two squads at the position level — returns array of position diffs
export function comparePositionProfiles(squadA, squadB, { minMin = 5 } = {}) {
  const aggA = buildPositionWeightedAggregates(squadA, { minMin })
  const aggB = buildPositionWeightedAggregates(squadB, { minMin })
  return ['Guard', 'Forward', 'Big'].map(pos => ({
    position:       pos,
    teamA:          aggA[pos] ?? null,
    teamB:          aggB[pos] ?? null,
    diffHeightIn:   aggA[pos]?.avgHeightIn != null && aggB[pos]?.avgHeightIn != null
                      ? +(aggA[pos].avgHeightIn - aggB[pos].avgHeightIn).toFixed(1) : null,
    diffExperience: aggA[pos]?.avgExperience != null && aggB[pos]?.avgExperience != null
                      ? +(aggA[pos].avgExperience - aggB[pos].avgExperience).toFixed(2) : null,
    diffOrtg:       aggA[pos]?.avgOrtg != null && aggB[pos]?.avgOrtg != null
                      ? +(aggA[pos].avgOrtg - aggB[pos].avgOrtg).toFixed(1) : null,
    diffBpm:        aggA[pos]?.avgBpm != null && aggB[pos]?.avgBpm != null
                      ? +(aggA[pos].avgBpm - aggB[pos].avgBpm).toFixed(2) : null,
  }))
}

// Updated roster aggregates using playing-time weighted averages.
// Includes overall roster metrics AND position-level (Guard/Forward/Big) averages
// so that any of these can be used as X-axis inputs in the Roster & Bio scatter.
export function buildRosterAggregatesWeighted(players) {
  const byKey = {}
  for (const p of players) {
    if (!p.min_pg || p.min_pg < 6) continue
    const k = `${p.school}||${p.year}`
    if (!byKey[k]) byKey[k] = { school: p.school, year: p.year, ps: [] }
    byKey[k].ps.push(p)
  }

  return Object.values(byKey).map(({ school, year, ps }) => {
    const enriched = ps.map(p => ({
      ...p,
      _height_in: parseHeightIn(p.height),
      _exp:       classYearNum(p.class_yr),
    }))
    const wHt  = weightedAvg(enriched, '_height_in')
    const wExp = weightedAvg(enriched, '_exp')
    const wWt  = weightedAvg(ps, 'weight_lbs')
    const n = ps.length
    const totalMinPg = ps.reduce((s, p) => s + (p.min_pg ?? 0), 0)

    const guards   = enriched.filter(p => broadPositionGroup(p.pos_type) === 'Guard')
    const forwards = enriched.filter(p => broadPositionGroup(p.pos_type) === 'Forward')
    const bigs     = enriched.filter(p => broadPositionGroup(p.pos_type) === 'Big')

    const minShare = (group) => {
      const mins = group.reduce((s, p) => s + (p.min_pg ?? 0), 0)
      return totalMinPg > 0 ? +(mins / totalMinPg * 100).toFixed(1) : null
    }
    const pa = (group, key) => {
      const v = weightedAvg(group, key)
      return v != null ? +v.toFixed(2) : null
    }

    return {
      school, year, n,
      // Overall
      avg_height_in:  wHt  != null ? +wHt.toFixed(1)  : null,
      avg_weight_lbs: wWt  != null ? +wWt.toFixed(1)  : null,
      avg_experience: wExp != null ? +wExp.toFixed(2)  : null,
      pct_guards:     +(guards.length   / n * 100).toFixed(1),
      pct_forwards:   +(forwards.length / n * 100).toFixed(1),
      pct_bigs:       +(bigs.length     / n * 100).toFixed(1),
      missing_height: enriched.filter(p => p._height_in == null).length,
      // Guard position averages
      guard_avg_height: pa(guards, '_height_in'),
      guard_avg_weight: pa(guards, 'weight_lbs'),
      guard_avg_exp:    pa(guards, '_exp'),
      guard_avg_ortg:   pa(guards, 'ortg'),
      guard_avg_bpm:    pa(guards, 'bpm'),
      guard_min_share:  minShare(guards),
      // Forward position averages
      fwd_avg_height:   pa(forwards, '_height_in'),
      fwd_avg_weight:   pa(forwards, 'weight_lbs'),
      fwd_avg_exp:      pa(forwards, '_exp'),
      fwd_avg_ortg:     pa(forwards, 'ortg'),
      fwd_avg_bpm:      pa(forwards, 'bpm'),
      fwd_min_share:    minShare(forwards),
      // Big/Center position averages
      big_avg_height:   pa(bigs, '_height_in'),
      big_avg_weight:   pa(bigs, 'weight_lbs'),
      big_avg_exp:      pa(bigs, '_exp'),
      big_avg_ortg:     pa(bigs, 'ortg'),
      big_avg_bpm:      pa(bigs, 'bpm'),
      big_min_share:    minShare(bigs),
    }
  })
}

// For each unique cross-school pairing in the same year, compute physical and performance diffs.
// Returns array of { schoolA, schoolB, year, heightDiff, expDiff, winPctDiff, netEffDiff }
// Useful for "does height advantage predict winning?" scatter analysis.
export function buildPhysicalMatchupPairs(teamSeasons, rosterAggs) {
  const pairs = []
  const years = [...new Set(rosterAggs.map(a => a.year))]
  for (const year of years) {
    const aggsThisYear = rosterAggs.filter(a => a.year === year)
    for (let i = 0; i < aggsThisYear.length; i++) {
      for (let j = i + 1; j < aggsThisYear.length; j++) {
        const aggA = aggsThisYear[i]
        const aggB = aggsThisYear[j]
        if (aggA.avg_height_in == null || aggB.avg_height_in == null) continue
        const sA = teamSeasons.find(s => s.school === aggA.school && s.year === year)
        const sB = teamSeasons.find(s => s.school === aggB.school && s.year === year)
        if (!sA || !sB) continue
        pairs.push({
          schoolA: aggA.school, schoolB: aggB.school, year,
          heightDiff:  +(aggA.avg_height_in  - aggB.avg_height_in).toFixed(1),
          expDiff:     aggA.avg_experience != null && aggB.avg_experience != null
                         ? +(aggA.avg_experience - aggB.avg_experience).toFixed(2) : null,
          winPctDiff:  +(sA.win_pct - sB.win_pct).toFixed(3),
          netEffDiff:  +(sA.net_efficiency - sB.net_efficiency).toFixed(2),
        })
      }
    }
  }
  return pairs
}

// Data quality check for a specific team-season
export function dataQualityCheck(players, school, year) {
  const squad = players.filter(p => p.school === school && p.year === year)
  const qualified = squad.filter(p => p.min_pg >= 6)
  const warnings = []
  if (squad.length < 6) warnings.push(`Only ${squad.length} player records found`)
  const missingHt = squad.filter(p => !p.height || parseHeightIn(p.height) == null)
  if (missingHt.length > 0) warnings.push(`${missingHt.length} player(s) missing height`)
  const missingPos = squad.filter(p => !p.pos_type)
  if (missingPos.length > 0) warnings.push(`${missingPos.length} player(s) missing position`)
  if (qualified.length < 5) warnings.push(`Only ${qualified.length} players with ≥ 6 min/g`)
  return { totalPlayers: squad.length, qualifiedPlayers: qualified.length, warnings, hasWarnings: warnings.length > 0 }
}

// Generate a short player role summary based on stats
export function generatePlayerRoleSummary(player) {
  if (!player) return 'Unknown'
  const roles = []
  if (player.usg >= 24)            roles.push('primary scorer')
  else if (player.usg >= 18)       roles.push('featured scorer')
  else                              roles.push('complementary player')
  if (player.ast_pct >= 22)        roles.push('facilitator')
  if (player.or_pct >= 10)         roles.push('offensive rebounder')
  if (player.treb >= 7)            roles.push('dominant rebounder')
  if (player.blk >= 1.2)           roles.push('shot-blocker')
  if (player.stl >= 1.5)           roles.push('disruptor')
  if (player.efg >= 55 && player.usg < 18) roles.push('efficient spot-up')
  const pos = broadPositionGroup(player.pos_type) ?? 'player'
  return roles.slice(0, 2).join(', ') + ' ' + pos.toLowerCase()
}

// Generate actionable practice insights based on matchup data
export function generateMatchupInsights(seasonA, seasonB, posCompare, schemeA, schemeB, nameA = 'Team A', nameB = 'Team B') {
  const insights = []
  if (!seasonA || !seasonB) return insights

  // Pace/tempo insights
  const tempoDiff = (seasonA.tempo ?? 0) - (seasonB.tempo ?? 0)
  if (Math.abs(tempoDiff) >= 3) {
    const faster = tempoDiff > 0 ? nameA : nameB
    const slower = tempoDiff > 0 ? nameB : nameA
    insights.push({
      category: 'Pace',
      icon: '⚡',
      text: `${faster} plays ${Math.abs(tempoDiff).toFixed(1)} possessions/40 faster. ${slower} should focus on half-court set execution and avoiding sloppy transition defense. ${faster} should push in transition before the defense sets.`,
    })
  }

  // eFG% matchup
  const efgDiff = (seasonA.efg_o ?? 0) - (seasonB.efg_d ?? 0)
  if (efgDiff > 2) {
    insights.push({
      category: 'Shooting',
      icon: '🎯',
      text: `${nameA}'s offense shoots ${efgDiff.toFixed(1)} eFG points above what ${nameB}'s defense typically allows. Expect ${nameA} to create open looks — ${nameB} must contest hard off ball screens.`,
    })
  } else if (efgDiff < -2) {
    insights.push({
      category: 'Shooting',
      icon: '🛡',
      text: `${nameB}'s defense holds opponents ${Math.abs(efgDiff).toFixed(1)} eFG points below ${nameA}'s average. ${nameA} should run high-volume attack to get to the free throw line and manufacture easy looks.`,
    })
  }

  // Rebounding edge
  if ((seasonA.orb ?? 0) - (seasonB.drb ?? 0) > 5) {
    insights.push({
      category: 'Rebounding',
      icon: '💪',
      text: `${nameA} has a significant offensive rebounding advantage. ${nameB} must commit all five players to blocking out, even sacrificing fast-break opportunities after misses.`,
    })
  } else if ((seasonB.orb ?? 0) - (seasonA.drb ?? 0) > 5) {
    insights.push({
      category: 'Rebounding',
      icon: '💪',
      text: `${nameB} crashes the offensive glass aggressively. ${nameA} must box out with discipline and not allow second-chance opportunities.`,
    })
  }

  // Turnover pressure
  if ((seasonB.tov_d ?? 0) >= 28) {
    insights.push({
      category: 'Ball Security',
      icon: '⚠️',
      text: `${nameB} forces turnovers at a high rate (${seasonB.tov_d?.toFixed(1)}% TOV%). ${nameA} should use simple ball-movement patterns, avoid dribbling into pressure, and practice live-ball turnover scenarios.`,
    })
  }

  // Physical matchup
  if (posCompare?.length) {
    const bigDiff = posCompare.find(p => p.position === 'Big')
    if (bigDiff?.diffHeightIn != null && Math.abs(bigDiff.diffHeightIn) >= 1.5) {
      const taller  = bigDiff.diffHeightIn > 0 ? nameA : nameB
      const shorter = bigDiff.diffHeightIn > 0 ? nameB : nameA
      insights.push({
        category: 'Interior Matchup',
        icon: '🏀',
        text: `${taller}'s bigs are ${Math.abs(bigDiff.diffHeightIn).toFixed(1)}" taller on average. ${shorter} should avoid straight-line post feeds and use dribble-drive penetration to take advantage in space.`,
      })
    }
    const guardDiff = posCompare.find(p => p.position === 'Guard')
    if (guardDiff?.diffExperience != null && Math.abs(guardDiff.diffExperience) >= 0.8) {
      const moreExp = guardDiff.diffExperience > 0 ? nameA : nameB
      insights.push({
        category: 'Guard Experience',
        icon: '🧠',
        text: `${moreExp}'s backcourt has a meaningful experience edge. Expect better late-game execution, pick-and-roll decisions, and clock management from ${moreExp}.`,
      })
    }
  }

  // Scheme-based insights
  if (schemeA === 'Run & Gun' || schemeA === 'Transition Attack') {
    insights.push({
      category: 'Opponent Scheme',
      icon: '🔄',
      text: `${nameA} runs an up-tempo system. ${nameB} should get back on defense immediately after shot attempts and call timeouts to slow momentum runs.`,
    })
  }
  if (schemeB === 'High Pressure') {
    insights.push({
      category: 'Opponent Scheme',
      icon: '🔄',
      text: `${nameB} employs high-pressure defense. ${nameA} should use ball screens to attack the pressure, keep dribbles alive, and designate a ball-handler for half-court entry resets.`,
    })
  }

  return insights.slice(0, 5)
}

// Numeric combine target ranges keyed to match NBA_COMBINE_TARGETS in PlayerLab.
// Used by generateTrainingPlan to compute gap severities and re-prioritise modules.
const _COMBINE_GAP_DEFS = {
  Guard: {
    max_vert:     { targetMin: 33.5, targetMax: 38.5, higherBetter: true,  planArea: 'Lower Body Power' },
    no_step_vert: { targetMin: 28.0, targetMax: 33.0, higherBetter: true,  planArea: 'Lower Body Power' },
    lane_agility: { targetMin: 10.75,targetMax: 11.3,  higherBetter: false, planArea: 'Lateral Agility & Change of Direction' },
    sprint_34:    { targetMin: 3.10, targetMax: 3.30,  higherBetter: false, planArea: 'Linear Speed' },
    weight:       { targetMin: 185,  targetMax: 200,   higherBetter: null,  planArea: 'Lean Mass & Strength Base' },
    bench_reps:   { targetMin: 5,    targetMax: 12,    higherBetter: true,  planArea: 'Lean Mass & Strength Base' },
    body_fat_pct: { targetMin: 5.0,  targetMax: 10.0,  higherBetter: false, planArea: 'Lean Mass & Strength Base' },
  },
  Forward: {
    max_vert:     { targetMin: 33.5, targetMax: 38.5, higherBetter: true,  planArea: 'Lower Body Power' },
    no_step_vert: { targetMin: 27.0, targetMax: 32.5, higherBetter: true,  planArea: 'Lower Body Power' },
    lane_agility: { targetMin: 10.9, targetMax: 11.6,  higherBetter: false, planArea: 'Multi-Directional Agility' },
    sprint_34:    { targetMin: 3.20, targetMax: 3.40,  higherBetter: false, planArea: 'Linear Speed' },
    weight:       { targetMin: 210,  targetMax: 230,   higherBetter: null,  planArea: 'Upper Body Strength' },
    bench_reps:   { targetMin: 6,    targetMax: 14,    higherBetter: true,  planArea: 'Upper Body Strength' },
    body_fat_pct: { targetMin: 6.5,  targetMax: 11.0,  higherBetter: false, planArea: 'Upper Body Strength' },
  },
  Big: {
    max_vert:     { targetMin: 29.5, targetMax: 36.0, higherBetter: true,  planArea: 'Lower Body Power' },
    no_step_vert: { targetMin: 25.0, targetMax: 30.5, higherBetter: true,  planArea: 'Lower Body Power' },
    lane_agility: { targetMin: 11.3, targetMax: 12.2,  higherBetter: false, planArea: 'Hip Mobility & Foot Speed' },
    sprint_34:    { targetMin: 3.30, targetMax: 3.55,  higherBetter: false, planArea: 'Lower Body Power' },
    weight:       { targetMin: 230,  targetMax: 260,   higherBetter: null,  planArea: 'Upper Body Strength & Mass' },
    bench_reps:   { targetMin: 10,   targetMax: 18,    higherBetter: true,  planArea: 'Upper Body Strength & Mass' },
    body_fat_pct: { targetMin: 7.5,  targetMax: 14.0,  higherBetter: false, planArea: 'Upper Body Strength & Mass' },
  },
}

const _PRIORITY_RANK = { Critical: 0, High: 1, Medium: 2, Maintenance: 3 }

// Strength & Conditioning training plan — position-based with optional combine-input
// gap analysis. Pass combineInputs = { max_vert: '31', lane_agility: '11.6', ... }
// to re-prioritise and re-order modules based on measured gaps to NBA targets.
export function generateTrainingPlan(player, combineInputs = {}) {
  if (!player) return []
  const pos = broadPositionGroup(player.pos_type)
  if (!pos) return []

  const plans = {
    Guard: [
      {
        area: 'Lower Body Power',
        phase: 'Power',
        priority: 'High',
        target: 'NBA combine target — max vertical: 33.0–38.5"',
        protocol: 'Depth jumps 4×5 @ 12" box · Box jumps 4×8 · Single-leg broad jump 3×5 each · Squat jumps 3×6 with 2s pause',
        frequency: '2–3×/week, minimum 48 h between sessions',
        rationale: 'First-step explosiveness and above-the-rim finishing are primary guard athleticism markers at the combine and beyond.',
      },
      {
        area: 'Linear Speed',
        phase: 'Speed',
        priority: 'High',
        target: 'NBA combine target — ¾ court sprint: 3.10–3.30 s',
        protocol: 'Resisted sprint starts (10–15% bodyweight sled) 5×20 m · Flying 10 m sprints 6× · Wicket runs (develop stride length) 4× · 40 m acceleration runs 4×',
        frequency: '2×/week, not on same day as heavy leg work',
        rationale: 'Transition speed and pull-away ability separate finishers. Sub-3.20 sprint is the threshold scouts flag.',
      },
      {
        area: 'Lateral Agility & Change of Direction',
        phase: 'Agility',
        priority: 'High',
        target: 'NBA combine target — lane agility: 10.7–11.3 s',
        protocol: '5-10-5 shuttle 6 reps · L-drill 6 reps · Band-resisted defensive slides 3×20 m · Hip-width stance reactive COD drills with visual cue · Lateral hurdle hops 3×8',
        frequency: '2×/week',
        rationale: 'Lane agility is the single most-tested guard metric at the combine. Sub-11.0 is elite, 11.3+ raises questions about switchability.',
      },
      {
        area: 'Lean Mass & Strength Base',
        phase: 'Strength',
        priority: 'Medium',
        target: 'NBA combine target — weight: 180–205 lbs',
        protocol: 'Back squat 4×5 @ 75–85% 1RM · Romanian deadlift 3×8 · DB bench press 4×8 · Weighted pull-ups 4×6 · Cable row 3×10. Caloric surplus 200–300 kcal/day, 1 g protein/lb bodyweight.',
        frequency: '3×/week (push/pull/legs split)',
        rationale: 'Guards need enough mass to absorb contact at the rim without sacrificing quickness. Lean mass — not bulk — is the goal.',
      },
      {
        area: 'Core & Rotational Stability',
        phase: 'Foundation',
        priority: 'Medium',
        target: 'Functional: deceleration control and finishing through contact',
        protocol: 'Anti-rotation Pallof press 3×12 each · Med ball scoop toss 3×8 · Single-leg RDL with reach 3×10 · Dead bug 3×10 · Copenhagen adductor plank 3×20 s',
        frequency: '3×/week (can be attached to any session)',
        rationale: 'Core stability is the foundation for all explosive actions and protects the lumbar spine through a full college season.',
      },
      {
        area: 'Basketball Conditioning',
        phase: 'Conditioning',
        priority: 'Maintenance',
        target: 'Anaerobic capacity: repeat-sprint ability across 40 min',
        protocol: '6–8×150 m @ 90% effort, 90 s rest · 4×4 intervals (4 min at 85% HRmax, 3 min walk) 2×/week · Cardiac output work: 30 min continuous @ 65% HRmax on off days',
        frequency: '3–4×/week at varying intensities',
        rationale: 'Guards cover 3–4 miles per game. Aerobic base determines recovery speed between high-intensity possessions.',
      },
    ],
    Forward: [
      {
        area: 'Lower Body Power',
        phase: 'Power',
        priority: 'High',
        target: 'NBA combine target — max vertical: 33.5–38.0"',
        protocol: 'Hang clean 4×4 @ 70% 1RM · Depth jump to box jump 4×4 · Broad jump 3×5 · Single-leg reactive bounding 3×8 each side · Nordic hamstring curl 3×6',
        frequency: '2×/week; Olympic lifting requires full recovery between sessions',
        rationale: 'Wings need vertical to contest shots at the arc, finish above bigs, and secure defensive rebounds. The hang clean directly develops the posterior chain explosiveness the combine tests.',
      },
      {
        area: 'Upper Body Strength',
        phase: 'Strength',
        priority: 'High',
        target: 'NBA combine target — weight: 205–230 lbs',
        protocol: 'Bench press 4×5 @ 80% 1RM · Incline DB press 3×8 · Weighted pull-up 4×6 · Barbell row 4×6 · Landmine press 3×10. Caloric surplus with 1 g protein/lb bodyweight.',
        frequency: '3×/week (upper / lower / full split)',
        rationale: 'Wings battle physically at the 3-point line and in the post on mismatches. Upper body mass lets them hold position without fouling.',
      },
      {
        area: 'Multi-Directional Agility',
        phase: 'Agility',
        priority: 'High',
        target: 'NBA combine target — lane agility: 10.9–11.5 s',
        protocol: 'T-drill 6 reps · 5-10-5 shuttle 6 reps · Sprint-stop-shuffle reaction drill 4×30 s · Lateral squat walks 3×12 each · Reactive drop-step with visual cue 3×8 each',
        frequency: '2×/week',
        rationale: 'Modern wings must guard 1–4. Multi-directional quickness determines which assignments a player can handle at the next level.',
      },
      {
        area: 'Functional Mobility',
        phase: 'Foundation',
        priority: 'Medium',
        target: 'Operational: maximize functional wingspan and shoulder range',
        protocol: 'Thoracic spine rotation 2×10 each · 90/90 hip mobility 2×60 s each · Band shoulder dislocates 2×15 · Wall slides 2×12 · Ankle dorsiflexion drill 2×30 s each',
        frequency: 'Daily — 10–15 min, ideally pre-session',
        rationale: "Wingspan can't be changed, but mobility determines how effectively you use it. Shoulder and thoracic mobility directly affects shot contest range.",
      },
      {
        area: 'Linear Speed',
        phase: 'Speed',
        priority: 'Medium',
        target: 'NBA combine target — ¾ court sprint: 3.20–3.40 s',
        protocol: 'Acceleration runs 4×20 m · Flying 10 m 5× · Sprint-backpedal-sprint 5×40 m total · Transition closeout sprints 4×8',
        frequency: '2×/week',
        rationale: 'Transition speed determines wing ability to get out in fast breaks and recover on closeouts — two of the highest-leverage plays for wings.',
      },
      {
        area: 'Basketball Conditioning',
        phase: 'Conditioning',
        priority: 'Maintenance',
        target: 'Mixed aerobic-anaerobic capacity for 35+ minute wings',
        protocol: '5×250 m @ 85% effort, 90 s rest · Court shuttle series 3×4 lengths · 3:2 ratio interval work (3 min hard : 2 min recovery) for 20 min · Full-court transition reps with coach',
        frequency: '3–4×/week',
        rationale: 'Wings play the most diverse energy demands — long closeout sprints, defensive rotations, fast breaks. Mixed conditioning reflects real game physiology.',
      },
    ],
    Big: [
      {
        area: 'Upper Body Strength & Mass',
        phase: 'Strength',
        priority: 'High',
        target: 'NBA combine target — weight: 225–260 lbs',
        protocol: 'Bench press 5×5 @ 80–85% 1RM · Weighted dips 4×8 · DB row 4×8 each · Barbell shrug 3×10 · Face pull 3×15. Caloric surplus 400–600 kcal/day, 1 g protein/lb bodyweight.',
        frequency: '3×/week upper sessions; incorporate bench press into every upper day',
        rationale: 'NBA combine bench press tests 185 lb max reps. Interior players need mass to hold position on post-ups and avoid getting bodied off the block.',
      },
      {
        area: 'Lower Body Power',
        phase: 'Power',
        priority: 'High',
        target: 'NBA combine target — max vertical: 30.5–36.0"',
        protocol: 'Power clean 4×3 @ 70% 1RM · Jump squat 3×5 (30% bodyweight) · Step-up to knee drive 3×8 each · Trap bar deadlift 4×4 · Calf raise complex (slow/fast) 4×15',
        frequency: '2×/week; separate from heavy squat sessions',
        rationale: 'Vertical leap determines shot-blocking reach and rebounding positioning. Every inch above the rim matters. Power cleans develop the hip extension pattern directly.',
      },
      {
        area: 'Hip Mobility & Foot Speed',
        phase: 'Foundation',
        priority: 'High',
        target: 'NBA combine target — lane agility: 11.3–12.0 s',
        protocol: '90/90 hip stretches 3×60 s each · Lateral hurdle steps 3×10 each · Defensive stance slides 3×20 m · Ladder drills — in/out, icky shuffle 3× · Hip circle warm-up daily',
        frequency: 'Daily mobility; agility drills 2×/week',
        rationale: "Foot speed is the most underrated big-man trait. Drop coverage and hedge recovery depend on first-step quickness from an upright position. Tight hips kill bigs' lateral mobility.",
      },
      {
        area: 'Lower Body Strength Foundation',
        phase: 'Strength',
        priority: 'High',
        target: 'Functional: posterior chain strength for interior contact and rebounds',
        protocol: 'Back squat 4×4 @ 80–85% 1RM · Romanian deadlift 4×6 · Bulgarian split squat 3×8 each · Leg press 3×10 · Seated leg curl 3×12',
        frequency: '2×/week lower sessions',
        rationale: 'Bigs absorb and generate force through the hips constantly — posting up, setting screens, rebounding. Squat strength directly correlates with interior effectiveness.',
      },
      {
        area: 'Core & Stabilization',
        phase: 'Foundation',
        priority: 'Medium',
        target: 'Functional: balance and force transfer in contact situations',
        protocol: 'Farmer carry 4×30 m · Single-leg RDL 3×8 each · Suitcase carry 3×20 m each · Pallof press 3×12 · Half-kneeling cable chop 3×10 each',
        frequency: '3×/week',
        rationale: "Core stability for bigs is about resisting force, not generating it. The farmer carry and loaded carries are the most sport-specific core training for interior players.",
      },
      {
        area: 'Basketball Conditioning',
        phase: 'Conditioning',
        priority: 'Maintenance',
        target: 'Aerobic base: sustain effort across 28–35 min at center',
        protocol: '4×200 m @ 80% effort, 2 min rest · Half-court shuffle series 4×10 trips · Aerobic base: 25 min continuous bike @ 65% HRmax · Transition sprint-walk intervals 6×half court',
        frequency: '3×/week; aerobic work on off/recovery days',
        rationale: 'Bigs run less total distance but at higher intensities on key plays. A strong aerobic base accelerates recovery between those high-intensity bursts (screens, sprints to rim).',
      },
    ],
  }

  const base = plans[pos] ?? []

  // No inputs — return static plan unchanged
  if (Object.keys(combineInputs).length === 0) return base

  // Compute worst gap per plan area from the entered combine values
  const posGapDefs = _COMBINE_GAP_DEFS[pos] ?? {}
  const areaGap = {}
  for (const [key, rawVal] of Object.entries(combineInputs)) {
    if (rawVal === '' || rawVal == null) continue
    const v = parseFloat(rawVal)
    if (isNaN(v)) continue
    const def = posGapDefs[key]
    if (!def) continue
    const range = def.targetMax - def.targetMin
    if (range === 0) continue
    let severity = 0
    if (def.higherBetter === true) {
      if (v < def.targetMin)      severity = (def.targetMin - v) / range
      else if (v > def.targetMax) severity = -(v - def.targetMax) / range
    } else if (def.higherBetter === false) {
      if (v > def.targetMax)      severity = (v - def.targetMax) / range
      else if (v < def.targetMin) severity = -(def.targetMin - v) / range
    }
    if (areaGap[def.planArea] == null || severity > areaGap[def.planArea].severity) {
      areaGap[def.planArea] = { severity, metric: key, value: v }
    }
  }

  return base.map(rec => {
    const gap = areaGap[rec.area]
    let effectivePriority = rec.priority
    let gapNote = null
    const gapSeverity = gap?.severity ?? 0
    if (gap != null) {
      if (gap.severity > 1.5) {
        effectivePriority = 'Critical'
        gapNote = 'Significantly below combine target — highest priority'
      } else if (gap.severity > 0.5) {
        if ((_PRIORITY_RANK[effectivePriority] ?? 4) > _PRIORITY_RANK.High) effectivePriority = 'High'
        gapNote = 'Below combine target — focus area'
      } else if (gap.severity > 0.05) {
        gapNote = 'Approaching combine target — keep pushing'
      } else if (gap.severity < -0.3) {
        if (effectivePriority === 'High') effectivePriority = 'Medium'
        gapNote = 'Above combine target — maintain and redistribute effort'
      }
    }
    return { ...rec, effectivePriority, gapNote, gapSeverity }
  }).sort((a, b) => {
    const ra = _PRIORITY_RANK[a.effectivePriority] ?? 4
    const rb = _PRIORITY_RANK[b.effectivePriority] ?? 4
    if (ra !== rb) return ra - rb
    return (b.gapSeverity ?? 0) - (a.gapSeverity ?? 0)
  })
}

// ── NBA Prospect Comparison ───────────────────────────────────────────────────

// Find NBA prospects from combine data whose position + height closely match an Ivy player.
// maxHeightDiff: how many inches away is acceptable (default 2")
// Returns array sorted by height proximity then draft pick.
export function findNBAComparables(player, nbaCombine, { maxHeightDiff = 2, n = 5 } = {}) {
  const heightIn = parseHeightIn(player.height)
  const pos = broadPositionGroup(player.pos_type)
  if (!heightIn || !pos) return []

  return nbaCombine
    .filter(p =>
      p.pos_group === pos &&
      Math.abs(p.height_in - heightIn) <= maxHeightDiff
    )
    .map(p => ({ ...p, heightDiff: Math.abs(p.height_in - heightIn) }))
    .sort((a, b) => a.heightDiff - b.heightDiff || a.draft_pick - b.draft_pick)
    .slice(0, n)
}

// Compute height percentile for a player within their position group's NBA draft class.
// Returns 0–100 (100 = tallest).
export function computeNBAHeightPercentile(heightIn, posGroup, nbaCombine) {
  const pool = nbaCombine.filter(p => p.pos_group === posGroup && p.height_in != null)
  if (!pool.length) return null
  const below = pool.filter(p => p.height_in <= heightIn).length
  return Math.round((below / pool.length) * 100)
}

// Aggregate college benchmarks for NBA prospects of a given position who played in US college.
// Returns averages + percentile function for each stat.
export function computeNBACollegeBenchmarks(posGroup, nbaCombine) {
  const pool = nbaCombine.filter(p =>
    p.pos_group === posGroup &&
    p.college != null &&
    p.college_ts_pct != null
  )
  if (pool.length < 3) return null

  function avg(key) {
    const valid = pool.filter(p => p[key] != null)
    return valid.length ? valid.reduce((s, p) => s + p[key], 0) / valid.length : null
  }

  function pctile(value, key) {
    const valid = pool.filter(p => p[key] != null)
    if (!valid.length || value == null) return null
    const below = valid.filter(p => p[key] <= value).length
    return Math.round((below / valid.length) * 100)
  }

  return {
    n: pool.length,
    avgPpg:    avg('college_ppg'),
    avgEfg:    avg('college_efg_pct'),
    avgTs:     avg('college_ts_pct'),
    avgUsg:    avg('college_usg_pct'),
    pctilePpg: (v) => pctile(v, 'college_ppg'),
    pctileEfg: (v) => pctile(v, 'college_efg_pct'),
    pctileTs:  (v) => pctile(v, 'college_ts_pct'),
    pctileUsg: (v) => pctile(v, 'college_usg_pct'),
    pool,
  }
}

// ── Multiple Linear Regression (OLS via normal equations + partial-pivot Gaussian elimination) ──
// X: n×p array of row vectors (include intercept column of 1s as first col)
// y: n-length array of outcomes
// Returns { beta: p-length coefficient array, r2: number }
function _mlr(X, y) {
  const n = X.length, p = X[0].length
  // Build X'X (p×p) and X'y (p×1)
  const XtX = Array.from({ length: p }, () => Array(p).fill(0))
  const Xty = Array(p).fill(0)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) {
      Xty[j] += X[i][j] * y[i]
      for (let k = 0; k < p; k++) XtX[j][k] += X[i][j] * X[i][k]
    }
  }
  // Augmented matrix [XtX | Xty], solve via Gauss-Jordan
  const aug = XtX.map((row, i) => [...row, Xty[i]])
  for (let col = 0; col < p; col++) {
    let maxRow = col
    for (let r = col + 1; r < p; r++)
      if (Math.abs(aug[r][col]) > Math.abs(aug[maxRow][col])) maxRow = r
    ;[aug[col], aug[maxRow]] = [aug[maxRow], aug[col]]
    const piv = aug[col][col]
    if (Math.abs(piv) < 1e-10) continue
    for (let j = col; j <= p; j++) aug[col][j] /= piv
    for (let r = 0; r < p; r++) {
      if (r === col) continue
      const f = aug[r][col]
      for (let j = col; j <= p; j++) aug[r][j] -= f * aug[col][j]
    }
  }
  const beta = aug.map(row => row[p])
  const yHat = X.map(row => row.reduce((s, x, j) => s + x * beta[j], 0))
  const yMean = y.reduce((s, v) => s + v, 0) / n
  const ssTot = y.reduce((s, v) => s + (v - yMean) ** 2, 0)
  const ssRes = y.reduce((s, v, i) => s + (v - yHat[i]) ** 2, 0)
  return { beta, r2: ssTot === 0 ? 0 : +(1 - ssRes / ssTot).toFixed(4) }
}

// ── Team Archetype Classification ────────────────────────────────────────────
// Classifies a team-season into a roster-composition archetype based on
// playing-time distribution and physical profile (min 5 mpg threshold).
// Priority: Star-Driven → Guard-Heavy → Big-Dominant → Wing-Oriented → Balanced
export const ARCHETYPES = ['Guard-Heavy', 'Big-Dominant', 'Wing-Oriented', 'Star-Driven', 'Balanced']

export function computeTeamArchetype(squad, season) {
  const eligible = squad.filter(p => p.min_pg != null && p.min_pg >= 5)
  const totalMin = eligible.reduce((s, p) => s + p.min_pg, 0)
  if (totalMin === 0) return { archetype: 'Balanced', signals: ['No qualifying minutes data'] }

  const minByPos = { Guard: 0, Forward: 0, Big: 0 }
  for (const p of eligible) {
    const g = broadPositionGroup(p.pos_type)
    if (g) minByPos[g] += p.min_pg
  }
  const guardPct   = minByPos.Guard   / totalMin * 100
  const fwdPct     = minByPos.Forward / totalMin * 100
  const bigPct     = minByPos.Big     / totalMin * 100

  const topUsg     = Math.max(0, ...eligible.map(p => p.usg ?? 0))
  const bigs       = eligible.filter(p => broadPositionGroup(p.pos_type) === 'Big')
  const avgBigWt   = weightedAvg(bigs, 'weight_lbs') ?? 0

  if (topUsg > 27)
    return { archetype: 'Star-Driven',    signals: [`Top usage: ${topUsg.toFixed(0)}%`] }
  if (guardPct > 50)
    return { archetype: 'Guard-Heavy',    signals: [`Guards: ${guardPct.toFixed(0)}% of min`] }
  if (bigPct > 30 && avgBigWt > 220)
    return { archetype: 'Big-Dominant',   signals: [`Bigs: ${bigPct.toFixed(0)}% of min · avg ${avgBigWt.toFixed(0)} lbs`] }
  if (fwdPct > 40)
    return { archetype: 'Wing-Oriented',  signals: [`Forwards: ${fwdPct.toFixed(0)}% of min`] }
  return { archetype: 'Balanced',
    signals: [`G/F/B: ${guardPct.toFixed(0)}/${fwdPct.toFixed(0)}/${bigPct.toFixed(0)}%`] }
}

// ── Scheme Classification from Roster Composition ────────────────────────────
// Predicts offensive + defensive scheme using roster composition (playing time,
// position distribution, physical profile) combined with season stats.
// Offensive priority: Transition → Pace&Space → Post-Up → Princeton → ISO → Pick&Roll → Motion
// Defensive priority: Pressure → Rim Protection → Coverage → Standard
export function classifySchemeFromRoster(season, squad) {
  if (!season) return { offScheme: 'Unknown', defScheme: 'Unknown', offSignals: [], defSignals: [] }

  const eligible   = squad.filter(p => p.min_pg != null && p.min_pg >= 5)
  const totalMin   = eligible.reduce((s, p) => s + p.min_pg, 0)
  const pct = (pos) => totalMin > 0
    ? eligible.filter(p => broadPositionGroup(p.pos_type) === pos).reduce((s, p) => s + p.min_pg, 0) / totalMin * 100
    : 0
  const guardPct = pct('Guard'), fwdPct = pct('Forward'), bigPct = pct('Big')

  const bigs      = eligible.filter(p => broadPositionGroup(p.pos_type) === 'Big')
  const avgBigWt  = weightedAvg(bigs, 'weight_lbs') ?? 0
  const topUsg    = Math.max(0, ...eligible.map(p => p.usg ?? 0))

  const { tempo, three_rate_o, tov_o, two_pct_o, stl_d, blk_d, efg_d, tov_d } = season

  let offScheme, offSignals
  if (tempo > 72) {
    offScheme  = 'Transition / Run & Gun'
    offSignals = [`Tempo ${tempo} (high Ivy tier)`, `Guards: ${guardPct.toFixed(0)}% of min`]
  } else if (three_rate_o > 43 && guardPct > 45 && tempo > 67) {
    offScheme  = 'Pace & Space'
    offSignals = [`3-pt rate: ${three_rate_o}%`, `Guards: ${guardPct.toFixed(0)}% of min`]
  } else if (bigPct > 30 && avgBigWt > 218 && three_rate_o < 36) {
    offScheme  = 'Post-Up / Inside-Out'
    offSignals = [`Bigs: ${bigPct.toFixed(0)}% of min · avg ${avgBigWt.toFixed(0)} lbs`, `3-pt rate: ${three_rate_o}% (low)`]
  } else if (tempo < 67 && tov_o < 19.5 && bigPct > 18) {
    offScheme  = 'Princeton Offense'
    offSignals = [`Tempo: ${tempo} (deliberate)`, `TOV%: ${tov_o} (low = ball security)`, `Bigs: ${bigPct.toFixed(0)}% of min`]
  } else if (topUsg > 27) {
    offScheme  = 'Isolation (ISO)'
    offSignals = [`Top player usage: ${topUsg.toFixed(0)}%`]
  } else if (guardPct > 42 && bigPct > 22 && two_pct_o > 50) {
    offScheme  = 'Pick & Roll'
    offSignals = [`Guards: ${guardPct.toFixed(0)}% · Bigs: ${bigPct.toFixed(0)}%`, `2pt%: ${two_pct_o} (rim pressure)`]
  } else {
    offScheme  = 'Motion Offense'
    offSignals = [`Balanced G/F/B: ${guardPct.toFixed(0)}/${fwdPct.toFixed(0)}/${bigPct.toFixed(0)}%`, `Tempo: ${tempo}`]
  }

  let defScheme, defSignals
  if (tov_d > 31) {
    defScheme  = 'Pressure / Full-Court Press'
    defSignals = [`TOV forced: ${tov_d}%`]
  } else if (blk_d > 11) {
    defScheme  = 'Rim Protection'
    defSignals = [`Block%: ${blk_d}%`]
  } else if (efg_d < 49.5) {
    defScheme  = 'Coverage'
    defSignals = [`eFG% allowed: ${efg_d}%`]
  } else {
    defScheme  = 'Man-to-Man / Standard'
    defSignals = ['Balanced defensive profile — no single dominant scheme signal']
  }

  return { offScheme, defScheme, offSignals, defSignals }
}

// ── Archetype Matchup Win-Rate Matrix ────────────────────────────────────────
// Counts wins/losses for every archetype-vs-archetype pairing across all
// Ivy vs Ivy games in the dataset. Uses both perspectives of each game.
export function computeArchetypeMatchupMatrix(teamSeasons, allPlayers, games) {
  const archetypeMap = {}
  for (const ts of teamSeasons) {
    const squad = allPlayers.filter(p => p.school === ts.school && p.year === ts.year)
    archetypeMap[`${ts.school}|${ts.year}`] = computeTeamArchetype(squad, ts).archetype
  }

  const matrix = {}
  for (const a of ARCHETYPES) {
    matrix[a] = {}
    for (const b of ARCHETYPES) matrix[a][b] = { wins: 0, games: 0 }
  }

  for (const game of games) {
    if (!game.ivy_game || game.pts_for == null) continue
    const atkType = archetypeMap[`${game.school}|${game.year}`]
    const defType = archetypeMap[`${game.opp_school}|${game.year}`]
    if (!atkType || !defType) continue
    matrix[atkType][defType].games++
    if (game.win) matrix[atkType][defType].wins++
  }

  const result = {}
  for (const a of ARCHETYPES) {
    result[a] = {}
    for (const b of ARCHETYPES) {
      const { wins, games } = matrix[a][b]
      result[a][b] = games > 0 ? { winRate: +(wins / games * 100).toFixed(1), games, wins } : null
    }
  }
  return { matrix: result, archetypeMap, archetypes: ARCHETYPES }
}

// ── Position-Level Physical Impact Regression ────────────────────────────────
// OLS: [guard_ht_diff, fwd_ht_diff, big_ht_diff, guard_wt_diff, fwd_wt_diff, big_wt_diff]
//       → point_differential
// Uses one perspective per game (school < opp_school) to avoid double-counting.
// Returns coefficients (pts per inch/lb of advantage), Pearson correlations per
// dimension, R², and n.
export function computePositionPhysicalImpact(games, allPlayers) {
  // Build position agg cache
  const aggCache = {}
  const getAgg = (school, year) => {
    const k = `${school}|${year}`
    if (!aggCache[k]) {
      const squad = allPlayers.filter(p => p.school === school && p.year === year && p.min_pg >= 5)
      aggCache[k] = buildPositionWeightedAggregates(squad)
    }
    return aggCache[k]
  }

  const rows = []
  for (const game of games) {
    if (!game.ivy_game || game.pts_for == null || game.school >= game.opp_school) continue
    const aggA = getAgg(game.school,     game.year)
    const aggB = getAgg(game.opp_school, game.year)

    const diff = (pos, key) => {
      const a = aggA[pos]?.[key], b = aggB[pos]?.[key]
      return (a != null && b != null) ? a - b : 0
    }

    rows.push({
      ptsDiff:     game.pts_for - game.pts_against,
      guardHtDiff: diff('Guard',   'avgHeightIn'),
      fwdHtDiff:   diff('Forward', 'avgHeightIn'),
      bigHtDiff:   diff('Big',     'avgHeightIn'),
      guardWtDiff: diff('Guard',   'avgWeightLbs'),
      fwdWtDiff:   diff('Forward', 'avgWeightLbs'),
      bigWtDiff:   diff('Big',     'avgWeightLbs'),
    })
  }

  if (rows.length < 10) return null

  const y = rows.map(r => r.ptsDiff)
  const X = rows.map(r => [
    1,
    r.guardHtDiff, r.fwdHtDiff, r.bigHtDiff,
    r.guardWtDiff, r.fwdWtDiff, r.bigWtDiff,
  ])

  const { beta, r2 } = _mlr(X, y)

  const corr = (key) => pearsonCorrelation(rows.map(r => r[key]), y)

  return {
    n: rows.length,
    r2,
    coefficients: {
      intercept:   +beta[0].toFixed(3),
      guardHeight: +beta[1].toFixed(3),
      fwdHeight:   +beta[2].toFixed(3),
      bigHeight:   +beta[3].toFixed(3),
      guardWeight: +beta[4].toFixed(3),
      fwdWeight:   +beta[5].toFixed(3),
      bigWeight:   +beta[6].toFixed(3),
    },
    pearson: {
      guardHeight: +corr('guardHtDiff').toFixed(3),
      fwdHeight:   +corr('fwdHtDiff').toFixed(3),
      bigHeight:   +corr('bigHtDiff').toFixed(3),
      guardWeight: +corr('guardWtDiff').toFixed(3),
      fwdWeight:   +corr('fwdWtDiff').toFixed(3),
      bigWeight:   +corr('bigWtDiff').toFixed(3),
    },
  }
}

// ── Game Matchup Dataset ──────────────────────────────────────────────────────
// Returns one row per unique Ivy-vs-Ivy game (school < opp_school to avoid
// double-counting), with position-level physical differentials and game outcomes.
// Used as the X-axis data source for the "Game Matchup" mode in Roster & Bio.
export function buildGameMatchupDataset(games, allPlayers) {
  const aggCache = {}
  const getAgg = (school, year) => {
    const k = `${school}|${year}`
    if (!aggCache[k]) {
      const squad = allPlayers.filter(p => p.school === school && p.year === year && p.min_pg >= 5)
      aggCache[k] = buildPositionWeightedAggregates(squad)
    }
    return aggCache[k]
  }

  const rosterCache = {}
  const getRoster = (school, year) => {
    const k = `${school}|${year}`
    if (!rosterCache[k]) {
      const ps = allPlayers.filter(p => p.school === school && p.year === year && p.min_pg >= 6)
      const enriched = ps.map(p => ({ ...p, _height_in: parseHeightIn(p.height), _exp: classYearNum(p.class_yr) }))
      rosterCache[k] = {
        avg_height: weightedAvg(enriched, '_height_in'),
        avg_weight: weightedAvg(ps, 'weight_lbs'),
        avg_exp:    weightedAvg(enriched, '_exp'),
      }
    }
    return rosterCache[k]
  }

  const rows = []
  for (const game of games) {
    if (!game.ivy_game || game.pts_for == null || game.school >= game.opp_school) continue
    const aggA = getAgg(game.school,     game.year)
    const aggB = getAgg(game.opp_school, game.year)
    const rA   = getRoster(game.school,     game.year)
    const rB   = getRoster(game.opp_school, game.year)

    const diff = (pos, key) => {
      const a = aggA[pos]?.[key], b = aggB[pos]?.[key]
      return (a != null && b != null) ? +(a - b).toFixed(2) : null
    }
    const rdiff = (key) => (rA[key] != null && rB[key] != null) ? +(rA[key] - rB[key]).toFixed(2) : null

    rows.push({
      school:      game.school,
      opp_school:  game.opp_school,
      year:        game.year,
      pts_diff:    game.pts_for - game.pts_against,
      win:         game.win ? 1 : 0,
      // Overall differentials
      overall_ht_diff:  rdiff('avg_height'),
      overall_wt_diff:  rdiff('avg_weight'),
      overall_exp_diff: rdiff('avg_exp'),
      // Guard differentials
      guard_ht_diff:    diff('Guard',   'avgHeightIn'),
      guard_wt_diff:    diff('Guard',   'avgWeightLbs'),
      guard_exp_diff:   diff('Guard',   'avgExperience'),
      guard_ortg_diff:  diff('Guard',   'avgOrtg'),
      guard_bpm_diff:   diff('Guard',   'avgBpm'),
      // Forward differentials
      fwd_ht_diff:      diff('Forward', 'avgHeightIn'),
      fwd_wt_diff:      diff('Forward', 'avgWeightLbs'),
      fwd_exp_diff:     diff('Forward', 'avgExperience'),
      fwd_ortg_diff:    diff('Forward', 'avgOrtg'),
      fwd_bpm_diff:     diff('Forward', 'avgBpm'),
      // Big/Center differentials
      big_ht_diff:      diff('Big',     'avgHeightIn'),
      big_wt_diff:      diff('Big',     'avgWeightLbs'),
      big_exp_diff:     diff('Big',     'avgExperience'),
      big_ortg_diff:    diff('Big',     'avgOrtg'),
      big_bpm_diff:     diff('Big',     'avgBpm'),
    })
  }
  return rows
}

// Pearson correlation + scatter points for a game-matchup-level dataset.
// Mirrors computeRelationship() but operates on buildGameMatchupDataset() output.
export function computeGameMatchupRelationship(gameMatchups, xKey, yKey) {
  const rows = gameMatchups.filter(g => g[xKey] != null && g[yKey] != null)
  const xs = rows.map(r => r[xKey])
  const ys = rows.map(r => r[yKey])
  return {
    points: rows.map(r => ({
      x: r[xKey], y: r[yKey],
      school: r.school, opp_school: r.opp_school, year: r.year,
    })),
    correlation: rows.length >= 4 ? parseFloat(pearsonCorrelation(xs, ys).toFixed(3)) : 0,
    n: rows.length,
  }
}
