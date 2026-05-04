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

// Sign constraints — empirically locked from the Phase-0 encoding audit.
// See `encodingAudit.js` and the unit test in `__tests__/encodingAudit.test.js`.
// Barttorvik's slice-JSON delivers `tov_o`, `tov_d`, `orb` with non-standard
// directional encoding (likely percentile-rank-where-higher-is-better for the
// TOV columns; `orb` is opposite-sign to textbook). Rather than guess from
// the label, we fit a four-factor OLS once at audit time and lock in the
// observed partial signs. The audit re-runs in CI; if a data refresh ever
// changes these signs, the test fails loudly instead of silently producing
// wrong-sign EPA coefficients.

// Joint-model sign constraints, predicting net efficiency = ppp − opp_ppp.
// Defensive coefficients flip relative to the split DEFENSE model because
// `−opp_ppp` reverses their effect on net.
export const SIGN_CONSTRAINTS = {
  off_eFG:  1,
  off_TOV:  1,   // verified empirically (β=+0.55 on standardized X)
  off_ORB: -1,   // verified empirically (β=-2.63)
  off_FTR:  1,
  def_eFG: -1,
  def_TOV: -1,   // empirically near-zero (β=+0.07); kept at theoretical sign — see audit warning
  def_ORB:  1,   // own DRB% helps net (high drb → low adjde → high net)
  def_FTR: -1,
}

// Split OFFENSE model — predicts ppp (higher is better).
export const SIGN_CONSTRAINTS_OFF = {
  off_eFG:  1,
  off_TOV:  1,   // verified empirically (β=+0.55)
  off_ORB: -1,   // verified empirically (β=-2.63) — `orb` is encoded opposite to textbook ORB%
  off_FTR:  1,
}

// Split DEFENSE model — predicts opp_ppp (higher is WORSE for the defending team).
export const SIGN_CONSTRAINTS_DEF = {
  def_eFG:  1,
  def_TOV:  1,   // empirically near-zero (β=+0.07); audit-recommended sign retained — flagged as low-confidence
  def_ORB: -1,   // verified empirically (β=-2.42) — own DRB% reduces opp scoring
  def_FTR:  1,
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

// Sub-factor feature flag.
// When enabled, splits aggregate four factors into live/dead and putback/reset.
// Requires additional columns in teamSeasons.json (not yet available from Barttorvik).
// With Ridge regularization the model handles 12 predictors fine once data exists.
export const SUBFACTORS = {
  enabled: false,   // flip to true once data columns are available
  available: false, // set to true when teamSeasons.json includes these fields

  // Column names expected in the data when enabled
  columns: {
    off_LiveTOV:     null,   // live-ball turnover rate — not yet in data
    off_DeadTOV:     null,   // dead-ball turnover rate — not yet in data
    off_ORB_putback: null,   // putback offensive rebound rate — not yet in data
    off_ORB_reset:   null,   // reset offensive rebound rate — not yet in data
  },

  // These replace the current off_TOV and off_ORB in the feature matrix when enabled
  replaces: {
    off_TOV: ['off_LiveTOV', 'off_DeadTOV'],
    off_ORB: ['off_ORB_putback', 'off_ORB_reset'],
  },
}

// Model display metadata for the UI
export const MODEL_LABELS = {
  ols_joint:        'OLS (joint 8-predictor)',
  ridge_joint:      'Ridge (joint, CV α)',
  ridge_split:      'Ridge Split (off+def, CV α)',
  constrained_ols:  'Constrained OLS (sign-enforced)',
}
