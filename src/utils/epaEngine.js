// Compatibility shim — new code should import from epaModels/index.js directly.
// This file exists so any external consumers that imported from epaEngine.js continue to work.

export { runEPAPipeline as runTier1Regression } from './epaModels/pipeline.js'
export { runTier2Pipeline as runTier2Regression } from './epaModels/tier2.js'
export { estimatePossessions } from './epaModels/tier2.js'
