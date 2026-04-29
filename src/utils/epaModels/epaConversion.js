import { FIELD_MAP, THREE_PT_eFG_MULTIPLIER, ORB_POSSESSION_CREDIT } from './config.js'

// ── League-rate computation ───────────────────────────────────────────────────
// Derives actual event frequencies from team-season data.
// These replace the hard-coded avgFGA=48 in the old conversion.
//
// FGA per 100 possessions is derived from the scoring identity:
//   ppp = FGA_p100 × (2 × eFG + ft_pct × ftr)
// → FGA_p100 = ppp / (2 × eFG + ft_pct × ftr)

export function computeLeagueRates(teamSeasons) {
  const valid = teamSeasons.filter(ts => {
    const vals = [ts[FIELD_MAP.rawOE], ts[FIELD_MAP.off_eFG], ts[FIELD_MAP.ftPct], ts[FIELD_MAP.off_FTR]]
    return vals.every(v => v != null && isFinite(Number(v)) && Number(v) > 0)
  })

  const fgaP100 = valid.map(ts => {
    const eFG   = ts[FIELD_MAP.off_eFG] / 100
    const ftPct = ts[FIELD_MAP.ftPct]   / 100
    const ftr   = ts[FIELD_MAP.off_FTR] / 100
    const denom = 2 * eFG + ftPct * ftr
    return denom > 0 ? ts[FIELD_MAP.rawOE] / denom : null
  }).filter(v => v != null && isFinite(v))

  const avgFGAp100 = fgaP100.reduce((s, v) => s + v, 0) / fgaP100.length
  const avgEFG     = valid.map(ts => ts[FIELD_MAP.off_eFG]).reduce((s, v) => s + v, 0) / valid.length
  const avgTOV     = valid.map(ts => ts[FIELD_MAP.off_TOV]).reduce((s, v) => s + v, 0) / valid.length
  const avgORB     = valid.map(ts => ts[FIELD_MAP.off_ORB]).reduce((s, v) => s + v, 0) / valid.length
  const avgFTR     = valid.map(ts => ts[FIELD_MAP.off_FTR]).reduce((s, v) => s + v, 0) / valid.length

  return {
    avgFGAp100: +avgFGAp100.toFixed(1),
    avgEFG:     +avgEFG.toFixed(2),
    avgTOV:     +avgTOV.toFixed(2),
    avgORB:     +avgORB.toFixed(2),
    avgFTR:     +avgFTR.toFixed(2),
    n: valid.length,
  }
}

// ── EPA conversion ────────────────────────────────────────────────────────────
// Converts regression coefficients (per-100-possession units) to per-event EPA.
//
// Denominators and assumptions:
//   - off_eFG coefficient is in (pts/100 poss) per (1% eFG)
//     → per made-2FG: β_eFG × (1 FGA / (FGA_p100/100)) = β_eFG × 100/FGA_p100
//     → per made-3FG: same × THREE_PT_eFG_MULTIPLIER (3FG adds 1.5× to eFG vs 2FG)
//   - off_TOV is in (pts/100 poss) per (1 unit of tov_o)
//     → direct per-event if tov_o is in per-100-possession units
//   - off_ORB scales by ORB_POSSESSION_CREDIT (0.85) because an ORB ≠ full possession
//   - FTR: β_FTR × 100/FGA_p100 = per foul drawn
//   - Defensive terms flip sign: def_TOV forcing is +, def_eFG suppression is -
//
// The conversion explicitly states:
//   denominator: FGA-based (FGA_p100 from accounting identity)
//   unit:        per-event EPA in points of net efficiency per 100 possessions
//   approximation: tov_o assumed to be in per-100-possession units

export function convertToEventEPA(coefficients, leagueRates, overrides = {}) {
  const { off_eFG, off_TOV, off_ORB, off_FTR, def_eFG, def_TOV } = coefficients
  const fgaP100 = overrides.avgFGAp100 ?? leagueRates.avgFGAp100
  const scale   = 100 / fgaP100  // converts per-%eFG to per-FGA

  const result = {
    made2FG:            +(off_eFG  * scale).toFixed(3),
    made3FG:            +(off_eFG  * scale * THREE_PT_eFG_MULTIPLIER).toFixed(3),
    offTurnover:        +(off_TOV).toFixed(3),             // direct per-100-poss unit
    offRebound:         +(off_ORB  * ORB_POSSESSION_CREDIT).toFixed(3),
    foulDrawn:          +(off_FTR  * scale).toFixed(3),
    defForcedTurnover:  +(-def_TOV).toFixed(3),            // flip: forcing TO is positive
    defShotSuppression: +(-def_eFG * scale).toFixed(3),    // flip: suppressing eFG is positive
  }

  const meta = {
    denominator:      'FGA-based (derived from scoring identity: ppp = FGA_p100 × (2·eFG + ft_pct·ftr))',
    avgFGAp100:       fgaP100,
    unit:             'points of net efficiency per 100 possessions, per event',
    tovAssumption:    'tov_o treated as turnovers per 100 possessions (direct β use)',
    orbCreditRate:    ORB_POSSESSION_CREDIT,
    uncertaintyNote:  'tov_o scale in Barttorvik data is non-standard; β_TOV should be interpreted as marginal not absolute',
  }

  return { values: result, meta }
}
