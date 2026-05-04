import { DEFAULT_CONFIG, FIELD_MAP, SIGN_CONSTRAINTS, SIGN_CONSTRAINTS_OFF, SIGN_CONSTRAINTS_DEF, MODEL_LABELS } from './config.js'
import { validateTeamSeasons, filterValidRows } from './validate.js'
import { OFF_FEATURES, DEF_FEATURES, ALL_FEATURES, buildMatrix, attachFeatures } from './features.js'
import { fitOLS, fitRidgeCV, fitSplitRidgeCV, fitConstrained, checkSigns } from './models.js'
import { runDiagnostics, residualDiagnostics } from './diagnostics.js'
import { computeLeagueRates, convertToEventEPA } from './epaConversion.js'
import { computeFit } from './matrixOps.js'

const ALPHAS = DEFAULT_CONFIG.ridge.alphas

// ── Main pipeline ─────────────────────────────────────────────────────────────
// Returns a comprehensive result object consumed by the UI.

export function runEPAPipeline(teamSeasons, opts = {}) {
  const targetMode = opts.targetMode  ?? DEFAULT_CONFIG.targetMode
  const baselineEP = opts.baselineEP  ?? null   // baseline_epa.json, passed in from caller
  const messages   = []

  // Optional separate training set: when provided, coefficients are *fitted*
  // on `trainingTeamSeasons` (e.g., the full D1 corpus, n≈1400) but predictions,
  // observations, residuals, and diagnostics are computed against the original
  // `teamSeasons` (e.g., Ivy-only, n=32). This is the primary lever for
  // dissolving the n=32 collinearity that forces TOV/ORB out of the constrained
  // model. When omitted, training === apply (legacy behavior).
  const trainingTeamSeasons = opts.trainingTeamSeasons ?? teamSeasons
  const distinctTraining    = trainingTeamSeasons !== teamSeasons

  // 1. Validate
  const validation = validateTeamSeasons(teamSeasons, targetMode)
  messages.push(...validation.warnings)
  if (!validation.ok) {
    return { status: 'error', messages: [...validation.errors, ...messages], models: null }
  }
  if (distinctTraining) {
    const tValidation = validateTeamSeasons(trainingTeamSeasons, targetMode)
    messages.push(...tValidation.warnings.map(w => `[training] ${w}`))
    if (!tValidation.ok) {
      return { status: 'error', messages: [...tValidation.errors.map(e => `[training] ${e}`), ...messages], models: null }
    }
  }

  // 2. Target columns
  const offTarget = targetMode === 'adjusted' ? FIELD_MAP.adjOE  : FIELD_MAP.rawOE
  const defTarget = targetMode === 'adjusted' ? FIELD_MAP.adjDE  : FIELD_MAP.rawDE

  // 3. Attach named features and filter valid rows — for both apply and training.
  const enriched = attachFeatures(teamSeasons)
  const allCols  = [...ALL_FEATURES, offTarget, defTarget]
  const valid    = filterValidRows(enriched, allCols)
  const n        = valid.length

  const trainEnriched = distinctTraining ? attachFeatures(trainingTeamSeasons) : enriched
  const trainValid    = distinctTraining ? filterValidRows(trainEnriched, allCols) : valid
  const nTrain        = trainValid.length

  // 4. League rates for EPA conversion (always from the apply set — these
  //    define what counts as "league average" for the consumer).
  const leagueRates = computeLeagueRates(teamSeasons)

  // 5. Build matrices — separate training (used for fit) and apply (used for
  //    predictions, observations, residuals).
  const yTargetCol = offTarget === FIELD_MAP.rawOE ? FIELD_MAP.netRaw : 'net_efficiency'
  const { X: XApply }     = buildMatrix(valid, ALL_FEATURES, yTargetCol)
  const { X: XOff }       = buildMatrix(valid, OFF_FEATURES, offTarget)
  const { X: XDef }       = buildMatrix(valid, DEF_FEATURES, defTarget)
  const yNet              = valid.map(ts => ts[offTarget] - ts[defTarget])
  const yOff              = valid.map(ts => ts[offTarget])
  const yDef              = valid.map(ts => ts[defTarget])

  const { X: XTrain }     = distinctTraining
    ? buildMatrix(trainValid, ALL_FEATURES, yTargetCol)
    : { X: XApply }
  const { X: XOffTrain }  = distinctTraining ? buildMatrix(trainValid, OFF_FEATURES, offTarget) : { X: XOff }
  const { X: XDefTrain }  = distinctTraining ? buildMatrix(trainValid, DEF_FEATURES, defTarget) : { X: XDef }
  const yNetTrain         = distinctTraining ? trainValid.map(ts => ts[offTarget] - ts[defTarget]) : yNet
  const yOffTrain         = distinctTraining ? trainValid.map(ts => ts[offTarget]) : yOff
  const yDefTrain         = distinctTraining ? trainValid.map(ts => ts[defTarget]) : yDef

  const XFull = XApply  // legacy alias used by downstream blocks (diagnostics, scatter)
  // Apply a beta vector to the apply-set design matrix → yHat for observations.
  const applyBeta = beta => XApply.map(row => row.reduce((s, v, j) => s + v * beta[j], 0))

  // 6. Fit all models
  const makeObs = (yHat) => valid.map((ts, i) => ({
    label: `${ts.school.charAt(0).toUpperCase() + ts.school.slice(1)} ${ts.year}`,
    actual:    +yNet[i].toFixed(2),
    predicted: +yHat[i].toFixed(2),
  }))

  // Normalised result envelope. Every model branch returns the same shape so
  // downstream consumers (UI tables, model selection, diagnostics) never have
  // to special-case "did this branch throw?" — they read `.ok` once.
  // ok=true  → body is in `data`
  // ok=false → reason is in `error`; data/cvR2/etc are absent
  const _ok  = (data) => ({ ok: true, error: null, ...data })
  const _err = (msg)  => ({ ok: false, error: msg })

  // Wrap a model-building closure: turn thrown exceptions and { error } returns
  // (from fitConstrained etc.) into the same shape the success path uses.
  const _runModel = (label, build) => {
    try {
      const out = build()
      if (out && out.error) return _err(out.error)
      return _ok(out)
    } catch (e) {
      return _err(`${label}: ${e?.message ?? String(e)}`)
    }
  }

  const olsModel = _runModel('ols_joint', () => {
    const m    = fitOLS(XTrain, yNetTrain, ALL_FEATURES)
    const conv = convertToEventEPA(namedCoeffs(m.beta, ALL_FEATURES), leagueRates, baselineEP, { modelVariant: 'joint' })
    const signs = checkSigns(m.beta, ALL_FEATURES)
    const yHatApply = distinctTraining ? applyBeta(m.beta) : m.yHat
    return { ...m, coefficients: namedCoeffs(m.beta, ALL_FEATURES), eventEPA: conv.values, states: conv.states, convMeta: conv.meta, signIssues: signs, cvR2: null, observations: makeObs(yHatApply) }
  })

  const ridgeJoint = _runModel('ridge_joint', () => {
    const m    = fitRidgeCV(XTrain, yNetTrain, ALL_FEATURES, { alphas: ALPHAS })
    const conv = convertToEventEPA(namedCoeffs(m.beta, ALL_FEATURES), leagueRates, baselineEP, { modelVariant: 'joint' })
    const signs = checkSigns(m.beta, ALL_FEATURES)
    const yHatApply = distinctTraining ? applyBeta(m.beta) : m.yHat
    return { ...m, coefficients: namedCoeffs(m.beta, ALL_FEATURES), eventEPA: conv.values, states: conv.states, convMeta: conv.meta, signIssues: signs, observations: makeObs(yHatApply) }
  })

  const ridgeSplit = _runModel('ridge_split', () => {
    const m   = fitSplitRidgeCV(XOffTrain, yOffTrain, OFF_FEATURES, XDefTrain, yDefTrain, DEF_FEATURES, { alphas: ALPHAS })
    const coeffs = {
      off_eFG: m.combined.off_eFG,
      off_TOV: m.combined.off_TOV,
      off_ORB: m.combined.off_ORB,
      off_FTR: m.combined.off_FTR,
      def_eFG: m.combined.def_eFG,
      def_TOV: m.combined.def_TOV,
      def_ORB: m.combined.def_ORB,
      def_FTR: m.combined.def_FTR,
    }
    const conv   = convertToEventEPA(coeffs, leagueRates, baselineEP, { modelVariant: 'split' })
    // Check signs using split-model conventions (off predicts ppp, def predicts opp_ppp)
    const offBeta = [0, ...OFF_FEATURES.map(k => m.combined[k])]
    const defBeta = [0, ...DEF_FEATURES.map(k => m.combined[k])]
    const offSigns = checkSigns(offBeta, OFF_FEATURES, SIGN_CONSTRAINTS_OFF)
    const defSigns = checkSigns(defBeta, DEF_FEATURES, SIGN_CONSTRAINTS_DEF)
    const signs    = [...offSigns, ...defSigns]
    return {
      ...m, coefficients: coeffs, eventEPA: conv.values,
      states: conv.states, convMeta: conv.meta, signIssues: signs,
      // Combined in-sample fit against net efficiency for scatter plot
      observations: valid.map((ts, i) => ({
        label: `${ts.school.charAt(0).toUpperCase() + ts.school.slice(1)} ${ts.year}`,
        actual:    +yNet[i].toFixed(2),
        predicted: +(
          m.offModel.beta[0] + OFF_FEATURES.reduce((s, k, j) => s + m.offModel.beta[j+1]*ts[k], 0) -
          (m.defModel.beta[0] + DEF_FEATURES.reduce((s, k, j) => s + m.defModel.beta[j+1]*ts[k], 0))
        ).toFixed(2),
      })),
    }
  })

  // Joint-model sign constraints come from the Phase-0 empirical audit
  // (encodingAudit.js). Previously this dictionary used textbook signs that
  // didn't match the Barttorvik encoding direction — three of eight signs
  // were inverted from what the data actually exhibits.
  const CONSTRAINED_SIGNS = SIGN_CONSTRAINTS
  const constrainedOls = _runModel('constrained_ols', () => {
    const m = fitConstrained(XTrain, yNetTrain, ALL_FEATURES, CONSTRAINED_SIGNS)
    if (m.error) return m  // error envelope handled by _runModel
    const conv = convertToEventEPA(namedCoeffs(m.beta, ALL_FEATURES), leagueRates, baselineEP, { modelVariant: 'joint' })
    const signs = checkSigns(m.beta, ALL_FEATURES, CONSTRAINED_SIGNS)
    // LOO-CV R² so the selected model is comparable to ridge_split's cvR2.
    // n is small (≈32) on Ivy-only training, so refitting NNLS n times is cheap.
    // Skip when training set is large (D1 corpus, n≈1400) — LOO would refit
    // 1400× and the standard error from a single fit on n=1400 is plenty.
    const nObs = yNetTrain.length
    let cvR2 = null
    if (nObs <= 100) {
      const looPreds = new Array(nObs).fill(null)
      for (let i = 0; i < nObs; i++) {
        const trX = XTrain.filter((_, j) => j !== i)
        const trY = yNetTrain.filter((_, j) => j !== i)
        const fold = fitConstrained(trX, trY, ALL_FEATURES, CONSTRAINED_SIGNS)
        if (fold.error || !fold.beta) continue
        looPreds[i] = XTrain[i].reduce((s, v, k) => s + v * fold.beta[k], 0)
      }
      const yMean = yNetTrain.reduce((s, v) => s + v, 0) / nObs
      const ssTot = yNetTrain.reduce((s, v) => s + (v - yMean) ** 2, 0)
      const ssRes = yNetTrain.reduce((s, v, i) =>
        s + (looPreds[i] == null ? 0 : (v - looPreds[i]) ** 2), 0)
      cvR2 = ssTot > 0 ? +(1 - ssRes / ssTot).toFixed(4) : 0
    }
    const yHatApply = distinctTraining ? applyBeta(m.beta) : m.yHat
    return { ...m, coefficients: namedCoeffs(m.beta, ALL_FEATURES), eventEPA: conv.values, states: conv.states, convMeta: conv.meta, signIssues: signs, cvR2, observations: makeObs(yHatApply) }
  })

  // 7. Run diagnostics on joint and split feature sets
  const diagJoint = (() => {
    try {
      return runDiagnostics(XFull, yNet, ALL_FEATURES, ridgeJoint.foldBetas ?? null)
    } catch { return null }
  })()
  const diagOff = (() => {
    try { return runDiagnostics(XOff, yOff, OFF_FEATURES, ridgeSplit.offModel?.foldBetas ?? null) }
    catch { return null }
  })()
  const diagDef = (() => {
    try { return runDiagnostics(XDef, yDef, DEF_FEATURES, ridgeSplit.defModel?.foldBetas ?? null) }
    catch { return null }
  })()

  // 8. Select best model — prefer constrained when sign issues exist
  const splitHasSignIssues = (ridgeSplit.signIssues?.length ?? 0) > 0

  let bestModel
  let selectionReason

  if (!ridgeSplit.error && !splitHasSignIssues) {
    bestModel       = 'ridge_split'
    selectionReason = `Ridge split selected: LOO-CV R² off=${ridgeSplit.offCvR2} def=${ridgeSplit.defCvR2}. ` +
      `All four-factor signs match the Phase-0 empirical audit (see encodingAudit.js).`
  } else if (!constrainedOls.error) {
    bestModel       = 'constrained_ols'
    selectionReason =
      `Constrained OLS selected: ridge split produced ${ridgeSplit.signIssues?.length} sign violation(s) ` +
      `relative to the Phase-0 empirical signs. NNLS enforces the audit-verified directions and is preferred. ` +
      `Ridge split CVR² off=${ridgeSplit.offCvR2} def=${ridgeSplit.defCvR2} available for comparison.`
  } else if (!ridgeSplit.error) {
    bestModel       = 'ridge_split'
    selectionReason = `Ridge split selected as best CV model (${ridgeSplit.cvR2} LOO-R²) — note ${ridgeSplit.signIssues?.length} sign issue(s).`
  } else {
    bestModel       = 'ridge_joint'
    selectionReason = 'Ridge joint selected as fallback (split model failed).'
  }

  messages.push(...(diagJoint?.vifWarnings?.map(w => w.msg) ?? []))

  // 9. Observations for scatter plot from best model
  const bestObservations = ridgeSplit.observations ?? valid.map((ts, i) => ({
    label:     `${ts.school.charAt(0).toUpperCase() + ts.school.slice(1)} ${ts.year}`,
    actual:    +yNet[i].toFixed(2),
    predicted: +((ridgeJoint.beta ?? olsModel.beta ?? []).reduce(
      (s, b, j) => s + b * XFull[i][j], 0
    )).toFixed(2),
  }))

  return {
    status: messages.some(m => m.includes('ERROR')) ? 'warning' : 'ok',
    messages,
    selectedModel: bestModel,
    selectionReason,
    n,                         // apply-set size (typically 32 — Ivy)
    nTrain,                    // training-set size (32 if no separate training, ~1400 for D1)
    distinctTraining,          // true when fit was on a different corpus than apply
    targetMode,
    leagueRates,
    models: {
      ols_joint:       olsModel,
      ridge_joint:     ridgeJoint,
      ridge_split:     ridgeSplit,
      constrained_ols: constrainedOls,
    },
    diagnostics: {
      joint: diagJoint,
      off:   diagOff,
      def:   diagDef,
      n,
      kJoint: ALL_FEATURES.length,
      kSplit: OFF_FEATURES.length,
      obsPerPredictorJoint: +(n / ALL_FEATURES.length).toFixed(1),
      obsPerPredictorSplit: +(n / OFF_FEATURES.length).toFixed(1),
      targetMode,
    },
    // EPA event values come from constrained OLS (theory-correct signs via NNLS).
    // foulDrawn is overlaid from ridge split when NNLS zeros it — off_FTR has a correct positive
    // sign in the split model and NNLS occasionally zeros it due to multicollinearity in the
    // joint 8-predictor model with n=32.
    selectedEventEPA: (() => {
      const base = constrainedOls.eventEPA ?? olsModel.eventEPA
      if (!base) return null
      const epa = { ...base }
      if (epa.foulDrawn === 0 && (ridgeSplit.eventEPA?.foulDrawn ?? 0) > 0)
        epa.foulDrawn = ridgeSplit.eventEPA.foulDrawn
      return epa
    })(),
    selectedStates:    constrainedOls.states   ?? null,
    selectedCoefficients: (
      bestModel === 'constrained_ols' ? namedCoeffs(constrainedOls.beta, ALL_FEATURES) :
      bestModel === 'ridge_split'     ? ridgeSplit.coefficients :
      namedCoeffs(ridgeJoint.beta, ALL_FEATURES)
    ),
    convMeta: (constrainedOls.convMeta ?? ridgeSplit.convMeta ?? ridgeJoint.convMeta ?? null),
    observations: bestObservations,
  }
}

// Helper: turn beta array + feature names into named map
function namedCoeffs(beta, featureNames) {
  if (!beta) return null
  const map = { intercept: beta[0] }
  featureNames.forEach((name, i) => { map[name] = beta[i + 1] })
  return map
}
