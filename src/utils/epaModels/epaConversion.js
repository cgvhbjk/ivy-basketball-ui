import { FIELD_MAP, THREE_PT_eFG_MULTIPLIER, ORB_POSSESSION_CREDIT } from './config.js'

// ── League-rate computation ───────────────────────────────────────────────────
// Derives actual event frequencies from team-season data.
// FGA per 100 possessions from scoring identity: ppp = FGA_p100 × (2·eFG + ft_pct·ftr)

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

  const avg = arr => arr.reduce((s, v) => s + v, 0) / arr.length

  return {
    avgFGAp100: +avg(fgaP100).toFixed(1),
    avgEFG:     +avg(valid.map(ts => ts[FIELD_MAP.off_eFG])).toFixed(2),
    avgTOV:     +avg(valid.map(ts => ts[FIELD_MAP.off_TOV])).toFixed(2),
    avgORB:     +avg(valid.map(ts => ts[FIELD_MAP.off_ORB])).toFixed(2),
    avgFTR:     +avg(valid.map(ts => ts[FIELD_MAP.off_FTR])).toFixed(2),
    avgPPP:     +avg(valid.map(ts => ts[FIELD_MAP.rawOE])).toFixed(2),
    n: valid.length,
  }
}

// ── Base + Delta EPA conversion ───────────────────────────────────────────────
//
// Aggregate values (unchanged from previous version):
//   Denominator: FGA_p100 from accounting identity (87.9 for Ivy 2022–25)
//   Unit: points of net efficiency per 100 possessions, per event
//
// State context (new):
//   Maps each event to possession states from baseline_epa.json.
//   Base  = absolute EP of the resulting possession state (from baseline table)
//   Delta = regression-derived adjustment vs the baseline "average" assumption
//   Combined = Base + Delta (the full contextualized value)
//
//   Delta interpretation:
//     A positive δ means the event costs/gains more than the baseline assumption.
//     A negative δ means it costs/gains less than baseline.
//     With only league-aggregate data, δ reflects Ivy-specific regression vs NCAA baseline.
//     With per-team game logs (Tier 2), δ would reflect team-specific vs Ivy-league average.
//
//   Scale note:
//     Baseline EP values are in "points per possession" (absolute).
//     Regression values are in "points per 100 possessions per unit of factor".
//     To compare, we normalize the regression value to a per-possession, per-event scale
//     using FGA_p100 as the bridge.

// modelVariant controls sign conventions for defensive coefficients:
//   'joint' — coefficients come from a single model predicting net_efficiency (ppp − opp_ppp).
//             def_eFG < 0, def_TOV > 0 → formulas negate def_eFG, keep def_TOV.
//   'split' — def coefficients come from a sub-model predicting opp_ppp directly.
//             def_eFG > 0, def_TOV < 0 → formulas keep def_eFG, negate def_TOV.
export function convertToEventEPA(coefficients, leagueRates, baselineEP = null, overrides = {}) {
  const { off_eFG, off_TOV, off_ORB, off_FTR, def_eFG, def_TOV } = coefficients
  const fgaP100      = overrides.avgFGAp100   ?? leagueRates.avgFGAp100
  const modelVariant = overrides.modelVariant ?? 'joint'
  const scale        = 100 / fgaP100

  // ── Aggregate values (regression-only) ────────────────────────────────────
  const aggregate = {
    made2FG:            +(off_eFG  * scale).toFixed(3),
    made3FG:            +(off_eFG  * scale * THREE_PT_eFG_MULTIPLIER).toFixed(3),
    offTurnover:        +(off_TOV).toFixed(3),
    offRebound:         +(off_ORB  * ORB_POSSESSION_CREDIT).toFixed(3),
    foulDrawn:          +(off_FTR  * scale).toFixed(3),
    // Joint model: def_TOV > 0 (more opp TO → better net eff) → EPA = +def_TOV
    // Split model: def_TOV < 0 (more opp TO → lower opp_ppp) → EPA = −def_TOV
    defForcedTurnover:  modelVariant === 'joint'
      ? +(def_TOV).toFixed(3)
      : +(-def_TOV).toFixed(3),
    // Joint model: def_eFG < 0 (more opp eFG% → lower net eff) → EPA = −def_eFG (positive)
    // Split model: def_eFG > 0 (more opp eFG% → higher opp_ppp) → EPA = +def_eFG (positive)
    defShotSuppression: modelVariant === 'joint'
      ? +(-def_eFG * scale).toFixed(3)
      : +(def_eFG  * scale).toFixed(3),
  }

  // ── State-contextualized values (Base + Delta) ────────────────────────────
  let states = null
  if (baselineEP?.possession_states && baselineEP?.event_state_map) {
    const ps  = baselineEP.possession_states
    const esm = baselineEP.event_state_map

    // Turnover state context
    // Base: weighted EP the OPPONENT receives = live_pct × transition_ep + dead_pct × dead_ball_ep
    const tovMap   = esm.offTurnover
    const tovBase  = +(tovMap.live_pct * ps.transition_live_steal.ep +
                       tovMap.dead_pct * ps.dead_ball_inbound.ep).toFixed(3)
    // Delta: regression value (per-100-poss) normalized to per-possession scale
    // When tov_o encoding is ambiguous, β_TOV may be 0 (constrained) — delta is 0
    const tovDelta = +(off_TOV / 100).toFixed(3)
    const tovIvyDelta = +(tovBase - ps.dead_ball_inbound.ep).toFixed(3)

    // Offensive rebound state context
    // Base: weighted EP your team gets = putback_pct × putback_ep + reset_pct × reset_ep
    const orbMap   = esm.offRebound
    const orbBase  = +(orbMap.putback_pct * ps.putback_attempt.ep +
                       orbMap.reset_pct   * ps.reset_possession.ep).toFixed(3)
    const orbDelta = +(off_ORB * ORB_POSSESSION_CREDIT / 100).toFixed(3)

    // FT foul drawn context
    const ftMap   = esm.foulDrawn
    const ftBase  = +(ftMap.two_shot_pct   * ps.foul_drawn_two_shots.ep +
                      ftMap.one_and_one_pct * ps.foul_drawn_one_and_one.ep).toFixed(3)

    // Forced turnover (defensive) — mirror of offTurnover
    const defTovBase = tovBase  // same state structure, your team is now the beneficiary
    const defTovDelta = +(-def_TOV / 100).toFixed(3)

    states = {
      offTurnover: {
        liveSteal:  { ep: ps.transition_live_steal.ep,  label: ps.transition_live_steal.label,  pct: tovMap.live_pct },
        deadBall:   { ep: ps.dead_ball_inbound.ep,      label: ps.dead_ball_inbound.label,       pct: tovMap.dead_pct },
        weightedOpponentEP: tovBase,
        regressionDelta:    tovDelta,
        combined:           +(tovBase + tovDelta).toFixed(3),
        ivyPremium:         tovIvyDelta,   // extra cost of live steal vs dead ball
        note: 'Cost to you = opponent EP gained. Live steal (37%) vs dead ball (63%).',
      },
      offRebound: {
        putback:  { ep: ps.putback_attempt.ep,   label: ps.putback_attempt.label,   pct: orbMap.putback_pct },
        reset:    { ep: ps.reset_possession.ep,  label: ps.reset_possession.label,  pct: orbMap.reset_pct   },
        weightedYourEP: orbBase,
        regressionDelta: orbDelta,
        combined: +(orbBase + orbDelta).toFixed(3),
        note: 'Gain to you = your EP from resulting state. Putback (42%) vs reset (58%).',
      },
      foulDrawn: {
        twoShots:     { ep: ps.foul_drawn_two_shots.ep,    label: ps.foul_drawn_two_shots.label,    pct: ftMap.two_shot_pct },
        oneAndOne:    { ep: ps.foul_drawn_one_and_one.ep,  label: ps.foul_drawn_one_and_one.label,  pct: ftMap.one_and_one_pct },
        weightedYourEP: ftBase,
        note: 'Your EP from the resulting free throw state.',
      },
      defForcedTurnover: {
        liveSteal: { ep: ps.transition_live_steal.ep,  pct: tovMap.live_pct },
        deadBall:  { ep: ps.dead_ball_inbound.ep,      pct: tovMap.dead_pct },
        weightedYourEP: defTovBase,
        regressionDelta: defTovDelta,
        combined: +(defTovBase + defTovDelta).toFixed(3),
        note: 'When you force a turnover, your team gains this expected EP.',
      },
      _deltaNote: off_TOV === 0
        ? 'Regression deltas are 0 because the constrained model zeroed ambiguous tov_o/orb coefficients. Baseline state values are reliable; deltas require per-team game-log data (Tier 2).'
        : 'Deltas reflect Ivy-aggregate regression vs NCAA baseline. Per-team deltas require per-team game logs (Tier 2).',
    }
  }

  const meta = {
    denominator:      'FGA-based (scoring identity: ppp = FGA_p100 × (2·eFG + ft_pct·ftr))',
    avgFGAp100:       fgaP100,
    unit:             'points of net efficiency per 100 possessions, per event',
    tovAssumption:    'tov_o scale in Barttorvik is non-standard; β_TOV used directly (per-100-poss)',
    orbCreditRate:    ORB_POSSESSION_CREDIT,
    stateModel:       baselineEP ? 'Base + Delta (baseline_epa.json + regression coefficient)' : 'regression-only (no baseline loaded)',
    uncertaintyNote:  'Constrained model zeros ambiguous coefficients; see EPA_MODELS.md for field encoding details',
  }

  return { values: aggregate, states, meta }
}
