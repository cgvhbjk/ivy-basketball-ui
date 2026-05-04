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

## Field encoding (Phase 0 — VERIFIED)

The directional encoding of four columns from Barttorvik's slice JSON was historically ambiguous. The Phase-0 audit (`src/utils/epaModels/encodingAudit.js`) resolves this empirically — it fits a four-factor OLS on the 32 Ivy team-seasons and reports the partial coefficient signs. The unit test at `src/utils/epaModels/__tests__/encodingAudit.test.js` locks these signs in CI.

### Empirical regression (n=32, standardized X)

**Offense → ppp** (R²=0.96):

| Field | β   | Sign | Note |
|---|----:|:---:|---|
| `efg_o` | +4.36 | + | Standard convention; matches textbook. |
| `tov_o` | +0.55 | **+** | Opposite of textbook — likely a percentile-rank-where-higher-is-better encoding (high `tov_o` ⇒ low actual TOV%). |
| `orb`   | −2.63 | **−** | Opposite of textbook — encoding is opposite-direction to standard ORB%. |
| `ftr_o` | +0.99 | + | Standard. |

**Defense → opp_ppp** (R²=0.87):

| Field | β   | Sign | Note |
|---|----:|:---:|---|
| `efg_d` | +2.83 | + | Standard. |
| `tov_d` | +0.07 | + | **Low confidence** — magnitude effectively zero at n=32. Audit warns; bivariate sign is weakly negative, partial sign is weakly positive. We retain the audit's positive sign for the constraint but expect this is the noisiest of the four. |
| `drb`   | −2.42 | − | Standard — own DRB% reduces opp scoring. |
| `ftr_d` | +1.95 | + | Standard. |

### What the locked signs mean for the pipeline

The verification result is encoded in three constraint dictionaries (all in `config.js`):

```js
SIGN_CONSTRAINTS_OFF = { off_eFG: 1, off_TOV: 1, off_ORB: -1, off_FTR: 1 }
SIGN_CONSTRAINTS_DEF = { def_eFG: 1, def_TOV: 1, def_ORB: -1, def_FTR: 1 }
SIGN_CONSTRAINTS     = { ...OFF, def_eFG: -1, def_TOV: -1, def_ORB: 1, def_FTR: -1 }   // joint, defensive flips
```

Three signs differ from textbook convention: `off_TOV: +1` (was −1), `off_ORB: −1` (was +1), `def_ORB: +1` in the joint dict (was −1). These mismatches were silently producing wrong-signed coefficients in the constrained model before Phase 0.

### Why we still need the modeling complexity

Phase 0 originally hypothesized that fixing the encoding would let us retire `constrained_ols` and the dual-variant logic in `convertToEventEPA`. That partly held: the **sign ambiguity is gone** (we now know what every coefficient should look like). But the small-sample multicollinearity remains — at n=32, ridge-split still produces `def_TOV` coefficients near zero, and the joint model still benefits from sign enforcement to keep TOV/ORB from getting absorbed by `eFG`. The constrained model and the model-comparison logic stay; only the "we don't know which way is up" hedging in copy/docs goes away.

**Recommendation for future data refreshes**: run `npm test` after refreshing `teamSeasons.json`. If the encoding audit fails, the refresh introduced an encoding flip — investigate before merging.

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
