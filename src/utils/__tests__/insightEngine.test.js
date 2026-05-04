// Regression tests for the statistical core. These pin behaviour that the
// rest of the app depends on — null-safety on small samples, sign sanity on
// known relationships, and reproducibility of bootstrap/permutation paths.

import { describe, expect, it } from 'vitest'
import {
  pearsonCorrelation,
  pearsonBootstrapCI,
  pearsonPermutationP,
  detectThreshold,
  scoreInsight,
  computeRelationship,
  classifyOffScheme,
  classifyDefScheme,
  computeTeamArchetype,
  weightedAvg,
  parseHeightIn,
  classYearNum,
  benjaminiHochberg,
  clusterTeamSchemes,
  validateClustersAgainstCoachMeta,
} from '../insightEngine.js'

describe('pearsonCorrelation', () => {
  it('returns null below the minimum sample size (was a misleading 0)', () => {
    expect(pearsonCorrelation([1, 2], [3, 4])).toBeNull()
    expect(pearsonCorrelation([1, 2, 3], [4, 5, 6])).toBeNull()
  })

  it('matches a hand-computed value on a perfect positive line', () => {
    expect(pearsonCorrelation([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 6)
  })

  it('matches a hand-computed value on a perfect negative line', () => {
    expect(pearsonCorrelation([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 6)
  })

  it('returns null when one series has zero variance', () => {
    expect(pearsonCorrelation([1, 2, 3, 4], [5, 5, 5, 5])).toBeNull()
  })
})

describe('pearsonBootstrapCI', () => {
  it('produces a CI that contains the point estimate for a strong signal', () => {
    const xs = Array.from({ length: 30 }, (_, i) => i)
    const ys = xs.map(x => 2 * x + 1) // perfect line
    const ci = pearsonBootstrapCI(xs, ys, { B: 200 })
    expect(ci.r).toBeCloseTo(1, 6)
    expect(ci.ciLow).toBeLessThanOrEqual(ci.r)
    expect(ci.ciHigh).toBeGreaterThanOrEqual(ci.r)
  })

  it('is deterministic when seeded the same way', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const ys = [2, 4, 1, 8, 7, 12, 14, 11, 18, 20]
    const a  = pearsonBootstrapCI(xs, ys, { B: 200, seed: 42 })
    const b  = pearsonBootstrapCI(xs, ys, { B: 200, seed: 42 })
    expect(a).toEqual(b)
  })

  it('returns null below the minimum sample size', () => {
    expect(pearsonBootstrapCI([1, 2], [3, 4])).toBeNull()
  })
})

describe('pearsonPermutationP', () => {
  it('reports a tiny p-value on a strong signal', () => {
    const xs = Array.from({ length: 30 }, (_, i) => i)
    const ys = xs.map(x => 2 * x)
    const p  = pearsonPermutationP(xs, ys, { B: 200 })
    // Phipson–Smyth gives 1/(B+1) when no shuffle exceeds the observation.
    expect(p).toBeLessThanOrEqual(2 / 201)
  })

  it('reports a p-value near 1 on pure noise (deterministic seed)', () => {
    const xs = Array.from({ length: 30 }, (_, i) => i)
    const ys = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8, 9, 7, 9, 3, 2, 3, 8, 4, 6, 2, 6, 4, 3, 3, 8, 3, 2, 7]
    const p  = pearsonPermutationP(xs, ys, { B: 500, seed: 1 })
    expect(p).toBeGreaterThan(0.10)
  })
})

describe('detectThreshold', () => {
  // Two-cluster synthetic: x<5 → low y, x≥5 → high y. The split should land
  // between 4 and 5 with a small permutation p-value.
  it('finds the planted split and survives the permutation test', () => {
    const seasons = []
    for (let i = 0; i < 8; i++) seasons.push({ year: 2022, school: 's' + i, x: i,     y: 0.10 + i * 0.001 })
    for (let i = 0; i < 8; i++) seasons.push({ year: 2022, school: 't' + i, x: i + 6, y: 0.60 + i * 0.001 })
    const t = detectThreshold(seasons, 'x', 'y', [2022, 2025], { B: 200 })
    expect(t).not.toBeNull()
    expect(t.aboveMean).toBeGreaterThan(t.belowMean)
    expect(t.pValue).toBeLessThan(0.05)
  })

  it('returns null when the relationship is noise (no significant split)', () => {
    const seasons = [
      { year: 2022, x: 1,  y: 0.5 }, { year: 2022, x: 2,  y: 0.4 },
      { year: 2022, x: 3,  y: 0.6 }, { year: 2022, x: 4,  y: 0.45 },
      { year: 2022, x: 5,  y: 0.55 }, { year: 2022, x: 6,  y: 0.5 },
      { year: 2022, x: 7,  y: 0.5 }, { year: 2022, x: 8,  y: 0.45 },
    ]
    const t = detectThreshold(seasons, 'x', 'y', [2022, 2025], { B: 200 })
    expect(t).toBeNull()
  })
})

describe('scoreInsight', () => {
  it('downgrades to LOW when correlation is null', () => {
    const s = scoreInsight(null, 32)
    expect(s.valid).toBe(false)
    expect(s.confidence).toBe('LOW')
  })

  it('downgrades when permutation p-value is high even with a sizeable r', () => {
    const s = scoreInsight(0.40, 32, { pValue: 0.30 })
    expect(s.valid).toBe(false)
    expect(s.reason).toMatch(/permutation/)
  })

  it('promotes to HIGH only when |r|≥0.55, p<0.05, and CI excludes 0', () => {
    const s = scoreInsight(0.70, 32, { pValue: 0.001, ciLow: 0.50, ciHigh: 0.85 })
    expect(s.confidence).toBe('HIGH')
  })

  it('keeps HIGH off when the CI straddles zero', () => {
    const s = scoreInsight(0.55, 32, { pValue: 0.04, ciLow: -0.10, ciHigh: 0.80 })
    expect(s.confidence).not.toBe('HIGH')
  })
})

describe('benjaminiHochberg', () => {
  it('rejects the worked example from the original BH paper', () => {
    // p-values: 0.0001, 0.0004, 0.0019, 0.0095, 0.0201, 0.0278, 0.0298, 0.0344, 0.0459,
    //          0.3240, 0.4262, 0.5719, 0.6528, 0.7590, 1.000
    // At q=0.05, BH rejects the first 4 (largest k where p_(k) ≤ k/m * q is k=4).
    const ps = [0.0001, 0.0004, 0.0019, 0.0095, 0.0201, 0.0278, 0.0298, 0.0344, 0.0459,
                0.3240, 0.4262, 0.5719, 0.6528, 0.7590, 1.000]
    const out = benjaminiHochberg(ps, 0.05)
    expect(out.slice(0, 4)).toEqual([true, true, true, true])
    expect(out.slice(4)).toEqual(out.slice(4).map(() => false))
  })

  it('treats null p-values as failed tests, not droppable from m', () => {
    // 5 valid + 5 null. q=0.05. Threshold for k=1 is (1/10)*0.05 = 0.005.
    // p=0.001 → 0.001 ≤ 0.005, survives. p=0.04 → 0.04 > (2/10)*0.05=0.01, fails.
    const out = benjaminiHochberg([0.001, 0.04, null, null, null, null, null, 0.6, 0.8, 0.9], 0.05)
    expect(out[0]).toBe(true)
    expect(out[1]).toBe(false)
    expect(out[2]).toBe(false)  // null never marks as survivor
  })

  it('returns all false when no test reaches the threshold', () => {
    const out = benjaminiHochberg([0.5, 0.6, 0.7], 0.05)
    expect(out).toEqual([false, false, false])
  })
})

describe('computeRelationship — controlForYear', () => {
  // Year baselines drive a strong positive pooled r:
  //   2022 has high m (50–57) and high w (0.70–0.77)
  //   2024 has low  m (40–47) and low  w (0.30–0.37)
  // …but within each year, m and w move in opposite directions, so the
  // partial correlation (controlling for year) should flip negative.
  it('attenuates the correlation when within-year drift drives the pooled r', () => {
    const rows = []
    for (let i = 0; i < 8; i++) rows.push({ year: 2022, school: 'a' + i, m: 50 + i, w: 0.77 - i * 0.01 })
    for (let i = 0; i < 8; i++) rows.push({ year: 2024, school: 'b' + i, m: 40 + i, w: 0.37 - i * 0.01 })
    const pooled = computeRelationship(rows, 'm', 'w', { yearRange: [2020, 2026], withCI: false, controlForYear: false })
    const ctrl   = computeRelationship(rows, 'm', 'w', { yearRange: [2020, 2026], withCI: false, controlForYear: true  })
    expect(pooled.correlation).toBeGreaterThan(0.7)
    expect(ctrl.correlation).toBeLessThan(0)
    expect(ctrl.controlForYear).toBe(true)
  })
})

describe('clusterTeamSchemes', () => {
  // Synthetic two-archetype fixture: 16 fast-3-heavy teams + 16 slow-inside teams.
  // k-means should find them as separate clusters.
  function buildFixture() {
    const rows = []
    let a = 7
    const r = () => { a = (a * 1664525 + 1013904223) >>> 0; return (a / 4294967296) * 2 - 1 }
    for (let i = 0; i < 16; i++) {
      rows.push({
        school: 'fast' + i, year: 2022 + (i % 4),
        tempo: 72 + r() * 0.5, three_rate_o: 44 + r() * 1.0,
        efg_o: 53 + r() * 0.5, tov_o: 18 + r() * 0.3,
        blk_d: 8 + r() * 0.3, tov_d: 19 + r() * 0.5, efg_d: 52 + r() * 0.5,
      })
    }
    for (let i = 0; i < 16; i++) {
      rows.push({
        school: 'slow' + i, year: 2022 + (i % 4),
        tempo: 62 + r() * 0.5, three_rate_o: 30 + r() * 1.0,
        efg_o: 51 + r() * 0.5, tov_o: 17 + r() * 0.3,
        blk_d: 11 + r() * 0.3, tov_d: 22 + r() * 0.5, efg_d: 49 + r() * 0.5,
      })
    }
    return rows
  }

  it('finds two well-separated archetypes from synthetic data', () => {
    const c = clusterTeamSchemes(buildFixture(), { ks: [2, 3, 4], seed: 11 })
    expect(c.k).toBe(2)
    expect(c.silhouette).toBeGreaterThan(0.4)
    // Each row carries a label + cluster id
    expect(c.rows[0]).toHaveProperty('label')
    expect(c.rows[0]).toHaveProperty('cluster')
  })

  it('returns empty result when too few rows for the k range', () => {
    const c = clusterTeamSchemes([
      { school: 'a', year: 2022, tempo: 70, three_rate_o: 35, efg_o: 50, tov_o: 18, blk_d: 9, tov_d: 20, efg_d: 51 },
    ], { ks: [3, 4, 5] })
    expect(c.k).toBeNull()
    expect(c.rows).toEqual([])
  })
})

describe('validateClustersAgainstCoachMeta', () => {
  it('returns null agree when no coach text is available, vs true/false otherwise', () => {
    const fakeCluster = {
      rows: [
        { school: 'a', year: 2022, cluster: 0, label: 'Fast 3-Heavy' },
        { school: 'b', year: 2022, cluster: 0, label: 'Fast 3-Heavy' },
        { school: 'c', year: 2022, cluster: 1, label: 'Balanced' },
      ],
    }
    const fakeGetCoach = (school) => ({
      a: { playstyle: 'fast transition offense, perimeter focused' },
      b: { playstyle: 'half-court grinding defense' },        // contradicts "Fast"
      c: null,                                                // no record
    }[school])
    const out = validateClustersAgainstCoachMeta(fakeCluster, fakeGetCoach)
    const aRow = out.rows.find(r => r.school === 'a')
    const bRow = out.rows.find(r => r.school === 'b')
    const cRow = out.rows.find(r => r.school === 'c')
    expect(aRow.agree).toBe(true)
    expect(bRow.agree).toBe(false)
    expect(cRow.agree).toBeNull()
    expect(out.byCluster[0].agreementRate).toBeCloseTo(0.5)
  })
})

describe('classifyOffScheme', () => {
  it.each([
    [{ tempo: 70, three_rate_o: 42 }, 'Run & Gun'],
    [{ tempo: 70, three_rate_o: 30 }, 'Transition Attack'],
    [{ tempo: 65, three_rate_o: 42 }, 'Spread Offense'],
    [{ tempo: 65, three_rate_o: 30 }, 'Grind It Out'],
  ])('classifies %j as %s', (season, expected) => {
    expect(classifyOffScheme(season)).toBe(expected)
  })
})

describe('classifyDefScheme', () => {
  it.each([
    [{ tov_d: 32, blk_d: 8,  efg_d: 52 }, 'High Pressure'],
    [{ tov_d: 22, blk_d: 12, efg_d: 52 }, 'Rim Protection'],
    [{ tov_d: 22, blk_d: 8,  efg_d: 48 }, 'Coverage'],
    [{ tov_d: 22, blk_d: 8,  efg_d: 53 }, 'Standard'],
  ])('classifies %j as %s', (season, expected) => {
    expect(classifyDefScheme(season)).toBe(expected)
  })
})

describe('computeTeamArchetype', () => {
  const big = (over) => ({ pos_type: 'C',  min_pg: 30, weight_lbs: 240, ...over })
  const fwd = (over) => ({ pos_type: 'SF', min_pg: 30, weight_lbs: 215, ...over })
  const grd = (over) => ({ pos_type: 'PG', min_pg: 30, weight_lbs: 185, ...over })

  it('flags a Star-Driven roster on top usage', () => {
    const squad = [grd({ usg: 32 }), grd({ usg: 18 }), fwd({ usg: 17 }), big({ usg: 15 })]
    expect(computeTeamArchetype(squad).archetype).toBe('Star-Driven')
  })

  it('flags Big-Dominant only when the bigs are also heavy', () => {
    const heavy = [big({ weight_lbs: 245 }), big({ weight_lbs: 240 }), grd({}), fwd({})]
    const light = [big({ weight_lbs: 200 }), big({ weight_lbs: 210 }), grd({}), fwd({})]
    expect(computeTeamArchetype(heavy).archetype).toBe('Big-Dominant')
    expect(computeTeamArchetype(light).archetype).not.toBe('Big-Dominant')
  })

  it('returns Balanced when no signal dominates', () => {
    const squad = [grd({}), fwd({}), big({})]
    const a = computeTeamArchetype(squad).archetype
    expect(['Balanced', 'Big-Dominant', 'Wing-Oriented', 'Guard-Heavy']).toContain(a)
  })
})

describe('helpers', () => {
  it('parseHeightIn handles N-N and rejects junk', () => {
    expect(parseHeightIn("6-3")).toBe(75)
    expect(parseHeightIn("5-11")).toBe(71)
    expect(parseHeightIn("")).toBeNull()
    expect(parseHeightIn("six three")).toBeNull()
  })

  it('classYearNum is 1..5 with Grad mapping', () => {
    expect(classYearNum('Fr')).toBe(1)
    expect(classYearNum('Sr')).toBe(4)
    expect(classYearNum('Grad')).toBe(5)
    expect(classYearNum('???')).toBeNull()
  })

  it('weightedAvg drops missing values and zero weights', () => {
    const items = [
      { v: 10, w: 2 },
      { v: 20, w: 0 },
      { v: 30, w: null },
      { v: 40, w: 4 },
    ]
    expect(weightedAvg(items, 'v', 'w')).toBeCloseTo((10 * 2 + 40 * 4) / (2 + 4), 6)
  })
})
