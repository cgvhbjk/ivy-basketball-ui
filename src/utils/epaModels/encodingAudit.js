// Phase-0 encoding audit. Every team-season row from Barttorvik's slice JSON
// is positionally decoded; column meanings are NOT explicitly typed by the
// source. Three of the four "ambiguous" columns (tov_o, orb, tov_d) ship
// with non-standard encoding direction relative to textbook four-factor
// convention. Rather than guess, we infer signs empirically from the data.
//
// The audit fits a five-column OLS (intercept + four factors) on each side
// (offense → ppp, defense → opp_ppp) and reports the partial coefficient
// signs. The pipeline's sign constraints — both `SIGN_CONSTRAINTS_OFF/DEF`
// and the joint-model `CONSTRAINED_SIGNS` — should match these empirical
// signs. If a future data refresh changes the encoding direction, this audit
// (run via the unit test in __tests__/encodingAudit.test.js) will fail
// loudly instead of silently producing wrong-sign coefficients.

import { olsSolve, computeFit } from './matrixOps.js'
import { FIELD_MAP } from './config.js'

const OFF_KEYS = ['off_eFG', 'off_TOV', 'off_ORB', 'off_FTR']
const DEF_KEYS = ['def_eFG', 'def_TOV', 'def_ORB', 'def_FTR']

function _zCols(rows, keys) {
  return keys.map(key => {
    const xs = rows.map(r => r[FIELD_MAP[key]])
    const m  = xs.reduce((s, v) => s + v, 0) / xs.length
    const sd = Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / xs.length) || 1
    return rows.map(r => (r[FIELD_MAP[key]] - m) / sd)
  })
}

function _validRows(teamSeasons) {
  return teamSeasons.filter(s =>
    [...OFF_KEYS, ...DEF_KEYS, 'rawOE', 'rawDE'].every(k => s[FIELD_MAP[k]] != null)
  )
}

function _fitSide(rows, keys, targetKey) {
  const cols = _zCols(rows, keys)
  const X = rows.map((_, i) => [1, cols[0][i], cols[1][i], cols[2][i], cols[3][i]])
  const y = rows.map(r => r[FIELD_MAP[targetKey]])
  const beta = olsSolve(X, y)
  const fit  = computeFit(X, y, beta)
  return { beta, r2: fit.r2 }
}

/**
 * Run the encoding audit on a team-season array.
 * Returns the partial coefficients, the implied sign per column, and which
 * sign-constraint values the pipeline should be using.
 *
 * @param {Object[]} teamSeasons
 * @returns {{
 *   ok: boolean,
 *   n: number,
 *   off: { beta: number[], r2: number, signs: Record<string, 1|-1> },
 *   def: { beta: number[], r2: number, signs: Record<string, 1|-1> },
 *   recommendedConstraints: {
 *     SIGN_CONSTRAINTS_OFF: Record<string, 1|-1>,
 *     SIGN_CONSTRAINTS_DEF: Record<string, 1|-1>,
 *     CONSTRAINED_SIGNS:    Record<string, 1|-1>,
 *   },
 *   warnings: string[],
 * }}
 */
export function auditFieldEncoding(teamSeasons) {
  const rows = _validRows(teamSeasons)
  if (rows.length < 12) {
    return {
      ok: false, n: rows.length,
      off: null, def: null,
      recommendedConstraints: null,
      warnings: [`Audit needs ≥12 valid rows; got ${rows.length}`],
    }
  }

  const off = _fitSide(rows, OFF_KEYS, 'rawOE')
  const def = _fitSide(rows, DEF_KEYS, 'rawDE')

  const offSigns = Object.fromEntries(OFF_KEYS.map((k, i) => [k, off.beta[i + 1] >= 0 ? 1 : -1]))
  const defSigns = Object.fromEntries(DEF_KEYS.map((k, i) => [k, def.beta[i + 1] >= 0 ? 1 : -1]))

  // Joint-model signs predict (ppp − opp_ppp). Defensive coefficients flip
  // because `−opp_ppp` reverses their effect on net efficiency.
  const jointSigns = {
    ...offSigns,
    ...Object.fromEntries(DEF_KEYS.map(k => [k, defSigns[k] === 1 ? -1 : 1])),
  }

  // Warn on coefficients near zero — at n=32 these are ambiguous but we still
  // pick a sign to keep the constraint dictionary complete.
  const warnings = []
  ;[...OFF_KEYS.map((k, i) => ['off', k, off.beta[i + 1]]),
    ...DEF_KEYS.map((k, i) => ['def', k, def.beta[i + 1]])].forEach(([side, k, b]) => {
    if (Math.abs(b) < 0.3) {
      warnings.push(`${side}/${k}: |β|=${Math.abs(b).toFixed(2)} < 0.3 — sign not strongly identified at this n`)
    }
  })

  return {
    ok: true,
    n: rows.length,
    off: { beta: off.beta, r2: off.r2, signs: offSigns },
    def: { beta: def.beta, r2: def.r2, signs: defSigns },
    recommendedConstraints: {
      SIGN_CONSTRAINTS_OFF: offSigns,
      SIGN_CONSTRAINTS_DEF: defSigns,
      CONSTRAINED_SIGNS:    jointSigns,
    },
    warnings,
  }
}

/**
 * Compare the audit's recommended signs to the values currently shipped in
 * config.js / pipeline.js. Returns the list of mismatches (empty when in sync).
 * Used by the unit test to fail loudly on data drift.
 */
export function diffAgainstShippedConstraints(audit, shipped) {
  const out = []
  for (const dictName of ['SIGN_CONSTRAINTS_OFF', 'SIGN_CONSTRAINTS_DEF', 'CONSTRAINED_SIGNS']) {
    const want = audit.recommendedConstraints[dictName]
    const have = shipped[dictName]
    for (const key of Object.keys(want)) {
      if (have[key] !== want[key]) {
        out.push({ dict: dictName, field: key, shipped: have[key], audit: want[key] })
      }
    }
  }
  return out
}
