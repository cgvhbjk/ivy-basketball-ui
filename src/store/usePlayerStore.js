import { create } from 'zustand'

const usePlayerStore = create((set) => ({
  selectedSchool: 'yale',
  selectedYear: 2025,
  selectedPlayer: null,
  compareSchool: 'princeton',
  compareYear: 2025,

  setSelectedSchool: (v) => set({ selectedSchool: v, selectedPlayer: null }),
  setSelectedYear: (v) => set({ selectedYear: v, selectedPlayer: null }),
  setSelectedPlayer: (v) => set({ selectedPlayer: v }),
  setCompareSchool: (v) => set({ compareSchool: v }),
  setCompareYear: (v) => set({ compareYear: v }),

  // Atomic setter for deep-links from MatchupAnalyzer. Plain setSelectedSchool/
  // setSelectedYear each clear selectedPlayer, so the natural three-call sequence
  // would lose the player on the second call. This sets all three together.
  setPlayerFromMatchup: ({ school, year, name }) =>
    set({ selectedSchool: school, selectedYear: year, selectedPlayer: name }),
}))

export default usePlayerStore
