import { create } from 'zustand'

const useStore = create((set) => ({
  // ---- Comparison Lab (hidden, preserved for future reuse) ----
  teamA: 'yale',
  teamB: 'princeton',
  yearRange: [2022, 2025],
  activeMetrics: ['win_pct', 'net_efficiency', 'adjoe', 'adjde', 'efg_o', 'efg_d'],
  labView: 'trend',

  setTeamA: (v) => set({ teamA: v }),
  setTeamB: (v) => set({ teamB: v }),
  setYearRange: (v) => set({ yearRange: v }),
  setActiveMetrics: (v) => set({ activeMetrics: v }),
  setLabView: (v) => set({ labView: v }),

  // ---- Matchup Analyzer ----
  // Each team can now use an independent year for cross-year comparisons
  analyzerTeamA: 'yale',
  analyzerTeamB: 'princeton',
  analyzerYearA: 2025,
  analyzerYearB: 2025,

  setAnalyzerTeamA: (v) => set({ analyzerTeamA: v }),
  setAnalyzerTeamB: (v) => set({ analyzerTeamB: v }),
  setAnalyzerYearA: (v) => set({ analyzerYearA: v }),
  setAnalyzerYearB: (v) => set({ analyzerYearB: v }),
}))

export default useStore
