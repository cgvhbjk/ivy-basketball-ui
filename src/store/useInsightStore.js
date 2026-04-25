import { create } from 'zustand'

const useInsightStore = create((set) => ({
  // ── Correlation tab ────────────────────────────────────────────────────
  savedInsights: [],
  xVar: 'efg_o',
  yVar: 'win_pct',
  schemeFilter: 'all',
  yearRange: [2022, 2025],

  setXVar:        (v) => set({ xVar: v }),
  setYVar:        (v) => set({ yVar: v }),
  setSchemeFilter:(v) => set({ schemeFilter: v }),
  setYearRange:   (v) => set({ yearRange: v }),

  saveInsight: (insight) => set((s) => ({
    savedInsights: [...s.savedInsights.filter(i => i.id !== insight.id), insight],
  })),
  removeInsight: (id) => set((s) => ({
    savedInsights: s.savedInsights.filter(i => i.id !== id),
  })),

  // ── Scheme Analysis tab ────────────────────────────────────────────────
  // Each item: { id, school, years, cards: [{year, offScheme, defScheme, archetype, winPct, adjoe, adjde, ppp}] }
  savedSchemes: [],
  saveScheme: (item) => set((s) => ({
    savedSchemes: [...s.savedSchemes.filter(i => i.id !== item.id), item],
  })),
  removeScheme: (id) => set((s) => ({
    savedSchemes: s.savedSchemes.filter(i => i.id !== id),
  })),

  // ── Roster & Bio tab ───────────────────────────────────────────────────
  // Each item: { id, type ('archetype'|'physical'), title, body }
  savedRosterFindings: [],
  saveRosterFinding: (item) => set((s) => ({
    savedRosterFindings: [...s.savedRosterFindings.filter(i => i.id !== item.id), item],
  })),
  removeRosterFinding: (id) => set((s) => ({
    savedRosterFindings: s.savedRosterFindings.filter(i => i.id !== id),
  })),
}))

export default useInsightStore
