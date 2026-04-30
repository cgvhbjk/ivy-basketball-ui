// Unified glossary / data dictionary — shared across all pages
// Each entry: label, definition, calc (calculation method), type ('raw' | 'derived'), group

export const GLOSSARY = {
  // ── Record ──
  win_pct:       { label: 'Win %',              definition: 'Fraction of all games won during the season.',                                                                calc: 'Wins ÷ Total Games',                             type: 'raw',     group: 'Record' },
  conf_win_pct:  { label: 'Conf Win %',         definition: 'Win percentage in Ivy League conference games only.',                                                         calc: 'Conference Wins ÷ Conference Games',              type: 'raw',     group: 'Record' },
  // ── Efficiency ──
  net_efficiency:{ label: 'Net Efficiency',     definition: 'Adjusted offensive minus adjusted defensive efficiency — the primary predictor of team strength.',            calc: 'AdjOE − AdjDE',                                  type: 'derived', group: 'Efficiency' },
  adjoe:         { label: 'Adj Off Efficiency', definition: 'Points scored per 100 possessions, adjusted for opponent quality.',                                           calc: 'Barttorvik pace-adjusted offensive efficiency',   type: 'derived', group: 'Efficiency' },
  adjde:         { label: 'Adj Def Efficiency', definition: 'Points allowed per 100 possessions, adjusted for opponent quality. Lower is better.',                         calc: 'Barttorvik pace-adjusted defensive efficiency',   type: 'derived', group: 'Efficiency' },
  barthag:       { label: 'Predictive Win %',   definition: 'Estimated win probability vs. an average Division I team, derived from net efficiency.',                     calc: 'Logistic transform of net efficiency',            type: 'derived', group: 'Efficiency' },
  // ── Four Factors ──
  efg_o:   { label: 'eFG% (Off)',       definition: 'Effective FG% — weights 3-pointers at 1.5× because they score 50% more points.',                      calc: '(FGM + 0.5 × 3PM) ÷ FGA',                      type: 'derived', group: 'Four Factors' },
  efg_d:   { label: 'eFG% Allowed',    definition: "Opponents' effective FG%. Lower means better perimeter defense.",                                      calc: '(Opp FGM + 0.5 × Opp 3PM) ÷ Opp FGA',         type: 'derived', group: 'Four Factors' },
  tov_o:   { label: 'TOV% (Off)',      definition: 'Turnovers per 100 offensive possessions — measures ball security.',                                    calc: 'TO ÷ (FGA + 0.44 × FTA + TO) × 100',           type: 'derived', group: 'Four Factors' },
  tov_d:   { label: 'TOV% Forced',     definition: 'Opponent turnovers per 100 possessions — measures defensive pressure.',                               calc: 'Opp TO ÷ Opp Possessions × 100',                type: 'derived', group: 'Four Factors' },
  orb:     { label: 'Off Reb %',       definition: 'Share of available offensive rebounds captured. High ORB% extends possessions.',                      calc: 'Off Reb ÷ (Off Reb + Opp Def Reb) × 100',      type: 'derived', group: 'Four Factors' },
  drb:     { label: 'Def Reb %',       definition: 'Share of available defensive rebounds captured.',                                                     calc: 'Def Reb ÷ (Def Reb + Opp Off Reb) × 100',      type: 'derived', group: 'Four Factors' },
  ftr_o:   { label: 'FT Rate (Off)',   definition: 'Free throw attempts per field goal attempt — measures aggressiveness attacking the basket.',           calc: 'FTA ÷ FGA',                                     type: 'raw',     group: 'Four Factors' },
  ftr_d:   { label: 'FT Rate Allowed', definition: "Opponents' FT rate — how often the defense commits fouls.",                                           calc: 'Opp FTA ÷ Opp FGA',                             type: 'raw',     group: 'Four Factors' },
  // ── Shooting ──
  three_pct_o:  { label: '3P% (Off)',       definition: '3-point field goal percentage.',                                                                calc: '3PM ÷ 3PA',            type: 'raw', group: 'Shooting' },
  three_pct_d:  { label: '3P% Allowed',     definition: "Opponents' 3-point percentage.",                                                               calc: 'Opp 3PM ÷ Opp 3PA',    type: 'raw', group: 'Shooting' },
  three_rate_o: { label: '3PA Rate (Off)',   definition: 'Share of FG attempts that are 3-pointers — perimeter orientation.',                           calc: '3PA ÷ FGA',             type: 'raw', group: 'Shooting' },
  two_pct_o:    { label: '2P% (Off)',        definition: '2-point FG percentage — measures inside scoring and mid-range.',                              calc: '2PM ÷ 2PA',             type: 'raw', group: 'Shooting' },
  two_pct_d:    { label: '2P% Allowed',      definition: "Opponents' 2-point percentage — measures interior defense.",                                  calc: 'Opp 2PM ÷ Opp 2PA',    type: 'raw', group: 'Shooting' },
  ft_pct:       { label: 'FT%',              definition: 'Free throw percentage.',                                                                      calc: 'FTM ÷ FTA',             type: 'raw', group: 'Shooting' },
  // ── Team defense counting ──
  blk_d:  { label: 'Block Rate (Def)',  definition: 'Percentage of opponent field goal attempts blocked by the defense. The primary signal for rim protection — values above 11% are elite for Ivy.', calc: 'Blocks ÷ Opp FGA × 100', type: 'derived', group: 'Defense' },
  stl_d:  { label: 'Steal Share (Def)', definition: 'Steals as a percentage of total opponent turnovers forced — what fraction of forced turnovers were live-ball steals vs. dead-ball violations. Higher = more active, pressure-oriented defense.', calc: 'Steals ÷ Opp Turnovers × 100', type: 'derived', group: 'Defense' },
  blk_pg: { label: 'Blocks/G',          definition: 'Blocks recorded by the team per game — raw counting stat.', calc: 'Total blocks ÷ games played', type: 'raw', group: 'Defense' },
  stl_pg: { label: 'Steals/G',          definition: 'Steals recorded by the team per game — raw counting stat.', calc: 'Total steals ÷ games played', type: 'raw', group: 'Defense' },
  // ── Pace ──
  tempo: { label: 'Tempo (poss/40)', definition: 'Possessions per 40 minutes — pace of play.', calc: 'Barttorvik adjusted tempo', type: 'derived', group: 'Pace' },
  // ── Player counting ──
  pts:    { label: 'Points/G',    definition: 'Points scored per game.',               calc: 'Total points ÷ games played',    type: 'raw', group: 'Counting' },
  treb:   { label: 'Rebounds/G',  definition: 'Total rebounds per game.',              calc: 'Total rebounds ÷ games played',  type: 'raw', group: 'Counting' },
  ast:    { label: 'Assists/G',   definition: 'Assists per game.',                     calc: 'Total assists ÷ games played',   type: 'raw', group: 'Counting' },
  stl:    { label: 'Steals/G',    definition: 'Steals per game.',                      calc: 'Total steals ÷ games played',    type: 'raw', group: 'Counting' },
  blk:    { label: 'Blocks/G',    definition: 'Blocks per game.',                      calc: 'Total blocks ÷ games played',    type: 'raw', group: 'Counting' },
  // ── Player efficiency ──
  ortg:   { label: 'Off Rating',      definition: 'Points produced per 100 possessions used, lineup-adjusted by Barttorvik. Captures spacing, screening, and non-box-score contributions.',  calc: 'Barttorvik lineup-adjusted ORTG',  type: 'derived', group: 'Efficiency' },
  drtg:   { label: 'Def Rating',      definition: 'Points allowed per 100 possessions while on floor, lineup-adjusted. Lower is better.',                                                      calc: 'Barttorvik lineup-adjusted DRTG',  type: 'derived', group: 'Efficiency' },
  efg:    { label: 'eFG%',            definition: 'Effective field goal percentage, weighting 3-pointers at 1.5×.',                                                                            calc: '(FGM + 0.5 × 3PM) ÷ FGA',         type: 'derived', group: 'Efficiency' },
  ts_pct: { label: 'True Shooting %', definition: 'Holistic shooting efficiency accounting for 2-pointers, 3-pointers, and free throws.',                                                      calc: 'Pts ÷ (2 × (FGA + 0.44 × FTA)) × 100', type: 'derived', group: 'Efficiency' },
  usg:    { label: 'Usage %',         definition: 'Share of team possessions used while on the floor — how much of the offense runs through this player.',                                     calc: 'Barttorvik usage rate',            type: 'derived', group: 'Efficiency' },
  bpm:    { label: 'BPM',             definition: 'Box Plus/Minus — estimated points contributed per 100 possessions above a league-average player. Positive = above average.',              calc: 'Barttorvik BPM',                   type: 'derived', group: 'Impact' },
  or_pct: { label: 'Off Reb %',       definition: 'Share of available offensive rebounds grabbed by this player while on the floor.',                                                          calc: 'Off Reb ÷ Available Off Reb on floor', type: 'derived', group: 'Counting' },
  ast_pct:{ label: 'Assist %',        definition: 'Share of teammate field goals assisted by this player while on the floor.',                                                                 calc: 'Barttorvik assist rate',           type: 'derived', group: 'Counting' },
  min_pg: { label: 'Min/G',           definition: 'Average minutes played per game — proxy for role and coaching trust.',                                                                     calc: 'Total minutes ÷ games played',     type: 'raw',     group: 'Usage' },
  // ── Physical / biodata ──
  avg_height_in: {
    label: 'Avg Roster Height (in)',
    definition: 'Average height of all rostered players with ≥ 6 min/g, measured in total inches. Playing-time weighted so starters influence the average more.',
    calc: 'Σ(height_in × min_pg) ÷ Σ(min_pg)',
    type: 'derived', group: 'Physical',
  },
  avg_experience: {
    label: 'Avg Experience (yr)',
    definition: 'Average class-year of rostered players (Fr=1, So=2, Jr=3, Sr=4, Grad=5). Playing-time weighted.',
    calc: 'Σ(class_yr_num × min_pg) ÷ Σ(min_pg)',
    type: 'derived', group: 'Physical',
  },
  pct_guards:   { label: '% Guards',    definition: 'Fraction of qualified rostered players classified as guards.',   calc: 'Guards ÷ Total players × 100', type: 'derived', group: 'Roster Composition' },
  pct_forwards: { label: '% Forwards',  definition: 'Fraction of qualified rostered players classified as forwards.', calc: 'Forwards ÷ Total players × 100', type: 'derived', group: 'Roster Composition' },
  pct_bigs:     { label: '% Bigs',      definition: 'Fraction of qualified rostered players classified as bigs/centers.', calc: 'Bigs ÷ Total players × 100', type: 'derived', group: 'Roster Composition' },
  // ── EPA Model ──
  epa_made2fg:   { label: 'EPA: Made 2-pt FG',        definition: 'Expected points added to net efficiency per additional made 2-pointer, holding other four factors constant. Derived from ridge regression coefficient on eFG% scaled to per-possession, per-event units.',  calc: 'β_eFG × (100 ÷ FGA_p100)',    type: 'derived', group: 'EPA' },
  epa_made3fg:   { label: 'EPA: Made 3-pt FG',        definition: 'Expected points added per additional made 3-pointer. Higher than 2FG EPA because a made 3 raises eFG% by 1.5× more than a made 2.',                                                                         calc: 'epa_made2fg × 1.5',            type: 'derived', group: 'EPA' },
  epa_foul_drawn:{ label: 'EPA: Foul Drawn (FT)',      definition: 'Expected points added per additional free-throw opportunity drawn. Captures the value of attacking the basket and drawing contact.',                                                                          calc: 'β_FTR × (100 ÷ FGA_p100)',     type: 'derived', group: 'EPA' },
  epa_forced_tov:{ label: 'EPA: Forced Turnover (def)',definition: 'Expected points gained per opponent turnover forced. Combines transition opportunity value and dead-ball reset value.',                                                                                        calc: 'β_def_TOV (joint model)',       type: 'derived', group: 'EPA' },
  epa_shot_supp: { label: 'EPA: Shot Suppression (def)',definition: 'Expected points saved per unit of opponent eFG% suppressed. Reflects the value of holding opponents to lower-quality shots.',                                                                               calc: '−β_def_eFG × (100 ÷ FGA_p100)',type: 'derived', group: 'EPA' },
  ridge_cv_r2:   { label: 'Ridge CV R²',               definition: 'Leave-one-out cross-validated R² from ridge regression. Measures out-of-sample predictive power — the fraction of variance in net efficiency explained by the four-factor model on unseen data.',            calc: 'LOO-CV on n=32 team-seasons',   type: 'derived', group: 'EPA' },
  // ── Luck ──
  pythagorean_win_pct: { label: 'Pythagorean Win %', definition: 'Expected winning percentage derived from points scored and points allowed per possession. Uses exponent 10, calibrated for college basketball. Teams with large positive luck (actual > expected) tend to regress toward their Pythagorean the following season.', calc: 'PPP¹⁰ ÷ (PPP¹⁰ + OppPPP¹⁰)', type: 'derived', group: 'Luck' },
  record_luck:         { label: 'Record Luck (games)', definition: 'Actual wins minus Pythagorean-expected wins. Positive = team won more games than efficiency predicts (close-game variance, clutch play, or luck). This metric is minimally persistent year-to-year and is a strong regression-to-mean signal.', calc: '(Win% − Pythagorean Win%) × Games', type: 'derived', group: 'Luck' },
  efficiency_luck:     { label: 'Efficiency Luck',     definition: 'Actual net points per possession minus what the four-factor model predicts. Positive residual means a team scored more efficiently than their shot quality, ball security, rebounding, and FTR profile explains. Often reflects unsustainable free-throw luck or opponent quality mismatch.', calc: 'Actual net PPP − Model predicted net PPP', type: 'derived', group: 'Luck' },
}
