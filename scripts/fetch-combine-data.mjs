/**
 * Fetch and update NBA combine / draft data from Basketball Reference.
 *
 * Usage:  node scripts/fetch-combine-data.mjs
 *
 * What it does:
 *   - Scrapes each year's draft page on Basketball Reference (2019–current)
 *   - Extracts player name, pick, height, weight, college, and college stats
 *   - Merges with existing nbaCombine.json (preserves hand-curated entries)
 *   - Writes updated src/data/nbaCombine.json
 *
 * Note: Basketball Reference does not provide a public JSON API. This script
 * parses their HTML tables. If selectors break, check that the page structure
 * has not changed. Rate limit: 3 seconds between requests.
 *
 * Requires: node-fetch  (npm install node-fetch --save-dev)
 */

import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dir = dirname(__filename)

const OUT_PATH = join(__dir, '../src/data/nbaCombine.json')
const DRAFT_YEARS = [2019, 2020, 2021, 2022, 2023, 2024]
const DELAY_MS = 3000

// Position classification based on Basketball Reference position labels
function mapBRPosition(pos) {
  if (!pos) return null
  const p = pos.toUpperCase()
  if (p === 'PG' || p === 'SG' || p === 'G')  return 'Guard'
  if (p === 'SF' || p === 'PF' || p === 'F')   return 'Forward'
  if (p === 'C')                                return 'Big'
  if (p === 'PF-C' || p === 'C-PF')            return 'Big'
  if (p === 'SG-SF' || p === 'SF-SG')          return 'Forward'
  if (p === 'PG-SG' || p === 'SG-PG')          return 'Guard'
  return null
}

// Convert "6-4" or "6'4\"" format to total inches
function parseBRHeight(str) {
  if (!str) return null
  const m = str.match(/(\d+)['\-](\d+)/)
  return m ? parseInt(m[1]) * 12 + parseInt(m[2]) : null
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function fetchDraftYear(year) {
  const url = `https://www.basketball-reference.com/draft/NBA_${year}.html`
  console.log(`Fetching ${year} draft page...`)

  let fetch
  try {
    fetch = (await import('node-fetch')).default
  } catch {
    console.error('node-fetch not installed. Run: npm install node-fetch --save-dev')
    process.exit(1)
  }

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (research use; ivy-basketball-ui)' }
  })
  if (!res.ok) {
    console.warn(`  HTTP ${res.status} for ${year} — skipping`)
    return []
  }

  const html = await res.text()

  // Extract the draft table rows. BR's draft table id is typically "stats"
  // We use simple regex parsing since we don't have a DOM parser available in Node.
  const tableMatch = html.match(/<table[^>]+id="stats"[^>]*>([\s\S]*?)<\/table>/i)
  if (!tableMatch) {
    console.warn(`  Could not find stats table for ${year}`)
    return []
  }

  const rows = []
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let rowMatch

  while ((rowMatch = rowRegex.exec(tableMatch[1])) !== null) {
    const row = rowMatch[1]
    // Skip header rows
    if (row.includes('<th')) continue

    const cells = [...row.matchAll(/<td[^>]*data-stat="([^"]+)"[^>]*>([\s\S]*?)<\/td>/g)]
    const get = (stat) => {
      const cell = cells.find(c => c[1] === stat)
      if (!cell) return null
      // Strip HTML tags
      return cell[2].replace(/<[^>]+>/g, '').trim() || null
    }

    const name = get('player')
    const pick = parseInt(get('pick_overall') ?? '999')
    const round = pick <= 30 ? 1 : 2
    const pos = mapBRPosition(get('pos'))
    const heightRaw = get('ht')
    const weightRaw = get('wt')
    const college = get('college_link') || get('college') || null

    if (!name || !pos || !heightRaw) continue

    rows.push({
      name,
      draft_year: year,
      draft_pick: isNaN(pick) ? 999 : pick,
      round,
      pos_group: pos,
      height_in: parseBRHeight(heightRaw),
      weight_lbs: weightRaw ? parseInt(weightRaw) : null,
      college: college === '' ? null : college,
      conf: null,
      college_ppg: parseFloat(get('pts') ?? '') || null,
      college_efg_pct: null,
      college_ts_pct: null,
      college_usg_pct: null,
    })
  }

  console.log(`  Found ${rows.length} players for ${year}`)
  return rows
}

async function main() {
  // Load existing curated data to preserve hand-tuned entries
  let existing = []
  try {
    existing = JSON.parse(readFileSync(OUT_PATH, 'utf8'))
    console.log(`Loaded ${existing.length} existing entries from nbaCombine.json`)
  } catch {
    console.log('No existing nbaCombine.json — will create from scratch')
  }

  const existingKeys = new Set(existing.map(p => `${p.name}||${p.draft_year}`))
  const fetched = []

  for (const year of DRAFT_YEARS) {
    const rows = await fetchDraftYear(year)
    for (const row of rows) {
      const key = `${row.name}||${row.draft_year}`
      if (!existingKeys.has(key)) {
        fetched.push(row)
        existingKeys.add(key)
      } else {
        // Update weight_lbs only if existing entry is missing it
        const ex = existing.find(p => `${p.name}||${p.draft_year}` === key)
        if (ex && ex.weight_lbs == null && row.weight_lbs != null) ex.weight_lbs = row.weight_lbs
      }
    }
    if (year !== DRAFT_YEARS.at(-1)) await sleep(DELAY_MS)
  }

  const merged = [...existing, ...fetched]
    .sort((a, b) => b.draft_year - a.draft_year || a.draft_pick - b.draft_pick)

  writeFileSync(OUT_PATH, JSON.stringify(merged, null, 2))
  console.log(`\nWrote ${merged.length} total entries to src/data/nbaCombine.json`)
  console.log(`  ${fetched.length} new entries added from fetch`)
  console.log('\nIMPORTANT: Basketball Reference does not expose eFG%, TS%, or USG%')
  console.log('in the draft table. Those fields need manual entry or a secondary')
  console.log('scrape from individual player pages. The existing hand-curated values')
  console.log('in the dataset have been preserved.')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
