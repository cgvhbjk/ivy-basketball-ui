export const SCHOOLS = ['harvard', 'yale', 'penn', 'princeton', 'dartmouth', 'cornell', 'brown', 'columbia']

export const SCHOOL_META = {
  harvard:   { abbr: 'HAR', fullName: 'Harvard Crimson',      color: '#A51C30' },
  yale:      { abbr: 'YAL', fullName: 'Yale Bulldogs',         color: '#00356B' },
  penn:      { abbr: 'PEN', fullName: 'Penn Quakers',          color: '#990000' },
  princeton: { abbr: 'PRI', fullName: 'Princeton Tigers',      color: '#F58025' },
  dartmouth: { abbr: 'DAR', fullName: 'Dartmouth Big Green',   color: '#00693E' },
  cornell:   { abbr: 'COR', fullName: 'Cornell Big Red',       color: '#B31B1B' },
  brown:     { abbr: 'BRO', fullName: 'Brown Bears',           color: '#4E3629' },
  columbia:  { abbr: 'COL', fullName: 'Columbia Lions',        color: '#B9D9EB' },
}

export const SCHOOL_COLORS = Object.fromEntries(
  Object.entries(SCHOOL_META).map(([k, v]) => [k, v.color])
)

// Years with real data from Barttorvik
export const YEARS = [2022, 2023, 2024, 2025]

// ---- Team metric definitions ----
// Used in Comparison Lab and Insights Lab dropdowns
export const TEAM_METRICS = [
  // Record
  { key: 'win_pct',       label: 'Win %',               group: 'Record',     higherBetter: true,  fmt: v => (v * 100).toFixed(1) + '%' },
  { key: 'conf_win_pct',  label: 'Conf Win %',           group: 'Record',     higherBetter: true,  fmt: v => (v * 100).toFixed(1) + '%' },
  { key: 'net_efficiency',label: 'Net Efficiency',        group: 'Efficiency', higherBetter: true,  fmt: v => (v > 0 ? '+' : '') + v.toFixed(1) },
  // Efficiency
  { key: 'adjoe',         label: 'Adj Off Efficiency',   group: 'Efficiency', higherBetter: true,  fmt: v => v.toFixed(1) },
  { key: 'adjde',         label: 'Adj Def Efficiency',   group: 'Efficiency', higherBetter: false, fmt: v => v.toFixed(1) },
  { key: 'barthag',       label: 'Predictive Win %',     group: 'Efficiency', higherBetter: true,  fmt: v => (v * 100).toFixed(1) + '%' },
  // Four Factors — Offense
  { key: 'efg_o',         label: 'eFG% (Off)',           group: 'Four Factors', higherBetter: true,  fmt: v => v.toFixed(1) + '%' },
  { key: 'tov_o',         label: 'TOV% (Off)',           group: 'Four Factors', higherBetter: false, fmt: v => v.toFixed(1) + '%' },
  { key: 'orb',           label: 'Off Reb %',            group: 'Four Factors', higherBetter: true,  fmt: v => v.toFixed(1) + '%' },
  { key: 'ftr_o',         label: 'FT Rate (Off)',        group: 'Four Factors', higherBetter: true,  fmt: v => v.toFixed(1) },
  // Four Factors — Defense
  { key: 'efg_d',         label: 'eFG% Allowed',         group: 'Four Factors', higherBetter: false, fmt: v => v.toFixed(1) + '%' },
  { key: 'tov_d',         label: 'TOV% Forced',          group: 'Four Factors', higherBetter: true,  fmt: v => v.toFixed(1) + '%' },
  { key: 'drb',           label: 'Def Reb %',            group: 'Four Factors', higherBetter: true,  fmt: v => v.toFixed(1) + '%' },
  { key: 'ftr_d',         label: 'FT Rate Allowed',      group: 'Four Factors', higherBetter: false, fmt: v => v.toFixed(1) },
  // Shooting
  { key: 'three_pct_o',   label: '3P% (Off)',            group: 'Shooting', higherBetter: true,  fmt: v => v.toFixed(1) + '%' },
  { key: 'three_pct_d',   label: '3P% Allowed',          group: 'Shooting', higherBetter: false, fmt: v => v.toFixed(1) + '%' },
  { key: 'three_rate_o',  label: '3PA Rate (Off)',        group: 'Shooting', higherBetter: null,  fmt: v => v.toFixed(1) + '%' },
  { key: 'two_pct_o',     label: '2P% (Off)',             group: 'Shooting', higherBetter: true,  fmt: v => v.toFixed(1) + '%' },
  { key: 'two_pct_d',     label: '2P% Allowed',           group: 'Shooting', higherBetter: false, fmt: v => v.toFixed(1) + '%' },
  { key: 'ft_pct',        label: 'FT%',                   group: 'Shooting', higherBetter: true,  fmt: v => v.toFixed(1) + '%' },
  // Pace
  { key: 'tempo',         label: 'Tempo (poss/40)',       group: 'Pace', higherBetter: null,  fmt: v => v.toFixed(1) },
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
