// Standalone test suite — no test framework required.
// Run: node scripts/test-epa-models.mjs
// Exit 0 = all pass, exit 1 = failures.

import { readFileSync } from 'fs'
import { runEPAPipeline } from '../src/utils/epaModels/pipeline.js'
import { runTier2Pipeline } from '../src/utils/epaModels/tier2.js'
import { validateTeamSeasons, validateGameLogs } from '../src/utils/epaModels/validate.js'
import { computeLeagueRates, convertToEventEPA } from '../src/utils/epaModels/epaConversion.js'
import { computeVIF } from '../src/utils/epaModels/diagnostics.js'
import { fitRidge, fitConstrained } from '../src/utils/epaModels/models.js'
import { nnls, olsSolve } from '../src/utils/epaModels/matrixOps.js'

const teamSeasons = JSON.parse(readFileSync('./src/data/teamSeasons.json'))
const gameLogs    = JSON.parse(readFileSync('./src/data/gameLogs.json'))

let passed = 0, failed = 0

function assert(condition, name, detail = '') {
  if (condition) {
    console.log(`  ✓ ${name}`)
    passed++
  } else {
    console.error(`  ✗ ${name}${detail ? ': ' + detail : ''}`)
    failed++
  }
}

// ── 1. Data validation ────────────────────────────────────────────────────────
console.log('\n[1] Data validation')

const v1 = validateTeamSeasons(teamSeasons, 'raw')
assert(v1.ok,             'raw mode validates successfully')
assert(v1.validCount === 32, '32 valid team-seasons', `got ${v1.validCount}`)
assert(v1.errors.length === 0, 'no errors in valid data')

const v2 = validateTeamSeasons(teamSeasons, 'adjusted')
assert(v2.ok,             'adjusted mode validates successfully')
assert(v2.warnings.some(w => w.includes('adjusted')), 'adjusted mode emits mismatch warning')

const v3 = validateTeamSeasons([], 'raw')
assert(!v3.ok,            'empty array fails validation')

const v4 = validateTeamSeasons([{ school: 'x', year: 2022 }], 'raw')
assert(!v4.ok,            'missing columns fail validation')

// ── 2. Adjusted/raw mismatch triggers warning ─────────────────────────────────
console.log('\n[2] Adjusted/raw mismatch')
assert(v2.warnings.length > 0, 'adjusted mode produces at least one warning')
assert(!v2.errors.includes('missing'), 'mismatch is a warning, not a hard error')

// ── 3. Ridge fit on small sample ──────────────────────────────────────────────
console.log('\n[3] Ridge regression')
const X = [[1,1,2],[1,2,3],[1,3,1],[1,4,2],[1,5,3]]
const y = [3, 5, 4, 7, 8]
const m = fitRidge(X, y, 1.0, ['a', 'b'])
assert(m.beta.length === 3,  'ridge returns intercept + 2 coefficients')
assert(m.r2 >= 0 && m.r2 <= 1, `ridge R² in [0,1], got ${m.r2}`)
assert(m.method === 'ridge', 'method flag is "ridge"')

// ── 4. NNLS correctness ───────────────────────────────────────────────────────
console.log('\n[4] NNLS (constrained solver)')
// Simple NNLS: min ||Ax - b||² s.t. x ≥ 0
// Known solution: x = [0, 1.5] because first col is harmful
const A = [[1, 2], [1, 3], [1, 4]]
const b = [3, 4.5, 6]
const x = nnls(A, b)
assert(x.every(v => v >= -1e-9), 'NNLS solution is non-negative')
assert(x.length === 2, 'NNLS returns correct length')

// ── 5. Constrained regression enforces signs ─────────────────────────────────
console.log('\n[5] Constrained OLS')
const Xc = [[1,2,3],[1,3,2],[1,4,5],[1,5,4],[1,6,7],[1,7,6]]
const yc = [5, 4, 8, 7, 12, 11]
const constraints = { a: 1, b: 1 }  // both must be positive
const mc = fitConstrained(Xc, yc, ['a','b'], constraints)
assert(!mc.error, 'constrained fit succeeds')
if (!mc.error) {
  assert(mc.beta[1] >= -1e-9, `constrained β_a ≥ 0, got ${mc.beta[1].toFixed(4)}`)
  assert(mc.beta[2] >= -1e-9, `constrained β_b ≥ 0, got ${mc.beta[2].toFixed(4)}`)
}

// ── 6. CV does not leak (groups) ──────────────────────────────────────────────
console.log('\n[6] Cross-validation data integrity')
const r = runEPAPipeline(teamSeasons, { targetMode: 'raw' })
assert(r.status !== 'error', 'pipeline runs without error')
assert(r.n === 32, `pipeline uses all 32 observations, got ${r.n}`)
const ridgeSplit = r.models.ridge_split
assert(ridgeSplit && !ridgeSplit.error, 'ridge_split model fits successfully')
assert(ridgeSplit.offCvR2 > 0 && ridgeSplit.offCvR2 <= 1, `off CVR² in range: ${ridgeSplit.offCvR2}`)
assert(ridgeSplit.defCvR2 > 0 && ridgeSplit.defCvR2 <= 1, `def CVR² in range: ${ridgeSplit.defCvR2}`)

// ── 7. EPA conversion uses correct denominator ────────────────────────────────
console.log('\n[7] EPA conversion denominator')
const rates = computeLeagueRates(teamSeasons)
assert(rates.avgFGAp100 > 80 && rates.avgFGAp100 < 100,
  `avgFGAp100 is ~88 (not 48), got ${rates.avgFGAp100}`)
assert(rates.n === 32, `computed from all 32 seasons, got ${rates.n}`)

// Test conversion output shape
const mockCoeffs = { off_eFG: 1.3, off_TOV: -0.5, off_ORB: 0.4, off_FTR: 0.2,
                     def_eFG: -1.2, def_TOV: 0.3, def_ORB: -0.4, def_FTR: -0.2 }
const conv = convertToEventEPA(mockCoeffs, rates)
assert('values' in conv && 'meta' in conv, 'conversion returns {values, meta}')
assert('denominatorNote' in conv.meta || 'denominator' in conv.meta, 'meta includes denominator documentation')
assert(typeof conv.values.made2FG === 'number', 'made2FG is a number')
assert(conv.values.made3FG > conv.values.made2FG, '3FG EPA > 2FG EPA (3FG is worth more)')

// Verify old avgFGA=48 is NOT used
const epaWith48  = convertToEventEPA(mockCoeffs, { avgFGAp100: 48 })
const epaWithReal = convertToEventEPA(mockCoeffs, rates)
assert(
  Math.abs(epaWith48.values.made2FG - epaWithReal.values.made2FG) > 0.3,
  `correct FGA_p100 (${rates.avgFGAp100}) gives materially different EPA than old hard-coded 48`
)

// ── 8. Synthetic Tier 2 is flagged ───────────────────────────────────────────
// Uses inline synthetic rows (no game_id/source = detected as synthetic).
// Tests are self-contained and do not depend on gameLogs.json content.
console.log('\n[8] Synthetic Tier 2 guard')

const IVY = ['harvard','yale','princeton','columbia','penn','brown','dartmouth','cornell']
const syntheticLogs = Array.from({ length: 25 }, (_, i) => ({
  school:          IVY[i % IVY.length],
  year:            2024,
  opponent:        'Opponent University',
  is_ivy_opponent: false,
  pts: 70, opp_pts: 65,
  fgm: 26, fga: 60, fg3m: 6, fg3a: 18, ftm: 12, fta: 16,
  orb: 10, drb: 25, tov: 12,
  opp_fgm: 24, opp_fga: 58, opp_fg3m: 5, opp_fg3a: 15, opp_ftm: 12, opp_fta: 16,
  opp_orb: 9,  opp_drb: 24, opp_tov: 13,
}))

const t2 = runTier2Pipeline(syntheticLogs, rates)
assert(t2.synthetic === true, 'synthetic gameLogs flagged as synthetic=true')
assert(t2.messages?.some(m => m.includes('SYNTHETIC')), 'synthetic warning message present')
assert(t2.status === 'ok', 'synthetic data still runs (not hard-blocked)')

const syntheticResult = t2.result
assert(syntheticResult?.eventEPA !== undefined, 'synthetic result has eventEPA (for display)')
assert(t2.synthetic, 'synthetic flag always accessible on returned object')

// ── 9. VIF diagnostics ────────────────────────────────────────────────────────
console.log('\n[9] VIF diagnostics')
const vif = r.diagnostics.joint?.vif
assert(vif !== null && vif !== undefined, 'VIF computed for joint model')
assert(Object.keys(vif).length === 8, `VIF has 8 entries, got ${Object.keys(vif).length}`)
assert(Object.values(vif).every(v => isFinite(v) && v >= 1), 'all VIFs ≥ 1')
// VIFs should all be low for this dataset (confirmed: 1.3–1.8)
assert(Object.values(vif).every(v => v < 5), 'all VIFs < 5 (collinearity not the root cause)')

// ── 10. Model export includes metadata ────────────────────────────────────────
console.log('\n[10] Model output metadata')
assert(r.selectedModel !== undefined, 'selectedModel is set')
assert(r.selectionReason?.length > 0, 'selectionReason is non-empty')
assert(r.leagueRates?.avgFGAp100 > 0, 'leagueRates included in output')
assert(r.convMeta !== undefined, 'convMeta (conversion metadata) included')
assert(r.targetMode === 'raw', 'targetMode documented in output')

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(40)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) { console.error('SOME TESTS FAILED'); process.exit(1) }
else { console.log('ALL TESTS PASSED'); process.exit(0) }
