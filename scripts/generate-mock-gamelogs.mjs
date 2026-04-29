// Generates synthetic Ivy League game-log data for EPA Lab POC
// Run: node scripts/generate-mock-gamelogs.mjs

import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const SCHOOLS = ['princeton', 'yale', 'harvard', 'columbia', 'penn', 'brown', 'dartmouth', 'cornell']
const NON_IVY = ['Georgetown', 'St. Johns', 'Fordham', 'Seton Hall', 'Rutgers', 'Drexel', 'Temple', 'Villanova']
const LOCATIONS = ['home', 'away', 'neutral']
const YEARS = [2022, 2023, 2024, 2025]

function rand(min, max) { return min + Math.random() * (max - min) }
function randInt(min, max) { return Math.floor(rand(min, max + 1)) }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)) }

function generateTeamStats() {
  const fga = randInt(44, 60)
  const fg3a = Math.floor(fga * rand(0.30, 0.45))
  const fg3m = Math.floor(fg3a * rand(0.30, 0.40))
  const fg2a = fga - fg3a
  const fg2m = Math.floor(fg2a * rand(0.38, 0.56))
  const fgm  = clamp(fg2m + fg3m, 0, fga)
  const fta  = randInt(10, 22)
  const ftm  = Math.floor(fta * rand(0.68, 0.80))
  const orb  = randInt(6, 14)
  const drb  = randInt(18, 28)
  const ast  = randInt(10, 18)
  const tov  = randInt(9, 17)
  const stl  = randInt(4, 10)
  const blk  = randInt(2, 6)
  // pts = 2*(fgm-fg3m) + 3*fg3m + ftm = 2*fgm + fg3m + ftm
  const pts  = (fgm - fg3m) * 2 + fg3m * 3 + ftm
  return { pts, fgm, fga, fg3m, fg3a, ftm, fta, orb, drb, ast, tov, stl, blk }
}

const rows = []
for (let i = 0; i < 80; i++) {
  const school = SCHOOLS[i % SCHOOLS.length]
  const year   = YEARS[Math.floor(i / 20)]
  const isIvy  = Math.random() < 0.40
  const opponent = isIvy
    ? SCHOOLS.filter(s => s !== school)[randInt(0, 6)]
    : NON_IVY[randInt(0, NON_IVY.length - 1)]

  const month = randInt(11, 12)
  const day   = randInt(1, 28)
  const date  = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  const team = generateTeamStats()
  const opp  = generateTeamStats()

  rows.push({
    school,
    year,
    date,
    opponent,
    is_ivy_opponent: isIvy,
    location: LOCATIONS[randInt(0, 2)],
    pts:      team.pts,
    fgm:      team.fgm,
    fga:      team.fga,
    fg3m:     team.fg3m,
    fg3a:     team.fg3a,
    ftm:      team.ftm,
    fta:      team.fta,
    orb:      team.orb,
    drb:      team.drb,
    ast:      team.ast,
    tov:      team.tov,
    stl:      team.stl,
    blk:      team.blk,
    opp_pts:  opp.pts,
    opp_fgm:  opp.fgm,
    opp_fga:  opp.fga,
    opp_fg3m: opp.fg3m,
    opp_fg3a: opp.fg3a,
    opp_ftm:  opp.ftm,
    opp_fta:  opp.fta,
    opp_orb:  opp.orb,
    opp_drb:  opp.drb,
    opp_ast:  opp.ast,
    opp_tov:  opp.tov,
    opp_stl:  opp.stl,
    opp_blk:  opp.blk,
  })
}

const outPath = join(__dirname, '..', 'src', 'data', 'gameLogs.json')
writeFileSync(outPath, JSON.stringify(rows, null, 2))
console.log(`Wrote ${rows.length} rows to ${outPath}`)
