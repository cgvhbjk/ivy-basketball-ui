// Build-time precompute for app-wide calibration constants.
//
// What this caches:
//   - calibrateWinPctModel(games, teamSeasons)  — slope, homeBonus, n
//   - calibratePythagoreanExp(teamSeasons)      — α at each mode (raw + adjusted)
//   - D1-trained EPA coefficients               — fits the four-factor model on
//                                                 the full Barttorvik D1 corpus
//                                                 (~1400 obs) so that runtime
//                                                 doesn't refit every page load.
//
// Why it's here (not at runtime): these are deterministic functions of
// teamSeasons.json + games.json + d1TeamSeasons.json. Computing them on every
// browser tab load burns 50ms-2s per visitor for the same answer. Bake them
// into a JSON file instead, and the runtime imports the constants for free.
//
// Run:        npm run precompute
// Re-run:     whenever teamSeasons / games / d1TeamSeasons changes.
//
// The runtime call sites check `dataHash` against the current data and fall
// back to live compute if the JSON has gone stale.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { calibrateWinPctModel, calibratePythagoreanExp } from '../src/utils/calibration.js'
import { runEPAPipeline } from '../src/utils/epaModels/pipeline.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir   = join(__dirname, '..', 'src', 'data')

const teamSeasons = JSON.parse(readFileSync(join(dataDir, 'teamSeasons.json'), 'utf8'))
const games       = JSON.parse(readFileSync(join(dataDir, 'games.json'),       'utf8'))

// Cheap content fingerprint: row counts + a sum that depends on win_pct.
// If teamSeasons or games changes, this changes; the runtime detects the
// mismatch and falls back to live compute instead of trusting stale JSON.
function dataHash(seasons, gms) {
  const wpSum = seasons.reduce((s, t) => s + (t.win_pct ?? 0), 0)
  return `ts${seasons.length}-g${gms.length}-wp${wpSum.toFixed(3)}`
}

const winModel    = calibrateWinPctModel(games, teamSeasons)
const pyAdjusted  = calibratePythagoreanExp(teamSeasons, { mode: 'adjusted' })
const pyRaw       = calibratePythagoreanExp(teamSeasons, { mode: 'raw'      })

// ── D1-trained EPA coefficients (Phase 4 #1) ────────────────────────────────
// Fit on the full Barttorvik D1 corpus (~1400 obs over 4 years), apply to
// teamSeasons (Ivy). Produces a coefficient set without the n=32 collinearity
// that forces the constrained model to zero TOV/ORB. Skipped if the D1 file
// hasn't been fetched yet — runtime falls back to Ivy-only fit.
const d1Path = join(dataDir, 'd1TeamSeasons.json')
let d1Models = null
let d1Hash   = null
if (existsSync(d1Path)) {
  const d1TeamSeasons = JSON.parse(readFileSync(d1Path, 'utf8'))
  d1Hash = `d1-${d1TeamSeasons.length}`
  // baselineEP = null is fine — we only need coefficients here, not EPA event
  // values (those are recomputed at runtime against the live baseline).
  // Note on targetMode: D1 has adjoe/adjde but not raw ppp/opp_ppp (the
  // teamslicejson endpoint doesn't expose them). Using adjusted as the target
  // triggers the "predictors don't see opponent strength" coefficient-bias
  // warning, but at n≈1400 the bias is small (training set spans the full
  // schedule-strength distribution, so opp effects average out across teams).
  const result = runEPAPipeline(teamSeasons, {
    targetMode: 'adjusted',
    trainingTeamSeasons: d1TeamSeasons,
    baselineEP: null,
  })
  if (result.status === 'error') {
    console.warn(`  d1 pipeline error: ${result.messages.join(' | ')}`)
  }
  if (result.status !== 'error' && result.models) {
    d1Models = {
      // Keep just coefficients + selectionReason — the heavy stuff (states, EPA
      // events) gets recomputed at runtime so it stays sensitive to baseline_epa.
      ols_joint:       result.models.ols_joint?.coefficients       ?? null,
      ridge_joint:     result.models.ridge_joint?.coefficients     ?? null,
      ridge_split:     result.models.ridge_split?.coefficients     ?? null,
      constrained_ols: result.models.constrained_ols?.coefficients ?? null,
      selectedModel:   result.selectedModel,
      selectionReason: result.selectionReason,
      nTrain:          result.nTrain,
    }
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  dataHash:    dataHash(teamSeasons, games),
  winModel,
  pyAdjusted,
  pyRaw,
  d1Hash,
  d1Models,
}

const outPath = join(dataDir, 'precomputedStats.json')
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n')

console.log(`Wrote ${outPath}`)
console.log(`  dataHash:   ${out.dataHash}`)
console.log(`  winModel:   slope=${winModel.slope}, homeBonus=${winModel.homeBonus}, n=${winModel.n}`)
console.log(`  pyAdjusted: α=${pyAdjusted.exponent} (n=${pyAdjusted.n})`)
console.log(`  pyRaw:      α=${pyRaw.exponent} (n=${pyRaw.n})`)
if (d1Models) {
  console.log(`  d1Models:   nTrain=${d1Models.nTrain}, selected=${d1Models.selectedModel}`)
} else {
  console.log(`  d1Models:   skipped (no d1TeamSeasons.json — run \`npm run fetch-d1\` first)`)
}
