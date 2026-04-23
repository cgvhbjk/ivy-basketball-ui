/**
 * fetch-data.mjs — pull real Barttorvik data for Ivy League basketball
 *
 * Run with: node scripts/fetch-data.mjs
 * Output:   src/data/teamSeasons.json
 *           src/data/players.json
 *
 * Data sources:
 *   Team stats:   https://barttorvik.com/teamslicejson.php?year=Y&json=1&type=R
 *   Team results: https://barttorvik.com/Y_team_results.json  (conf + W-L detail)
 *   Player stats: https://barttorvik.com/getadvstats.php?year=Y
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dir, '../src/data')

mkdirSync(OUT_DIR, { recursive: true })

// Fetch years — 2021 through 2025; skip 2020 (COVID cancellation)
const YEARS = [2021, 2022, 2023, 2024, 2025]

const IVY_TEAMS = new Set([
  'Harvard', 'Yale', 'Penn', 'Princeton',
  'Dartmouth', 'Cornell', 'Brown', 'Columbia',
])

// ---------- helpers ----------

async function fetchJson(url) {
  console.log(`  GET ${url}`)
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; research-tool/1.0)',
      'Accept': 'application/json, text/plain, */*',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  const text = await res.text()
  return JSON.parse(text)
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

// ---------- team slice field mapping ----------
// From barttorvik.com/teamslicejson.php?year=Y&json=1&type=R
// Each row is an array: [team, adjoe, adjde, barthag, record, wins, games,
//   efg_o, efg_d, tov_o, tov_d, orb, drb, ftr_o, ftr_d,
//   ft_pct, two_pct_o, two_pct_d, three_pct_o, three_pct_d,
//   blk_o, blk_d, stl_o, stl_d, three_rate_o, three_rate_d, tempo]
function parseTeamSlice(row, year) {
  const [team, adjoe, adjde, barthag, record, wins, games,
    efg_o, efg_d, tov_o, tov_d, orb, drb, ftr_o, ftr_d,
    ft_pct, two_pct_o, two_pct_d, three_pct_o, three_pct_d,
    blk_o, blk_d, stl_o, stl_d, three_rate_o, three_rate_d, tempo] = row

  if (!IVY_TEAMS.has(team)) return null

  const w = Number(wins)
  const g = Number(games)
  const losses = g - w

  return {
    school: team.toLowerCase(),
    year,
    // record
    wins: w,
    losses,
    games: g,
    win_pct: g > 0 ? parseFloat((w / g).toFixed(3)) : 0,
    record,
    // adjusted efficiency (per 100 possessions, opponent-adjusted)
    adjoe: parseFloat(Number(adjoe).toFixed(2)),
    adjde: parseFloat(Number(adjde).toFixed(2)),
    net_efficiency: parseFloat((Number(adjoe) - Number(adjde)).toFixed(2)),
    // predictive win% (Barttorvik's pythagorean)
    barthag: parseFloat(Number(barthag).toFixed(4)),
    // four factors — offense
    efg_o: parseFloat(Number(efg_o).toFixed(1)),
    tov_o: parseFloat(Number(tov_o).toFixed(1)),
    orb:   parseFloat(Number(orb).toFixed(1)),
    ftr_o: parseFloat(Number(ftr_o).toFixed(1)),
    // four factors — defense
    efg_d:  parseFloat(Number(efg_d).toFixed(1)),
    tov_d:  parseFloat(Number(tov_d).toFixed(1)),
    drb:    parseFloat(Number(drb).toFixed(1)),
    ftr_d:  parseFloat(Number(ftr_d).toFixed(1)),
    // shooting breakdown
    ft_pct:      parseFloat(Number(ft_pct).toFixed(1)),
    two_pct_o:   parseFloat(Number(two_pct_o).toFixed(1)),
    two_pct_d:   parseFloat(Number(two_pct_d).toFixed(1)),
    three_pct_o: parseFloat(Number(three_pct_o).toFixed(1)),
    three_pct_d: parseFloat(Number(three_pct_d).toFixed(1)),
    three_rate_o: parseFloat(Number(three_rate_o).toFixed(1)),
    three_rate_d: parseFloat(Number(three_rate_d).toFixed(1)),
    blk_o: parseFloat(Number(blk_o).toFixed(1)),
    blk_d: parseFloat(Number(blk_d).toFixed(1)),
    stl_o: parseFloat(Number(stl_o).toFixed(1)),
    stl_d: parseFloat(Number(stl_d).toFixed(1)),
    // pace
    tempo: parseFloat(Number(tempo).toFixed(1)),
  }
}

// ---------- team results field mapping ----------
// From barttorvik.com/Y_team_results.json
// Row: [rank, team, conf, record, adjoe, adjoe_rank, adjde, adjde_rank,
//       barthag, barthag_rank, wins, losses, conf_wins, conf_losses, conf_record, ...]
function parseTeamResults(row) {
  const [rank, team, conf, record, adjoe, , adjde, , barthag, ,
    wins, losses, conf_wins, conf_losses, conf_record] = row
  if (conf !== 'Ivy') return null
  return {
    school: team.toLowerCase(),
    rank: Number(rank),
    conf_wins: Number(conf_wins),
    conf_losses: Number(conf_losses),
    conf_record: conf_record ?? null,
    conf_win_pct: (Number(conf_wins) + Number(conf_losses)) > 0
      ? parseFloat((Number(conf_wins) / (Number(conf_wins) + Number(conf_losses))).toFixed(3))
      : 0,
  }
}

// ---------- player field mapping ----------
// From barttorvik.com/getadvstats.php?year=Y
// Verified against raw response (67 fields per player):
//  0:name  1:team  2:conf  3:gp  4:min_pct(0-100)  5:ortg  6:usg
//  7:efg(pct)  8:ts_pct(pct)  9:fgm_p40  10:fga_p40
//  11:2pm_p40  12:2pa_p40  13:3pa_rate  14:ftr  15:ft_pct(decimal)
//  16:or_pct  17:dr_pct  18:ast_pct  19:tov_pct  20:blk_pct  21:stl_pct
//  22:ftr_alt  23:?  24:?  25:class_yr  26:height  27:num
//  28:porpag  29:adjoe  30:pfr  31:year  32:pid  33:hometown
//  34:rec_rank  35:?  36:rimmade  37:rimatt  38:midmade  39:midatt
//  40:rimmadepct  41:midmadepct  42:dunksmade  43:dunksatt  44:dunkspct
//  45:null  46:drtg  47:adrtg  48:bpm  49:?  50:dbpm
//  51:?  52:?  53:?  54:min_pg(actual min/g)
//  55:oreb_above_avg  56:dreb_above_avg
//  57:oreb_pg  58:dreb_pg  59:treb_pg  60:ast_pg  61:stl_pg  62:blk_pg  63:pts_pg
//  64:pos_type  65:war  66:birthdate
const IVY_TEAM_NAMES = new Set([
  'Harvard', 'Yale', 'Penn', 'Princeton',
  'Dartmouth', 'Cornell', 'Brown', 'Columbia',
])

function parsePlayer(row, year) {
  if (!Array.isArray(row) || row.length < 64) return null
  const team = row[1]
  const conf = row[2]
  if (conf !== 'Ivy' && !IVY_TEAM_NAMES.has(team)) return null

  const gp = Number(row[3])
  if (gp < 5) return null

  return {
    name:      row[0],
    team,
    school:    team.toLowerCase(),
    conf,
    year,
    class_yr:  row[25],           // "Fr", "So", "Jr", "Sr"
    height:    row[26],            // "6-6" format
    hometown:  row[33] ?? null,
    pos_type:  row[64] ?? null,    // "Wing G", "Wing F", "PG", etc.
    gp,
    min_pg:    parseFloat(Number(row[54]).toFixed(1)),   // actual minutes per game
    min_pct:   parseFloat(Number(row[4]).toFixed(1)),    // % of team minutes (0-100)
    // efficiency metrics
    ortg:      parseFloat(Number(row[5]).toFixed(1)),
    drtg:      parseFloat(Number(row[46]).toFixed(1)),
    usg:       parseFloat(Number(row[6]).toFixed(1)),
    bpm:       parseFloat(Number(row[48]).toFixed(2)),
    dbpm:      parseFloat(Number(row[50]).toFixed(2)),
    // shooting
    efg:       parseFloat(Number(row[7]).toFixed(1)),    // eFG%
    ts_pct:    parseFloat(Number(row[8]).toFixed(1)),    // true shooting %
    ft_pct:    parseFloat((Number(row[15]) * 100).toFixed(1)),  // stored as decimal → convert
    ftr:       parseFloat(Number(row[14]).toFixed(1)),   // FT rate (FTA per 100 FGA)
    three_rate: parseFloat(Number(row[13]).toFixed(1)),  // 3PA as % of total FGA
    // possession-rate stats
    or_pct:    parseFloat(Number(row[16]).toFixed(1)),
    dr_pct:    parseFloat(Number(row[17]).toFixed(1)),
    ast_pct:   parseFloat(Number(row[18]).toFixed(1)),
    tov_pct:   parseFloat(Number(row[19]).toFixed(1)),
    blk_pct:   parseFloat(Number(row[20]).toFixed(1)),
    stl_pct:   parseFloat(Number(row[21]).toFixed(1)),
    // per-game counting stats
    pts:       parseFloat(Number(row[63]).toFixed(1)),
    treb:      parseFloat(Number(row[59]).toFixed(1)),
    oreb:      parseFloat(Number(row[57]).toFixed(1)),
    dreb:      parseFloat(Number(row[58]).toFixed(1)),
    ast:       parseFloat(Number(row[60]).toFixed(1)),
    stl:       parseFloat(Number(row[61]).toFixed(1)),
    blk:       parseFloat(Number(row[62]).toFixed(1)),
    // shot zone percentages (rim / mid-range)
    rim_pct:   row[40] != null ? parseFloat(Number(row[40]).toFixed(3)) : null,
    mid_pct:   row[41] != null ? parseFloat(Number(row[41]).toFixed(3)) : null,
  }
}

// ---------- main ----------

async function main() {
  const teamSeasons = []
  const players = []

  // --- pull team data year by year ---
  for (const year of YEARS) {
    console.log(`\nYear ${year}:`)

    // team slice (four factors + efficiency)
    let sliceRows = []
    try {
      sliceRows = await fetchJson(
        `https://barttorvik.com/teamslicejson.php?year=${year}&json=1&type=R`
      )
    } catch (e) {
      console.warn(`  teamslicejson failed for ${year}: ${e.message}`)
    }

    // team results (conf record + rank)
    let resultsMap = {}
    try {
      const resultsRows = await fetchJson(
        `https://barttorvik.com/${year}_team_results.json`
      )
      for (const row of resultsRows) {
        const parsed = parseTeamResults(row)
        if (parsed) resultsMap[parsed.school] = parsed
      }
    } catch (e) {
      console.warn(`  team_results failed for ${year}: ${e.message}`)
    }

    // merge
    for (const row of sliceRows) {
      const season = parseTeamSlice(row, year)
      if (!season) continue
      const extra = resultsMap[season.school] ?? {}
      teamSeasons.push({
        ...season,
        rank:          extra.rank ?? null,
        conf_wins:     extra.conf_wins ?? null,
        conf_losses:   extra.conf_losses ?? null,
        conf_record:   extra.conf_record ?? null,
        conf_win_pct:  extra.conf_win_pct ?? null,
      })
      console.log(`  ${season.school} ${year}: ${season.wins}-${season.losses}, adjoe=${season.adjoe}, adjde=${season.adjde}`)
    }

    await sleep(400)

    // --- pull player data ---
    try {
      const playerRows = await fetchJson(
        `https://barttorvik.com/getadvstats.php?year=${year}`
      )
      let ivyCount = 0
      for (const row of playerRows) {
        const p = parsePlayer(row, year)
        if (p) { players.push(p); ivyCount++ }
      }
      console.log(`  players: ${ivyCount} Ivy League players found`)
    } catch (e) {
      console.warn(`  getadvstats failed for ${year}: ${e.message}`)
    }

    await sleep(600)
  }

  // --- write output ---
  writeFileSync(
    join(OUT_DIR, 'teamSeasons.json'),
    JSON.stringify(teamSeasons, null, 2)
  )
  console.log(`\nWrote ${teamSeasons.length} team-seasons to src/data/teamSeasons.json`)

  writeFileSync(
    join(OUT_DIR, 'players.json'),
    JSON.stringify(players, null, 2)
  )
  console.log(`Wrote ${players.length} player records to src/data/players.json`)

  // sanity check
  const schools = [...new Set(teamSeasons.map(s => s.school))].sort()
  console.log(`\nTeams found: ${schools.join(', ')}`)
  const yearsCovered = [...new Set(teamSeasons.map(s => s.year))].sort()
  console.log(`Years covered: ${yearsCovered.join(', ')}`)
}

main().catch(err => { console.error(err); process.exit(1) })
