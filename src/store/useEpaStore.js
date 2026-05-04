import { create } from 'zustand'

// tier1Result is keyed by targetMode because EpaLab fits the raw-PPP pipeline
// (clean coefficients) while LuckLab fits the adjusted target (clean residuals).
// Sharing a single slot was incorrect — whoever ran first wrote the wrong data
// for the other consumer.
const useEpaStore = create((set) => ({
  tier1Result:       { raw: null, adjusted: null },
  tier2Result:       null,
  error:             null,
  ivyOnly:           false,
  activeComparison:  'events',   // 'events' | 'coefficients' | 'scatter'

  setIvyOnly:          (val)    => set({ ivyOnly: val }),
  setActiveComparison: (val)    => set({ activeComparison: val }),
  setTier1Result:      (result, mode = 'raw') => set(s => ({
    tier1Result: { ...s.tier1Result, [mode]: result }
  })),
  setTier2Result:      (result) => set({ tier2Result: result }),
  setError:            (msg)    => set({ error: msg }),
}))

export default useEpaStore
