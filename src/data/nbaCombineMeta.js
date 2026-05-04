// Provenance metadata for nbaCombine.json. Kept separate so the data file
// stays a clean array consumable directly by JSON.parse.

import nbaCombine from './nbaCombine.json'

const draftYears = [...new Set(nbaCombine.map(p => p.draft_year))].filter(y => y != null).sort((a, b) => a - b)

export const NBA_COMBINE_META = {
  source: 'NBA Draft Combine measurements + college reference stats',
  caveat: 'Combine attendees are top-60 draft prospects. Using their medians as "targets" for Ivy players biases comparisons toward elite finalists; treat percentiles as aspirational, not peer-relative.',
  draftYearMin: draftYears[0]                  ?? null,
  draftYearMax: draftYears[draftYears.length - 1] ?? null,
  draftYears,
  totalProspects: nbaCombine.length,
  withCollegeData: nbaCombine.filter(p => p.college != null).length,
  byPosition: {
    Guard:   nbaCombine.filter(p => p.pos_group === 'Guard').length,
    Forward: nbaCombine.filter(p => p.pos_group === 'Forward').length,
    Big:     nbaCombine.filter(p => p.pos_group === 'Big').length,
  },
}

// Build a filtered subset of the combine pool. Defaults to the full set so
// existing call sites keep working unchanged.
export function filterCombinePool(pool, { draftYearMin = null, draftYearMax = null } = {}) {
  if (draftYearMin == null && draftYearMax == null) return pool
  return pool.filter(p => {
    if (p.draft_year == null) return false
    if (draftYearMin != null && p.draft_year < draftYearMin) return false
    if (draftYearMax != null && p.draft_year > draftYearMax) return false
    return true
  })
}
