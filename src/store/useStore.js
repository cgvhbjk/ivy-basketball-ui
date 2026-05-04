import { create } from 'zustand'

// Matchup Analyzer state. Each team carries an independent year so the
// analyzer can run cross-year hypotheticals (e.g., 2024 Princeton vs 2022 Yale).
const useStore = create((set) => ({
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
