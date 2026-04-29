# EPA Models — Developer Guide

## Quick start

```bash
# Run the test suite (no framework needed)
node scripts/test-epa-models.mjs

# Start the dev server
npm run dev
# → open http://localhost:5174, click "EPA Lab"
```

---

## Architecture

```
src/utils/epaModels/
  config.js        — constants, field mappings, sign constraints, defaults
  matrixOps.js     — OLS, ridge solve, matrix inverse, NNLS active-set
  validate.js      — input validation, adjusted/raw mismatch detection
  features.js      — feature extraction, standardization, matrix builders
  models.js        — fitOLS, fitRidge, fitRidgeCV, fitSplitRidgeCV, fitConstrained
  diagnostics.js   — VIF, correlation matrix, coefficient stability, residuals
  epaConversion.js — league-rate derivation, event EPA conversion with documented assumptions
  pipeline.js      — main orchestrator (Tier 1 / team-season)
  tier2.js         — Tier 2 orchestrator (game-log)
  index.js         — public exports
```

---

## What changed vs. the old approach

| Problem | Old | New |
|---|---|---|
| Too many predictors | 8 predictors on 32 obs (ratio 4:1) | Split models: 4 predictors each (ratio 8:1) |
| Coefficient instability | Plain OLS | Ridge with LOO-CV alpha selection |
| Sign flips | Undetected | Checked against `SIGN_CONSTRAINTS`; constrained model selected when signs are wrong |
| Adjusted/raw mismatch | Silent | Validated + warning logged; default is `targetMode: 'raw'` |
| Hard-coded FGA=48 | Wrong by ~1.8× | Derived from data via scoring identity: `ppp = FGA_p100 × (2·eFG + ft_pct·ftr)` |
| Synthetic Tier 2 as real | Silent | `synthetic: true` flag always set; UI shows SYNTHETIC badge |
| No model comparison | — | All 4 models compared by LOO-CV R², sign correctness, RMSE |
| No diagnostics | — | VIF, correlation matrix, CV stability, residuals |

---

## Model selection logic

The pipeline fits four models and selects in this priority order:

1. **Ridge split** — if all coefficient signs are correct  
2. **Constrained OLS** — if ridge split has sign issues (NNLS enforces theory)  
3. **Ridge joint** — fallback  
4. **OLS joint** — baseline only, never selected

Current default output: **Constrained OLS** (sign issues in `tov_o`, `orb`, `tov_d`, `drb` suggest Barttorvik field encoding is non-standard for those four columns).

---

## Field encoding note

Four fields in `teamSeasons.json` have **ambiguous directional encoding** for Barttorvik data:

| Field | Expected | What we find | Implication |
|---|---|---|---|
| `tov_o` | Team's offensive TOV rate (high = bad) | Positive coefficient for ppp | May encode *defensive* turnover forcing |
| `orb` | Team's ORB% (high = good) | Negative coefficient for ppp | May encode *opponent's* ORB rate against us |
| `tov_d` | Opponent TOV% (high = good for defense) | Positive coefficient in split but small | Direction consistent with expected |
| `drb` | Team or opponent DRB% | Unclear | Ambiguous in split model |

VIF values are all 1.3–1.8 (low) — this is **not** a multicollinearity problem. The sign issues stem from the field encoding being opposite to the assumed convention.

**Recommendation**: If you have access to the raw Barttorvik scraper, verify which direction `tov_o` and `orb` are counted (by team or by opponent).

---

## EPA conversion

Old: `made2FG = β_eFG × (100 / 48)` — used average FGA *per game* as if it were per 100 possessions.

New:
```
FGA_p100 = ppp / (2 × eFG + ft_pct × ftr)   ← accounting identity
made2FG  = β_eFG × (100 / FGA_p100)
made3FG  = β_eFG × (100 / FGA_p100) × 1.5
```

League-average `FGA_p100 = 87.9` (derived from 32 team-seasons). The old 48 was wrong by 1.8×.

---

## Switching target mode

```js
import { runEPAPipeline } from './src/utils/epaModels/pipeline.js'

// Default: raw targets (ppp, opp_ppp) — no adjusted/raw mismatch
const result = runEPAPipeline(teamSeasons, { targetMode: 'raw' })

// Adjusted targets (adjoe, adjde) — logs mismatch warning
const result2 = runEPAPipeline(teamSeasons, { targetMode: 'adjusted' })
```

---

## Adding real game-log data (Tier 2)

Replace `src/data/gameLogs.json` with real Barttorvik per-game box scores. Each row must include:

```
school, year, date, opponent, is_ivy_opponent, location,
pts, fgm, fga, fg3m, fg3a, ftm, fta, orb, drb, tov,
opp_pts, opp_fgm, opp_fga, opp_fg3m, opp_fg3a, opp_ftm, opp_fta,
opp_orb, opp_drb, opp_tov
```

The `synthetic` flag will clear automatically once real data is present (detection checks for `game_id` or `source` fields).

---

## What would most improve the model

1. **More seasons** — pull 5+ years of all D1 data for coefficient stability, then apply to Ivy
2. **Clarify field encoding** — confirm direction of `tov_o`, `orb`, `tov_d`, `drb` in Barttorvik
3. **Real game-log data** — Tier 2 is currently synthetic; per-game box scores unlock possession-level analysis
4. **Possession-level data** — each possession is one observation; thousands of rows make all models stable
