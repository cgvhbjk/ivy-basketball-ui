import { create } from 'zustand'

const useEpaStore = create((set) => ({
  tier1Result:       null,
  tier2Result:       null,
  error:             null,
  ivyOnly:           false,
  activeComparison:  'events',   // 'events' | 'coefficients' | 'scatter'

  setIvyOnly:          (val)    => set({ ivyOnly: val }),
  setActiveComparison: (val)    => set({ activeComparison: val }),
  setTier1Result:      (result) => set({ tier1Result: result }),
  setTier2Result:      (result) => set({ tier2Result: result }),
  setError:            (msg)    => set({ error: msg }),
}))

export default useEpaStore
