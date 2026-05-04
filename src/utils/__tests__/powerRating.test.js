import { describe, expect, it } from 'vitest'
import { computePowerRatings } from '../powerRating.js'

// Synthetic team-seasons + players. Each team has 6 players whose ortg/drtg
// roughly match the team's net efficiency. Bootstrap shouldn't blow up; rank
// percentile envelope should bracket the point estimate.
// Deterministic LCG so the fixture's ortg/drtg variation isn't perfectly
// collinear (would singular-matrix the OLS fit).
function jitter(seed) {
  let a = seed >>> 0
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0
    return (a / 4294967296) * 2 - 1   // [-1, 1)
  }
}

function buildFixture() {
  const teams = []
  const players = []
  const noise = jitter(99)
  for (let yi = 0; yi < 4; yi++) {
    const year = 2022 + yi
    for (let ti = 0; ti < 8; ti++) {
      const school = `school${ti}`
      const off = ti - 3.5             // offensive rating tier
      const def = (ti % 4) - 1.5       // defensive rating tier — uncorrelated with off
      teams.push({
        school, year,
        adjoe: 105 + off * 2,
        adjde: 100 - def * 2,
        net_efficiency: off * 3 + def * 2 + noise() * 0.5,
      })
      for (let pi = 0; pi < 6; pi++) {
        players.push({
          name: `${school}_p${pi}_${year}`,
          school, year,
          ortg: 100 + off * 2 + (pi - 2.5) + noise() * 0.3,
          drtg: 100 - def * 2 + (pi - 2.5) + noise() * 0.3,
          efg: 50,
          min_pg: 20,
          min_pct: 60,
        })
      }
    }
  }
  return { teams, players }
}

describe('computePowerRatings bootstrap', () => {
  it('attaches rankP05 / rankP95 / rankN to every rated player', () => {
    const { teams, players } = buildFixture()
    const out = computePowerRatings(teams, players, { bootstrap: { B: 50, seed: 1 } })
    expect(out.ratings.length).toBeGreaterThan(0)
    for (const r of out.ratings) {
      expect(r.rankP05).toBeTypeOf('number')
      expect(r.rankP95).toBeTypeOf('number')
      expect(r.rankP05).toBeLessThanOrEqual(r.rankP95)
      expect(r.rankN).toBeGreaterThan(0)
    }
  })

  it('reports the bootstrap config so callers can show provenance', () => {
    const { teams, players } = buildFixture()
    const out = computePowerRatings(teams, players, { bootstrap: { B: 25, seed: 7 } })
    expect(out.bootstrap).toEqual({ B: 25, seed: 7 })
  })

  it('is reproducible at the same seed (rank intervals identical)', () => {
    const { teams, players } = buildFixture()
    const a = computePowerRatings(teams, players, { bootstrap: { B: 30, seed: 42 } })
    const b = computePowerRatings(teams, players, { bootstrap: { B: 30, seed: 42 } })
    expect(a.ratings.map(r => [r.rankP05, r.rankP95]))
      .toEqual(b.ratings.map(r => [r.rankP05, r.rankP95]))
  })

  it('top player by point-estimate rank stays near the top under resampling', () => {
    const { teams, players } = buildFixture()
    const out = computePowerRatings(teams, players, { bootstrap: { B: 200, seed: 3 } })
    // Pick anyone with rank=1 in some year; their P95 (worst-case rank) should
    // not be terrible — at least within the top half of the year.
    const topPlayers = out.ratings.filter(r => r.rank === 1)
    expect(topPlayers.length).toBeGreaterThan(0)
    for (const p of topPlayers) {
      expect(p.rankP95).toBeLessThan(8)  // top half of 8-team year
    }
  })
})
