// Tests for the data-driven calibration helpers used by MatchupAnalyzer
// (predictWinPct slope) and LuckLab (Pythagorean exponent).

import { describe, expect, it } from 'vitest'
import {
  calibrateWinPctModel,
  predictWinPctCalibrated,
  calibratePythagoreanExp,
  pythagoreanWinPctCalibrated,
} from '../calibration.js'

const mkSeason = (school, year, adjoe, adjde, ppp = adjoe, opp = adjde) => ({
  school, year, adjoe, adjde, ppp, opp_ppp: opp,
})

describe('calibrateWinPctModel', () => {
  it('falls back to the legacy slope when there isn\'t enough data', () => {
    const m = calibrateWinPctModel([], [])
    expect(m.fallback).toBe(true)
    expect(m.slope).toBeCloseTo(0.12, 6)
  })

  it('the model is symmetric: P(win|0,0) = 0.5 by construction', () => {
    // Dummy ladder of games with mirrored outcomes
    const seasons = []
    const games = []
    for (let i = 0; i < 40; i++) {
      const a = `s${(i * 2) % 8}`
      const b = `s${(i * 2 + 1) % 8}`
      seasons.push(mkSeason(a, 2024, 100 + (i % 5), 100 - (i % 5)))
      seasons.push(mkSeason(b, 2024, 100 - (i % 5), 100 + (i % 5)))
      games.push({
        ivy_game: true, win: i % 2 === 0, home: i % 3 === 0, neutral: false,
        school: a < b ? a : b, opp_school: a < b ? b : a, year: 2024,
      })
    }
    const m = calibrateWinPctModel(games, seasons)
    if (!m.fallback) {
      expect(predictWinPctCalibrated(m, 0, 0)).toBeCloseTo(0.5, 6)
      expect(m.intercept).toBe(0)
    }
  })

  it('predictWinPctCalibrated is monotone in net_eff_diff', () => {
    const m = { intercept: 0, slope: 0.14, homeBonus: 0.4, fallback: false }
    expect(predictWinPctCalibrated(m, -10, 0)).toBeLessThan(predictWinPctCalibrated(m, 0, 0))
    expect(predictWinPctCalibrated(m, 0, 0))   .toBeLessThan(predictWinPctCalibrated(m, 10, 0))
  })

  it('home advantage shifts the probability upward', () => {
    const m = { intercept: 0, slope: 0.14, homeBonus: 0.4, fallback: false }
    expect(predictWinPctCalibrated(m, 0, 1)).toBeGreaterThan(predictWinPctCalibrated(m, 0, 0))
    expect(predictWinPctCalibrated(m, 0, -1)).toBeLessThan(predictWinPctCalibrated(m, 0, 0))
  })
})

describe('calibratePythagoreanExp', () => {
  it('falls back to exponent 10 with too little data', () => {
    const result = calibratePythagoreanExp([], { mode: 'adjusted' })
    expect(result.fallback).toBe(true)
    expect(result.exponent).toBe(10)
  })

  it('finds an exponent close to the planted truth', () => {
    // Generate seasons with win% deterministically = pyth(adjoe, adjde, alpha=12).
    const seasons = []
    for (let i = 0; i < 40; i++) {
      const adjoe = 95 + i * 0.4
      const adjde = 110 - i * 0.3
      const p = Math.pow(adjoe, 12)
      const o = Math.pow(adjde, 12)
      const win_pct = p / (p + o)
      seasons.push({ school: 's' + i, year: 2022, adjoe, adjde, win_pct })
    }
    const result = calibratePythagoreanExp(seasons, { mode: 'adjusted' })
    expect(result.exponent).toBeGreaterThanOrEqual(10)
    expect(result.exponent).toBeLessThanOrEqual(14)
  })

  it('pythagoreanWinPctCalibrated gives 0.5 when ratings are equal', () => {
    const ts = { adjoe: 100, adjde: 100, ppp: 100, opp_ppp: 100 }
    const m  = { mode: 'adjusted', exponent: 10 }
    expect(pythagoreanWinPctCalibrated(ts, m)).toBeCloseTo(0.5, 6)
  })

  it('pythagoreanWinPctCalibrated > 0.5 when offense outpaces defense', () => {
    const ts = { adjoe: 110, adjde: 100 }
    const m  = { mode: 'adjusted', exponent: 10 }
    expect(pythagoreanWinPctCalibrated(ts, m)).toBeGreaterThan(0.5)
  })
})
