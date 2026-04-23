import { create } from 'zustand'

const useInsightStore = create((set, get) => ({
  savedInsights: [],
  xVar: 'efg_o',
  yVar: 'win_pct',
  schemeFilter: 'all',
  yearRange: [2022, 2025],

  setXVar: (v) => set({ xVar: v }),
  setYVar: (v) => set({ yVar: v }),
  setSchemeFilter: (v) => set({ schemeFilter: v }),
  setYearRange: (v) => set({ yearRange: v }),

  saveInsight: (insight) => set((s) => ({
    savedInsights: [...s.savedInsights.filter(i => i.id !== insight.id), insight],
  })),
  removeInsight: (id) => set((s) => ({
    savedInsights: s.savedInsights.filter(i => i.id !== id),
  })),
}))

export default useInsightStore
