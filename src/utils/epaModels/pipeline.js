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

  // 1. Validate
  const validation = validateTeamSeasons(teamSeasons, targetMode)
  messages.push(...validation.warnings)
  if (!validation.ok) {
    return { status: 'error', messages: [...validation.errors, ...messages], models: null }
  }

  // 2. Target columns
  const offTarget = targetMode === 'adjusted' ? FIELD_MAP.adjOE  : FIELD_MAP.rawOE
  const defTarget = targetMode === 'adjusted' ? FIELD_MAP.adjDE  : FIELD_MAP.rawDE

  // 3. Attach named features and filter valid rows
  const enriched = attachFeatures(teamSeasons)
  const allCols  = [...ALL_FEATURES, offTarget, defTarget]
  const valid    = filterValidRows(enriched, allCols)
  const n        = valid.length

  // 4. League rates for EPA conversion
  const leagueRates = computeLeagueRates(teamSeasons)

  // 5. Build matrices
  const { X: XJoint, y: yJoint } = buildMatrix(valid, ALL_FEATURES,  offTarget === FIELD_MAP.rawOE
    ? FIELD_MAP.netRaw : 'net_efficiency')

  // Recalculate y as off - def for the joint model
  const yNet = valid.map(ts => ts[offTarget] - ts[defTarget])

  const { X: XOff, y: yOff } = buildMatrix(valid, OFF_FEATURES, offTarget)
  const { X: XDef, y: yDef } = buildMatrix(valid, DEF_FEATURES, defTarget)

  const XFull = XJoint  // same design matrix, yNet is the target

  // 6. Fit all models
  const makeObs = (yHat) => valid.map((ts, i) => ({
    label: `${ts.school.charAt(0).toUpperCase() + ts.school.slice(1)} ${ts.year}`,
    actual:    +yNet[i].toFixed(2),
    predicted: +yHat[i].toFixed(2),
  }))

  const olsModel = (() => {
    try {
      const m    = fitOLS(XFull, yNet, ALL_FEATURES)
      const conv = convertToEventEPA(namedCoeffs(m.beta, ALL_FEATURES), leagueRates, baselineEP, { modelVariant: 'joint' })
      const signs = checkSigns(m.beta, ALL_FEATURES)
      return { ...m, coefficients: namedCoeffs(m.beta, ALL_FEATURES), eventEPA: conv.values, states: conv.states, convMeta: conv.meta, signIssues: signs, cvR2: null, observations: makeObs(m.yHat) }
    } catch (e) {
      return { error: e.message }
    }
  })()

  const ridgeJoint = (() => {
    try {
      const m    = fitRidgeCV(XFull, yNet, ALL_FEATURES, { alphas: ALPHAS })
      const conv = convertToEventEPA(namedCoeffs(m.beta, ALL_FEATURES), leagueRates, baselineEP, { modelVariant: 'joint' })
      const signs = checkSigns(m.beta, ALL_FEATURES)
      return { ...m, coefficients: namedCoeffs(m.beta, ALL_FEATURES), eventEPA: conv.values, states: conv.states, convMeta: conv.meta, signIssues: signs, observations: makeObs(m.yHat) }
    } catch (e) {
      return { error: e.message }
    }
  })()

  const ridgeSplit = (() => {
    try {
      const m   = fitSplitRidgeCV(XOff, yOff, OFF_FEATURES, XDef, yDef, DEF_FEATURES, { alphas: ALPHAS })
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
    } catch (e) {
      return { error: e.message }
    }
  })()

  // Constrained OLS always uses explicit sign constraints (independent of SIGN_CONSTRAINTS config
  // which is all-0 to avoid false positives in the model comparison table for joint models).
  const CONSTRAINED_SIGNS = {
    off_eFG:  1, off_TOV: -1, off_ORB:  1, off_FTR:  1,
    def_eFG: -1, def_TOV:  1, def_ORB: -1, def_FTR: -1,
  }
  const constrainedOls = (() => {
    try {
      const m    = fitConstrained(XFull, yNet, ALL_FEATURES, CONSTRAINED_SIGNS)
      if (m.error) return { error: m.error }
      const conv = convertToEventEPA(namedCoeffs(m.beta, ALL_FEATURES), leagueRates, baselineEP, { modelVariant: 'joint' })
      const signs = checkSigns(m.beta, ALL_FEATURES, CONSTRAINED_SIGNS)
      return { ...m, coefficients: namedCoeffs(m.beta, ALL_FEATURES), eventEPA: conv.values, states: conv.states, convMeta: conv.meta, signIssues: signs, cvR2: null, observations: makeObs(m.yHat) }
    } catch (e) {
      return { error: e.message }
    }
  })()

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
  const constrainedOk      = !constrainedOls.error && !constrainedOls.beta === null

  let bestModel
  let selectionReason

  if (!ridgeSplit.error && !splitHasSignIssues) {
    bestModel       = 'ridge_split'
    selectionReason = `Ridge split selected: LOO-CV R² off=${ridgeSplit.offCvR2} def=${ridgeSplit.defCvR2}. ` +
      `eFG and FTR signs verified; tov/orb signs unconstrained (Barttorvik encoding direction unverified).`
  } else if (!constrainedOls.error) {
    bestModel       = 'constrained_ols'
    selectionReason =
      `Constrained OLS selected: ridge split has ${ridgeSplit.signIssues?.length} sign issue(s) in ambiguously-encoded Barttorvik fields ` +
      `(tov_o/orb/tov_d/drb directional encoding is unclear). ` +
      `Constrained model enforces theory-consistent signs via NNLS. ` +
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
    n,
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
