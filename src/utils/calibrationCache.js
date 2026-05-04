// Runtime cache layer over precomputedStats.json.
//
// Pages used to call calibrate*() directly at module load — that re-fit the
// model in every tab on every navigation. Now they call get*() which reads
// the build-time JSON. The data hash check guards against the JSON going
// stale: if teamSeasons/games changed since `npm run precompute` last ran,
// we fall back to a live fit instead of returning misleading constants.
//
// This file is browser-only — its JSON import doesn't work in Node ESM
// without an explicit `with { type: 'json' }` attribute. The pure fitting
// functions live in calibration.js for that reason.

import precomputed from '../data/precomputedStats.json'
import { calibrateWinPctModel, calibratePythagoreanExp } from './calibration.js'

function _dataHash(seasons, gms) {
  const wpSum = seasons.reduce((s, t) => s + (t.win_pct ?? 0), 0)
  return `ts${seasons.length}-g${gms.length}-wp${wpSum.toFixed(3)}`
}

let _winModelMemo = null
const _pyMemo     = { adjusted: null, raw: null }

/**
 * Get the calibrated logistic win-prob model. Reads from precomputedStats.json
 * when its dataHash matches the current data; falls back to a live fit when
 * the JSON is stale (e.g., post-data-refresh, before re-running precompute).
 */
export function getWinModel(games, teamSeasons) {
  if (_winModelMemo) return _winModelMemo
  const hash = _dataHash(teamSeasons, games)
  if (precomputed?.dataHash === hash && precomputed.winModel) {
    _winModelMemo = precomputed.winModel
  } else {
    _winModelMemo = calibrateWinPctModel(games, teamSeasons)
  }
  return _winModelMemo
}

/**
 * Get the calibrated Pythagorean exponent for the requested mode
 * ('adjusted' uses adjoe/adjde, 'raw' uses ppp/opp_ppp).
 */
export function getPythagoreanModel(teamSeasons, games, { mode = 'adjusted' } = {}) {
  if (_pyMemo[mode]) return _pyMemo[mode]
  const hash = _dataHash(teamSeasons, games)
  const slot = mode === 'raw' ? 'pyRaw' : 'pyAdjusted'
  if (precomputed?.dataHash === hash && precomputed[slot]) {
    _pyMemo[mode] = precomputed[slot]
  } else {
    _pyMemo[mode] = calibratePythagoreanExp(teamSeasons, { mode })
  }
  return _pyMemo[mode]
}

/** True when the runtime is reading from precomputedStats.json (vs live fit). */
export function isCalibrationCached(teamSeasons, games) {
  return precomputed?.dataHash === _dataHash(teamSeasons, games)
}

/**
 * Get the D1-trained EPA coefficient set. Returns null when the precompute
 * script hasn't seen a d1TeamSeasons.json yet — caller falls back to the
 * Ivy-only fit produced by runEPAPipeline.
 */
export function getD1EPAModels() {
  return precomputed?.d1Models ?? null
}
