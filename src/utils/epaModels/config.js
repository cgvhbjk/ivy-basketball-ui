// Central configuration for the EPA modeling system.
// Change model behavior here — not in individual files.

// teamSeasons.json column → model feature name mapping
export const FIELD_MAP = {
  // Four-factor offensive predictors
  off_eFG: 'efg_o',
  off_TOV: 'tov_o',
  off_ORB: 'orb',
  off_FTR: 'ftr_o',
  // Four-factor defensive predictors
  def_eFG: 'efg_d',
  def_TOV: 'tov_d',
  def_ORB: 'drb',
  def_FTR: 'ftr_d',
  // Efficiency targets
  adjOE:    'adjoe',
  adjDE:    'adjde',
  rawOE:    'ppp',
  rawDE:    'opp_ppp',
  netAdj:   'net_efficiency',
  netRaw:   'net_ppp',
  ftPct:    'ft_pct',
}

// Sign constraints for the JOINT model (predicting net efficiency = ppp - opp_ppp).
// +1 = must be positive, -1 = must be negative, 0 = unconstrained.
export const SIGN_CONSTRAINTS = {
  off_eFG:  1,   // better shooting → better net eff
  off_TOV: -1,   // more turnovers → worse net eff
  off_ORB:  1,   // more offensive boards → better net eff
  off_FTR:  1,   // drawing fouls → better net eff
  def_eFG: -1,   // opponent shoots better → worse net eff
  def_TOV:  1,   // opponent turns it over more → better net eff
  def_ORB: -1,   // opponent gets more offensive boards → worse net eff
  def_FTR: -1,   // opponent draws more fouls → worse net eff
}

// Sign constraints for the SPLIT OFFENSE model (predicting ppp — higher is better).
export const SIGN_CONSTRAINTS_OFF = {
  off_eFG:  1,   // better shooting → more points
  off_TOV: -1,   // more turnovers → fewer points
  off_ORB:  1,   // more offensive boards → more possessions → more points
  off_FTR:  1,   // drawing fouls → more points
}

// Sign constraints for the SPLIT DEFENSE model (predicting opp_ppp — higher is WORSE).
// Opponent's own offensive factors naturally increase their scoring.
export const SIGN_CONSTRAINTS_DEF = {
  def_eFG:  1,   // opponent shoots better → opponent scores more
  def_TOV: -1,   // opponent turns it over more → opponent scores less
  def_ORB:  1,   // opponent gets more offensive boards → opponent scores more
  def_FTR:  1,   // opponent draws more fouls → opponent scores more
}

// Default pipeline configuration
export const DEFAULT_CONFIG = {
  // 'raw': use ppp/opp_ppp targets (no adjusted/raw mismatch)
  // 'adjusted': use adjoe/adjde targets (logs mismatch warning)
  targetMode: 'raw',

  // Default model: 'ridge_split' — separate off/def ridge models with LOO-CV alpha
  // Alternatives: 'ols_joint', 'ridge_joint', 'constrained_ols'
  preferredModel: 'ridge_split',

  ridge: {
    // Candidate alpha values for LOO-CV grid search
    alphas: [0.001, 0.01, 0.1, 1, 10, 100, 1000],
    // 'loo' = leave-one-out (best for n=32), or an integer k for k-fold
    cvFolds: 'loo',
    standardize: true,
  },

  interactions: {
    // Never enable by default with n=32 — increases predictor count
    enabled: false,
    terms: [['off_eFG', 'off_TOV'], ['def_eFG', 'def_TOV'], ['off_eFG', 'off_ORB']],
  },

  diagnostics: {
    vifWarnThreshold:  5,
    vifErrorThreshold: 10,
    minObsPerPredictor: 10,
  },
}

// Named constants — no magic numbers elsewhere
export const POSSESSION_VALUE_SCALE = 100  // everything is per 100 possessions
export const ORB_POSSESSION_CREDIT  = 0.85  // offensive rebound gives ~85% of a full possession
export const THREE_PT_eFG_MULTIPLIER = 1.5  // 3FG worth 1.5× a 2FG in eFG terms

// Model display metadata for the UI
export const MODEL_LABELS = {
  ols_joint:        'OLS (joint 8-predictor)',
  ridge_joint:      'Ridge (joint, CV α)',
  ridge_split:      'Ridge Split (off+def, CV α)',
  constrained_ols:  'Constrained OLS (sign-enforced)',
}
