import { create } from 'zustand'

const useStore = create((set) => ({
  // ---- Comparison Lab ----
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
  analyzerTeamA: 'yale',
  analyzerTeamB: 'princeton',
  analyzerYear: 2025,

  setAnalyzerTeamA: (v) => set({ analyzerTeamA: v }),
  setAnalyzerTeamB: (v) => set({ analyzerTeamB: v }),
  setAnalyzerYear: (v) => set({ analyzerYear: v }),
}))

export default useStore
