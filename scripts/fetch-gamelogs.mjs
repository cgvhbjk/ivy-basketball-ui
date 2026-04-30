// Fetches real Ivy League game logs from the ESPN API for seasons 2022–2025.
// Run: node scripts/fetch-gamelogs.mjs
// Writes to: src/data/gameLogs.json
//
// Takes ~5–10 minutes (rate-limited to avoid hammering ESPN).
// Re-running is safe — output file is overwritten.

import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_PATH   = join(__dirname, '../src/data/gameLogs.json')

const IVY_SLUGS = {
  harvard:   'Harvard',
  yale:      'Yale',
  princeton: 'Princeton',
  columbia:  'Columbia',
  penn:      'Penn',
  brown:     'Brown',
  dartmouth: 'Dartmouth',
  cornell:   'Cornell',
}

// ESPN display names used to flag is_ivy_opponent
const IVY_DISPLAY_NAMES = new Set([
  'Harvard Crimson', 'Yale Bulldogs', 'Princeton Tigers',
  'Columbia Lions',  'Pennsylvania Quakers', 'Brown Bears',
  'Dartmouth Big Green', 'Cornell Big Red',
])

const SEASONS    = [2022, 2023, 2024, 2025]
const DELAY_MS   = 600  // polite rate limit

// ── Helpers ──────────────────────────────────────────────────────────────────

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function fetchJSON(url, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'ivy-basketball-analytics/1.0' }
      })
      if (res.status === 429) {
        console.warn('  rate limited — waiting 5s')
        await sleep(5000)
        continue
      }
      if (!res.ok) return null
      return await res.json()
    } catch {
      if (attempt === retries - 1) return null
      await sleep(1000 * (attempt + 1))
    }
  }
  return null
}

// Parse "made-attempted" or plain numeric stat from ESPN statistics array
function parseStat(stats, name) {
  const s = stats?.find(x => x.name === name)
  if (!s) return null
  const v = s.displayValue ?? ''
  if (v.includes('-')) {
    const [made, att] = v.split('-').map(Number)
    return { made: isFinite(made) ? made : 0, att: isFinite(att) ? att : 0 }
  }
  const n = Number(v)
  return isFinite(n) ? n : null
}

function extractTeamStats(teamEntry) {
  const s   = teamEntry?.statistics ?? []
  const fg  = parseStat(s, 'fieldGoalsMade-fieldGoalsAttempted')
  const fg3 = parseStat(s, 'threePointFieldGoalsMade-threePointFieldGoalsAttempted')
  const ft  = parseStat(s, 'freeThrowsMade-freeThrowsAttempted')
  const fgm  = fg?.made  ?? 0
  const fg3m = fg3?.made ?? 0
  const ftm  = ft?.made  ?? 0
  return {
    // ESPN statistics array omits points — derive from box score
    pts:  2 * fgm + fg3m + ftm,
    fgm,  fga:  fg?.att  ?? 0,
    fg3m, fg3a: fg3?.att ?? 0,
    ftm,  fta:  ft?.att  ?? 0,
    orb:  Number(parseStat(s, 'offensiveRebounds'))    || 0,
    drb:  Number(parseStat(s, 'defensiveRebounds'))    || 0,
    tov:  Number(parseStat(s, 'turnovers'))            || 0,
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

const allGames = []
let fetched = 0, skipped = 0

for (const [slug, schoolName] of Object.entries(IVY_SLUGS)) {
  for (const season of SEASONS) {
    process.stdout.write(`${schoolName} ${season}  `)

    const schedUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/${slug}/schedule?season=${season}`
    const sched    = await fetchJSON(schedUrl)

    if (!sched?.events?.length) {
      console.log('(no events)')
      continue
    }

    for (const event of sched.events) {
      const comp     = event.competitions?.[0]
      const status   = comp?.status?.type?.description ?? ''
      if (status !== 'Final') continue  // skip future/in-progress games

      // Find which competitor is our Ivy school
      const ourComp = comp.competitors?.find(c =>
        c.team?.displayName?.toLowerCase().includes(schoolName.toLowerCase()) ||
        c.team?.shortDisplayName?.toLowerCase() === slug
      )
      if (!ourComp) { skipped++; continue }

      const oppComp   = comp.competitors.find(c => c !== ourComp)
      const oppName   = oppComp?.team?.displayName ?? 'Unknown'
      const isHome    = ourComp.homeAway === 'home'
      const isNeutral = comp.neutralSite ?? false

      // Fetch box score
      await sleep(DELAY_MS)
      const summary = await fetchJSON(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event=${event.id}`
      )

      const bsTeams = summary?.boxscore?.teams
      if (!bsTeams?.length) { skipped++; process.stdout.write('x'); continue }

      // Match our team in the boxscore by display name
      const bsOurs = bsTeams.find(t =>
        t.team?.displayName?.toLowerCase().includes(schoolName.toLowerCase())
      )
      const bsOpp  = bsTeams.find(t => t !== bsOurs)
      if (!bsOurs || !bsOpp) { skipped++; process.stdout.write('x'); continue }

      const ours = extractTeamStats(bsOurs)
      const opp  = extractTeamStats(bsOpp)

      // Skip obviously bad rows (no FGA recorded = box score unavailable)
      if (ours.fga === 0 && opp.fga === 0) { skipped++; process.stdout.write('_'); continue }

      allGames.push({
        game_id:         event.id,
        source:          'espn',
        school:          schoolName.toLowerCase(),
        year:            season,
        date:            event.date?.slice(0, 10) ?? null,
        opponent:        oppName,
        is_ivy_opponent: IVY_DISPLAY_NAMES.has(oppName),
        location:        isNeutral ? 'neutral' : (isHome ? 'home' : 'away'),
        ...ours,
        opp_pts:  opp.pts,  opp_fgm:  opp.fgm,  opp_fga:  opp.fga,
        opp_fg3m: opp.fg3m, opp_fg3a: opp.fg3a,
        opp_ftm:  opp.ftm,  opp_fta:  opp.fta,
        opp_orb:  opp.orb,  opp_drb:  opp.drb,  opp_tov:  opp.tov,
      })

      fetched++
      process.stdout.write('.')
    }

    console.log(`  (${fetched} total so far)`)
  }
}

writeFileSync(OUT_PATH, JSON.stringify(allGames, null, 2))
console.log(`\nDone. ${fetched} games written to src/data/gameLogs.json (${skipped} skipped)`)
