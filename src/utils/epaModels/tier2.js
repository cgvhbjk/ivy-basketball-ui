// Tier 2: game-log regression pipeline.
// Clearly separated from Tier 1 (team-season) — synthetic data is blocked
// from being treated as production output.

import { validateGameLogs } from './validate.js'
import { DEFAULT_CONFIG } from './config.js'
import { fitRidgeCV, checkSigns } from './models.js'
import { computeFit } from './matrixOps.js'
import { convertToEventEPA } from './epaConversion.js'

const ALPHAS = DEFAULT_CONFIG.ridge.alphas

// Dean Oliver possession estimator
export function estimatePossessions(fga, orb, tov, fta) {
  return Math.max(fga - orb + tov + 0.44 * fta, 1)
}

// Compute per-100-possession four factors from raw game box score
function computeGameFactors(g) {
  const poss  = estimatePossessions(g.fga,     g.orb,     g.tov,     g.fta)
  const oPoss = estimatePossessions(g.opp_fga, g.opp_orb, g.opp_tov, g.opp_fta)
  if (g.fga === 0 || g.opp_fga === 0) return null

  // Derive points from box score if not stored (ESPN API omits points from statistics array)
  const pts     = g.pts     || (2 * g.fgm     + g.fg3m     + (g.ftm     ?? 0))
  const opp_pts = g.opp_pts || (2 * g.opp_fgm + g.opp_fg3m + (g.opp_ftm ?? 0))

  const eFG_o = ((g.fgm + 0.5 * g.fg3m) / g.fga) * 100
  const tov_o = (g.tov / poss) * 100
  // Rebound rate denominators must guard 0 explicitly. The previous `|| 1`
  // treated a real value of 0 (no defensive rebounds at all) as if it were
  // missing data; that quietly contaminated the rate. With ?? we now only
  // fill in for missing fields, and bail on the row if neither side has any
  // rebound activity.
  const orbDenom_o = g.orb + (g.opp_drb ?? 0)
  const orbDenom_d = g.opp_orb + (g.drb ?? 0)
  if (orbDenom_o === 0 || orbDenom_d === 0) return null
  const orb_o = (g.orb / orbDenom_o) * 100
  const ftr_o = (g.ftm / g.fga) * 100
  const eFG_d = ((g.opp_fgm + 0.5 * g.opp_fg3m) / g.opp_fga) * 100
  const tov_d = (g.opp_tov / oPoss) * 100
  const orb_d = (g.opp_orb / orbDenom_d) * 100
  const ftr_d = (g.opp_ftm / g.opp_fga) * 100
  const netEff = ((pts / poss) - (opp_pts / oPoss)) * 100

  const row = { eFG_o, tov_o, orb_o, ftr_o, eFG_d, tov_d, orb_d, ftr_d, netEff }
  const allFinite = Object.values(row).every(v => isFinite(v))
  return allFinite ? row : null
}

export function runTier2Pipeline(gameLogs, leagueRates, { ivyOnly = false, baselineEP = null } = {}) {
  // Validate — this explicitly checks and flags synthetic data
  const validation = validateGameLogs(gameLogs, { ivyOnly })

  if (!validation.ok) {
    return {
      status:    'error',
      synthetic: validation.synthetic ?? true,
      messages:  [...(validation.errors ?? []), ...(validation.warnings ?? [])],
      result:    null,
    }
  }

  const rows = ivyOnly ? gameLogs.filter(g => g.is_ivy_opponent) : gameLogs

  const processed = rows.map(g => computeGameFactors(g)).filter(Boolean)
  if (processed.length < 20) {
    return {
      status: 'error', synthetic: validation.synthetic,
      messages: [`Only ${processed.length} valid game rows after factor computation`],
      result: null,
    }
  }

  const FEAT = ['off_eFG', 'off_TOV', 'off_ORB', 'off_FTR', 'def_eFG', 'def_TOV', 'def_ORB', 'def_FTR']
  const X = processed.map(r => [1, r.eFG_o, r.tov_o, r.orb_o, r.ftr_o, r.eFG_d, r.tov_d, r.orb_d, r.ftr_d])
  const y = processed.map(r => r.netEff)

  let model
  try {
    // Use 10-fold CV for game logs — LOO on 900 obs (6300 solves) is too slow
    model = fitRidgeCV(X, y, FEAT, { alphas: ALPHAS, cvFolds: 10 })
  } catch (e) {
    return { status: 'error', synthetic: validation.synthetic, messages: [e.message], result: null }
  }

  const coefficients = {
    off_eFG: model.beta[1], off_TOV: model.beta[2],
    off_ORB: model.beta[3], off_FTR: model.beta[4],
    def_eFG: model.beta[5], def_TOV: model.beta[6],
    def_ORB: model.beta[7], def_FTR: model.beta[8],
  }
  const conv      = convertToEventEPA(coefficients, leagueRates, baselineEP, { modelVariant: 'joint' })
  const signIssues = checkSigns(model.beta, FEAT)
  const n = processed.length

  const observations = processed.map((r, i) => ({
    label:     rows[i] ? `${rows[i].school} vs ${rows[i].opponent}` : `Game ${i}`,
    actual:    +y[i].toFixed(2),
    predicted: +model.yHat[i].toFixed(2),
  }))

  return {
    status:    'ok',
    synthetic: validation.synthetic,
    messages:  validation.warnings,
    result: {
      n,
      ivyOnly,
      label:        `Game logs${ivyOnly ? ' · Ivy-only' : ''} (n=${n})`,
      r2:           model.r2,
      adjR2:        model.adjR2,
      rmse:         model.rmse,
      cvR2:         model.cvR2,
      alpha:        model.bestAlpha,
      coefficients,
      eventEPA:     conv.values,
      states:       conv.states,
      convMeta:     conv.meta,
      signIssues,
      observations,
    },
  }
}
