/**
 * fetch-d1-data.mjs — pull D1-wide four-factor data from Barttorvik.
 *
 * Companion to fetch-data.mjs (which is Ivy-only). Used to produce a global
 * training set for EPA coefficient fitting — n grows from 32 (Ivy only) to
 * ~350 schools × 4 years ≈ 1400, which dissolves the TOV/ORB collinearity
 * that forces the constrained model on the Ivy-only fit.
 *
 * Run:    npm run fetch-d1
 * Output: src/data/d1TeamSeasons.json
 *
 * Schema is a strict subset of teamSeasons.json: only the columns the EPA
 * pipeline actually consumes, plus identification fields. We intentionally
 * skip player data and conference records — those are Ivy-specific and not
 * needed to fit league-wide four-factor coefficients.
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir   = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dir, '../src/data')
mkdirSync(OUT_DIR, { recursive: true })

const YEARS = [2022, 2023, 2024, 2025]

async function fetchJson(url) {
  console.log(`  GET ${url}`)
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; research-tool/1.0)',
      'Accept': 'application/json, text/plain, */*',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return JSON.parse(await res.text())
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// teamslicejson row shape — see fetch-data.mjs:51-60 for the canonical schema.
function parseSliceRow(row, year) {
  const [team, adjoe, adjde, barthag, record, wins, games,
    efg_o, efg_d, tov_o, tov_d, orb, drb, ftr_o, ftr_d,
    ft_pct, two_pct_o, two_pct_d, three_pct_o, three_pct_d,
    blk_o, blk_d, stl_o, stl_d, three_rate_o, three_rate_d, tempo] = row

  const w = Number(wins)
  const g = Number(games)
  if (!Number.isFinite(g) || g === 0) return null

  return {
    school:        team,                                 // raw casing (no lowercase) — used for identification only
    year,
    games:         g,
    wins:          w,
    losses:        g - w,
    win_pct:       parseFloat((w / g).toFixed(3)),
    record,
    adjoe:         parseFloat(Number(adjoe).toFixed(2)),
    adjde:         parseFloat(Number(adjde).toFixed(2)),
    net_efficiency: parseFloat((Number(adjoe) - Number(adjde)).toFixed(2)),
    barthag:       parseFloat(Number(barthag).toFixed(4)),
    // four factors — offense
    efg_o: parseFloat(Number(efg_o).toFixed(1)),
    tov_o: parseFloat(Number(tov_o).toFixed(1)),
    orb:   parseFloat(Number(orb).toFixed(1)),
    ftr_o: parseFloat(Number(ftr_o).toFixed(1)),
    // four factors — defense
    efg_d: parseFloat(Number(efg_d).toFixed(1)),
    tov_d: parseFloat(Number(tov_d).toFixed(1)),
    drb:   parseFloat(Number(drb).toFixed(1)),
    ftr_d: parseFloat(Number(ftr_d).toFixed(1)),
    // shooting + tempo (kept for future cluster features, not used by Tier 1 fit)
    ft_pct:       parseFloat(Number(ft_pct).toFixed(1)),
    three_rate_o: parseFloat(Number(three_rate_o).toFixed(1)),
    three_rate_d: parseFloat(Number(three_rate_d).toFixed(1)),
    blk_d:        parseFloat(Number(blk_d).toFixed(1)),
    tempo:        parseFloat(Number(tempo).toFixed(1)),
  }
}

async function main() {
  const teamSeasons = []

  for (const year of YEARS) {
    console.log(`\nYear ${year}:`)
    let rows = []
    try {
      rows = await fetchJson(`https://barttorvik.com/teamslicejson.php?year=${year}&json=1&type=R`)
    } catch (e) {
      console.warn(`  failed: ${e.message}`)
      continue
    }
    let kept = 0
    for (const row of rows) {
      const s = parseSliceRow(row, year)
      if (!s) continue
      teamSeasons.push(s)
      kept++
    }
    console.log(`  parsed ${kept} of ${rows.length} rows`)
    await sleep(500)
  }

  const outPath = join(OUT_DIR, 'd1TeamSeasons.json')
  writeFileSync(outPath, JSON.stringify(teamSeasons, null, 2))
  console.log(`\nWrote ${teamSeasons.length} team-seasons to ${outPath}`)
}

main().catch(e => { console.error(e); process.exit(1) })
