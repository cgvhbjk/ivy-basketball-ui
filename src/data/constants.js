export const SCHOOLS = ['harvard', 'yale', 'penn', 'princeton', 'dartmouth', 'cornell', 'brown', 'columbia']

export const SCHOOL_META = {
  harvard:   { abbr: 'HAR', fullName: 'Harvard Crimson',      color: '#D44F5C' },
  yale:      { abbr: 'YAL', fullName: 'Yale Bulldogs',         color: '#2878C7' },
  penn:      { abbr: 'PEN', fullName: 'Penn Quakers',          color: '#CC2222' },
  princeton: { abbr: 'PRI', fullName: 'Princeton Tigers',      color: '#F58025' },
  dartmouth: { abbr: 'DAR', fullName: 'Dartmouth Big Green',   color: '#0DAF68' },
  cornell:   { abbr: 'COR', fullName: 'Cornell Big Red',       color: '#D63B3B' },
  brown:     { abbr: 'BRO', fullName: 'Brown Bears',           color: '#7D5643' },
  columbia:  { abbr: 'COL', fullName: 'Columbia Lions',        color: '#B9D9EB' },
}

export const SCHOOL_COLORS = Object.fromEntries(
  Object.entries(SCHOOL_META).map(([k, v]) => [k, v.color])
)

// Years with real data from Barttorvik
export const YEARS = [2022, 2023, 2024, 2025]

// ---- Team metric definitions ----
// Groups are ordered top-to-bottom by how directly they answer "how good is this team?"
// Insertion order = display order in dropdowns and metric browser.
export const TEAM_METRICS = [
  // ── Outcomes ───────────────────────────────────────────────────────────────
  { key: 'win_pct',       label: 'Win %',              group: 'Outcomes', higherBetter: true,  fmt: v => (v * 100).toFixed(1) + '%' },
  { key: 'conf_win_pct',  label: 'Conf Win %',          group: 'Outcomes', higherBetter: true,  fmt: v => (v * 100).toFixed(1) + '%' },
  { key: 'barthag',       label: 'Predictive Win %',    group: 'Outcomes', higherBetter: true,  fmt: v => (v * 100).toFixed(1) + '%' },

  // ── Efficiency ─────────────────────────────────────────────────────────────
  { key: 'adjoe',         label: 'Adj. Off. Efficiency', group: 'Efficiency', higherBetter: true,  fmt: v => v.toFixed(1) },
  { key: 'adjde',         label: 'Adj. Def. Efficiency', group: 'Efficiency', higherBetter: false, fmt: v => v.toFixed(1) },
  { key: 'net_efficiency',label: 'Net Efficiency',        group: 'Efficiency', higherBetter: true,  fmt: v => (v > 0 ? '+' : '') + v.toFixed(1) },
  { key: 'ppp',           label: 'Points Per 100 Poss',  group: 'Efficiency', higherBetter: true,  fmt: v => v.toFixed(2) },
  { key: 'opp_ppp',       label: 'Opp Points Per 100',   group: 'Efficiency', higherBetter: false, fmt: v => v.toFixed(2) },
  { key: 'net_ppp',       label: 'Net PPP',               group: 'Efficiency', higherBetter: true,  fmt: v => (v > 0 ? '+' : '') + v.toFixed(2) },

  // ── Scoring ────────────────────────────────────────────────────────────────
  { key: 'pts_pg',        label: 'Points/G',             group: 'Scoring', higherBetter: true,  fmt: v => v.toFixed(1) },
  { key: 'opp_pts_pg',    label: 'Opp Points/G',         group: 'Scoring', higherBetter: false, fmt: v => v.toFixed(1) },

  // ── Offensive Four Factors ─────────────────────────────────────────────────
  { key: 'efg_o',         label: 'eFG% (Off)',           group: 'Off. Four Factors', higherBetter: true,  fmt: v => v.toFixed(1) + '%' },
  { key: 'tov_o',         label: 'Turnover % (Off)',     group: 'Off. Four Factors', higherBetter: false, fmt: v => v.toFixed(1) + '%' },
  { key: 'orb',           label: 'Off. Rebound %',       group: 'Off. Four Factors', higherBetter: true,  fmt: v => v.toFixed(1) + '%' },
  { key: 'ftr_o',         label: 'FT Rate (Off)',        group: 'Off. Four Factors', higherBetter: true,  fmt: v => v.toFixed(1) },

  // ── Defensive Four Factors ─────────────────────────────────────────────────
  { key: 'efg_d',         label: 'eFG% Allowed',         group: 'Def. Four Factors', higherBetter: false, fmt: v => v.toFixed(1) + '%' },
  { key: 'tov_d',         label: 'Turnover % Forced',    group: 'Def. Four Factors', higherBetter: true,  fmt: v => v.toFixed(1) + '%' },
  { key: 'drb',           label: 'Def. Rebound %',       group: 'Def. Four Factors', higherBetter: true,  fmt: v => v.toFixed(1) + '%' },
  { key: 'ftr_d',         label: 'FT Rate Allowed',      group: 'Def. Four Factors', higherBetter: false, fmt: v => v.toFixed(1) },

  // ── Shooting ───────────────────────────────────────────────────────────────
  { key: 'three_pct_o',   label: '3P% (Off)',            group: 'Shooting', higherBetter: true,  fmt: v => v.toFixed(1) + '%' },
  { key: 'three_pct_d',   label: '3P% Allowed',          group: 'Shooting', higherBetter: false, fmt: v => v.toFixed(1) + '%' },
  { key: 'three_rate_o',  label: '3-Point Attempt Rate', group: 'Shooting', higherBetter: null,  fmt: v => v.toFixed(1) + '%' },
  { key: 'two_pct_o',     label: '2P% (Off)',            group: 'Shooting', higherBetter: true,  fmt: v => v.toFixed(1) + '%' },
  { key: 'two_pct_d',     label: '2P% Allowed',          group: 'Shooting', higherBetter: false, fmt: v => v.toFixed(1) + '%' },
  { key: 'ft_pct',        label: 'Free Throw %',         group: 'Shooting', higherBetter: true,  fmt: v => v.toFixed(1) + '%' },

  // ── Rebounding ─────────────────────────────────────────────────────────────
  { key: 'reb_margin',    label: 'Rebound Margin',       group: 'Rebounding', higherBetter: true,  fmt: v => (v > 0 ? '+' : '') + v.toFixed(1) },
  { key: 'trb_pg',        label: 'Rebounds/G',           group: 'Rebounding', higherBetter: true,  fmt: v => v.toFixed(1) },
  { key: 'opp_trb_pg',    label: 'Opp Rebounds/G',       group: 'Rebounding', higherBetter: false, fmt: v => v.toFixed(1) },

  // ── Playmaking ─────────────────────────────────────────────────────────────
  { key: 'ast_pg',        label: 'Assists/G',            group: 'Playmaking', higherBetter: true,  fmt: v => v.toFixed(1) },
  { key: 'tov_pg',        label: 'Turnovers/G',          group: 'Playmaking', higherBetter: false, fmt: v => v.toFixed(1) },
  { key: 'ast_to_ratio',  label: 'Assist / TO Ratio',    group: 'Playmaking', higherBetter: true,  fmt: v => v.toFixed(2) },

  // ── Defense ────────────────────────────────────────────────────────────────
  { key: 'stl_pg',        label: 'Steals/G',             group: 'Defense', higherBetter: true,  fmt: v => v.toFixed(1) },
  { key: 'blk_pg',        label: 'Blocks/G',             group: 'Defense', higherBetter: true,  fmt: v => v.toFixed(1) },

  // ── Pace ───────────────────────────────────────────────────────────────────
  { key: 'tempo',         label: 'Tempo (poss/40 min)',  group: 'Pace', higherBetter: null, fmt: v => v.toFixed(1) },
]

export const TEAM_METRIC_MAP = Object.fromEntries(TEAM_METRICS.map(m => [m.key, m]))

// ---- Player metric definitions ----
export const PLAYER_METRICS = [
  { key: 'pts',     label: 'Points/G',          higherBetter: true,  fmt: v => v.toFixed(1) },
  { key: 'treb',    label: 'Rebounds/G',         higherBetter: true,  fmt: v => v.toFixed(1) },
  { key: 'ast',     label: 'Assists/G',          higherBetter: true,  fmt: v => v.toFixed(1) },
  { key: 'stl',     label: 'Steals/G',           higherBetter: true,  fmt: v => v.toFixed(1) },
  { key: 'blk',     label: 'Blocks/G',           higherBetter: true,  fmt: v => v.toFixed(1) },
  { key: 'ortg',    label: 'Off Rating',         higherBetter: true,  fmt: v => v.toFixed(1) },
  { key: 'drtg',    label: 'Def Rating',         higherBetter: false, fmt: v => v.toFixed(1) },
  { key: 'usg',     label: 'Usage %',            higherBetter: null,  fmt: v => v.toFixed(1) + '%' },
  { key: 'bpm',     label: 'BPM',                higherBetter: true,  fmt: v => (v > 0 ? '+' : '') + v.toFixed(2) },
  { key: 'efg',     label: 'eFG%',               higherBetter: true,  fmt: v => v.toFixed(1) + '%' },
  { key: 'ts_pct',  label: 'True Shooting %',    higherBetter: true,  fmt: v => v.toFixed(1) + '%' },
  { key: 'ft_pct',  label: 'FT%',                higherBetter: true,  fmt: v => v.toFixed(1) + '%' },
  { key: 'min_pg',  label: 'Min/G',              higherBetter: null,  fmt: v => v.toFixed(1) },
  { key: 'or_pct',  label: 'Off Reb %',          higherBetter: true,  fmt: v => v.toFixed(1) + '%' },
  { key: 'ast_pct', label: 'Assist %',           higherBetter: true,  fmt: v => v.toFixed(1) + '%' },
]

export const PLAYER_METRIC_MAP = Object.fromEntries(PLAYER_METRICS.map(m => [m.key, m]))
